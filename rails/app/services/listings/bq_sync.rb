module Listings
  # BigQuery -> FeedLens ingestion of newly created JE listings (data_marts
  # in project jamesedition-152413).
  #
  # - `call`     : the daily cron path. ES/PT, capped, watermark-driven
  #                (SyncState "bq_listings", bootstrapped to NOW — no backfill).
  # - `test_run` : on-demand harness for trying the pipeline at larger volume
  #                or other countries WITHOUT touching the cron watermark.
  #
  # Both share build_sql / fetch_rows / process_rows so a test exercises the
  # exact production query and engine path. Flag-only: each listing runs
  # through Moderation::Runner with param_scan: false; existing je_ids are
  # skipped, which also makes re-runs idempotent.
  class BqSync
    WATERMARK_KEY = "bq_listings".freeze
    # Per-run cap (Timur, 2026-06-12): each run takes the NEWEST listings in
    # the window — freshest first, no backlog. On days with more than the cap
    # (ES/PT inflow is ~640/day) the older remainder is permanently skipped:
    # the watermark advances past it and the design is no-backfill (cap hit
    # logs a warn). This bounds daily AI spend during the test phase.
    MAX_LISTINGS_PER_RUN = 300
    # Cron scope — widen once volume/cost look good. Listings created outside
    # the scope are not backfilled when it widens (the watermark will already
    # have passed them). `test_run` can target any countries independently.
    COUNTRIES = %w[ES PT].freeze
    # Settle window (Timur, 2026-06-12): only moderate listings created at
    # least this long ago. data_marts child tables lag the parent: images in
    # pg_listing_assets reach 100% coverage only ~24-48h after creation, and
    # descriptions lag too. Moderating fresher listings runs the engine on
    # incomplete data (false few_pictures / low_lqi / short_description, vision
    # can't fetch images). 48h guarantees the child data has synced. Nothing is
    # skipped — fresher listings are simply deferred until they settle.
    SETTLE_HOURS = 48

    class << self
      # Daily cron entry point.
      def call
        unless Integrations::BigqueryClient.configured?
          Rails.logger.info("BQ sync skipped: GOOGLE_APPLICATION_CREDENTIALS not configured")
          return { skipped: true }
        end

        # First run bootstraps the watermark to NOW ("from now", no backfill).
        state = SyncState.find_or_create_by!(key: WATERMARK_KEY) { |s| s.watermark_at = Time.current }

        rows = fetch_rows(since: state.watermark_at, countries: COUNTRIES,
                          limit: MAX_LISTINGS_PER_RUN, settle_hours: SETTLE_HOURS)
        return { error: true } if rows.nil?

        if rows.length >= MAX_LISTINGS_PER_RUN
          Rails.logger.warn("BQ sync: per-run cap #{MAX_LISTINGS_PER_RUN} reached — " \
                            "older settled listings in the window are skipped (newest-first, no backfill)")
        end

        batch_id = "bq-sync-#{Time.current.utc.to_date.iso8601}"
        tally = process_rows(rows, batch_id: batch_id)

        # A fully-failed batch must NOT advance the watermark: the design is
        # no-backfill, so advancing would permanently skip every row.
        if rows.any? && tally[:errors] == rows.length
          Rails.logger.error("BQ sync: all #{tally[:errors]} fetched rows failed — watermark NOT advanced")
          return { error: true, errors: tally[:errors], fetched: rows.length }
        end

        # Advance only to the max listing_created_at actually seen — never to
        # wall-clock now — so data_marts ETL lag and cap truncation can't
        # skip rows. Monotonic guard: a concurrent overlapping run can't move
        # the watermark backwards.
        max_created = rows.filter_map { |r| r[:listing_created_at] }.max
        if max_created
          SyncState.where(key: WATERMARK_KEY)
                   .where("watermark_at < ?", max_created)
                   .update_all(watermark_at: max_created, updated_at: Time.current)
        end

        summary = tally.merge(fetched: rows.length, watermark: state.reload.watermark_at)
        if tally[:errors].positive?
          Rails.logger.warn("BQ sync done with errors: #{summary.inspect}")
        else
          Rails.logger.info("BQ sync done: #{summary.inspect}")
        end
        summary
      end

      # On-demand test harness. Moderates listings from arbitrary countries /
      # volume / window WITHOUT touching the production watermark — for trying
      # the pipeline at larger scale or other markets before widening the cron.
      # Tags rows batch_id "bq-test-<date>" (purge with `rake bq:test_purge`).
      # Mirrors the production path exactly (param_scan: false, same engine),
      # so vision + LLM verification DO run on triggered listings — real
      # Anthropic spend that scales with `limit`. Returns a verbose summary
      # (outcome distribution, fired rules, llm count). Never advances or reads
      # the cron's SyncState.
      def test_run(countries: COUNTRIES, limit: 100, since: 7.days.ago, settle_hours: SETTLE_HOURS)
        unless Integrations::BigqueryClient.configured?
          Rails.logger.info("BQ test_run skipped: GOOGLE_APPLICATION_CREDENTIALS not configured")
          return { skipped: true }
        end

        countries = normalize_countries(countries)
        rows = fetch_rows(since: since, countries: countries, limit: limit, settle_hours: settle_hours)
        return { error: true } if rows.nil?

        batch_id = "bq-test-#{Time.current.utc.to_date.iso8601}"
        tally = process_rows(rows, batch_id: batch_id)

        je_ids = rows.map { |r| r[:listing_id].to_s }
        results = ModerationResult.where(je_id: je_ids)
        fired = results.flat_map { |m| m.rule_matches.map { |rm| rm["ruleName"] } }
                       .tally.sort_by { |_, n| -n }.first(15).to_h

        summary = tally.merge(
          fetched: rows.length,
          countries: countries,
          limit: limit.to_i,
          batch_id: batch_id,
          outcomes: Listing.where(je_id: je_ids).group(:moderation_status).count,
          llm_triggered: results.where(llm_triggered: true).count,
          fired_rules: fired
        )
        Rails.logger.info("BQ test_run done: #{summary.except(:fired_rules).inspect}")
        summary
      end

      private

      # Per-row create + moderate loop shared by call and test_run. Returns
      # { created:, skipped:, errors: }. One bad row never kills the batch.
      def process_rows(rows, batch_id:)
        created = 0
        skipped = 0
        errors = 0
        now_ms = (Time.current.to_f * 1000).to_i

        rows.each do |row|
          je_id = row[:listing_id].to_s
          begin
            if Listing.exists?(je_id: je_id)
              skipped += 1
              next
            end

            listing = Listing.create!(BqListingMapper.call(row, batch_id: batch_id, imported_at: now_ms))
            Moderation::Runner.call(listing, param_scan: false)
            created += 1
          rescue StandardError => e
            errors += 1
            Rails.logger.error("BQ sync: listing #{je_id} failed: #{e.class}: #{e.message}")
          end
        end

        { created: created, skipped: skipped, errors: errors }
      end

      def fetch_rows(since:, countries:, limit:, settle_hours:)
        Integrations::BigqueryClient.query(
          build_sql(countries: countries, limit: limit),
          params: { since: since, ceiling: settle_hours.to_i.hours.ago }
        )
      rescue StandardError => e
        Rails.logger.error("BQ sync: query failed, watermark untouched: #{e.class}: #{e.message}")
        nil
      end

      # ISO alpha country codes only (letters), so the interpolation below
      # can never carry a SQL-breaking value regardless of caller input.
      def normalize_countries(countries)
        safe = Array(countries).map { |c| c.to_s.upcase.gsub(/[^A-Z]/, "") }.reject(&:empty?).uniq
        safe.presence || COUNTRIES
      end

      def build_sql(countries:, limit:)
        country_list = normalize_countries(countries).map { |c| "'#{c}'" }.join(", ")
        limit_n = [ limit.to_i, 1 ].max

        <<~SQL
          WITH batch AS (
            SELECT
              l.listing_id, l.listing_created_at, l.headline,
              l.price_cents, l.price_cents_usd, l.currency, l.price_on_request,
              l.type, l.country_code, l.country_subdivision, l.city,
              l.rental, l.pre_owned, l.year, l.outdated, l.office_id, l.source
            FROM `jamesedition-152413.data_marts.pg_listings` l
            WHERE l.datetime_to IS NULL
              AND l.active = TRUE
              AND l.listing_deleted_at IS NULL
              AND l.draft IS NOT TRUE
              AND l.type IN ('Listing::RealEstateListing', 'Listing::CarListing')
              AND l.country_code IN (#{country_list})
              AND l.listing_created_at > @since
              AND l.listing_created_at <= @ceiling
            ORDER BY l.listing_created_at DESC
            LIMIT #{limit_n}
          ),
          images AS (
            SELECT
              a.listing_id,
              COUNT(*) AS image_count,
              AVG(SAFE_CAST(a.source_width AS FLOAT64)) AS avg_image_width,
              AVG(SAFE_CAST(a.source_height AS FLOAT64)) AS avg_image_height,
              ARRAY_AGG(a.url ORDER BY a.sort_order LIMIT 40) AS image_urls
            FROM `jamesedition-152413.data_marts.pg_listing_assets` a
            WHERE a.type = 'Listing::Asset::Image'
              AND a.deleted_at IS NULL
              AND a.url IS NOT NULL
              AND a.listing_id IN (SELECT listing_id FROM batch)
            GROUP BY a.listing_id
          )
          SELECT
            b.*,
            d.description,
            re.bedrooms, re.bathrooms, re.living_area, re.land_area, re.real_estate_type,
            o.name AS office_name, o.account_type AS office_subscription,
            SAFE_CAST(o.group_id AS INT64) AS office_group_id,
            lqs.score AS lqi_score,
            i.image_count, i.avg_image_width, i.avg_image_height, i.image_urls
          FROM batch b
          LEFT JOIN `jamesedition-152413.data_marts.pg_listings_descriptions` d USING (listing_id)
          LEFT JOIN `jamesedition-152413.data_marts.pg_real_estates` re USING (listing_id)
          LEFT JOIN (
            SELECT office_id, name, account_type, group_id
            FROM `jamesedition-152413.data_marts.pg_offices`
            WHERE datetime_to IS NULL
          ) o ON o.office_id = b.office_id
          LEFT JOIN `jamesedition-152413.data_marts.listing_quality_score` lqs USING (listing_id)
          LEFT JOIN images i USING (listing_id)
          ORDER BY b.listing_created_at DESC
        SQL
      end
    end
  end
end
