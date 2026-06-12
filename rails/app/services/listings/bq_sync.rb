module Listings
  # Daily BigQuery -> FeedLens ingestion of newly created JE listings
  # (data_marts in project jamesedition-152413). Watermarked on
  # listing_created_at (SyncState "bq_listings", bootstrapped to NOW on the
  # first run — no backfill). Flag-only: each new listing runs through
  # Moderation::Runner with param_scan: false; existing je_ids are skipped,
  # which also makes re-runs after a mid-batch failure idempotent.
  class BqSync
    WATERMARK_KEY = "bq_listings".freeze
    MAX_LISTINGS_PER_RUN = 10_000 # daily new-listing volume is ~7,400 worldwide
    # Initial rollout scope — widen once volume/cost look good. Listings
    # created outside the scope are not backfilled when it widens (the
    # watermark will already have passed them).
    COUNTRIES = %w[ES PT].freeze

    SQL = <<~SQL.freeze
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
          AND l.country_code IN (#{COUNTRIES.map { |c| "'#{c}'" }.join(", ")})
          AND l.listing_created_at > @watermark
        ORDER BY l.listing_created_at
        LIMIT #{MAX_LISTINGS_PER_RUN}
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
      ORDER BY b.listing_created_at
    SQL

    class << self
      def call
        unless Integrations::BigqueryClient.configured?
          Rails.logger.info("BQ sync skipped: GOOGLE_APPLICATION_CREDENTIALS not configured")
          return { skipped: true }
        end

        # First run bootstraps the watermark to NOW ("from now", no backfill).
        state = SyncState.find_or_create_by!(key: WATERMARK_KEY) { |s| s.watermark_at = Time.current }

        rows = fetch_rows(state.watermark_at)
        return { error: true } if rows.nil?

        if rows.length >= MAX_LISTINGS_PER_RUN
          Rails.logger.warn("BQ sync: per-run cap #{MAX_LISTINGS_PER_RUN} reached — " \
                            "batch truncated; remainder picked up next run")
        end

        created = 0
        skipped = 0
        errors = 0
        batch_id = "bq-sync-#{Time.current.utc.to_date.iso8601}"
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

        # A fully-failed batch must NOT advance the watermark: the design is
        # no-backfill, so advancing would permanently skip every row.
        if rows.any? && errors == rows.length
          Rails.logger.error("BQ sync: all #{errors} fetched rows failed — watermark NOT advanced")
          return { error: true, errors: errors, fetched: rows.length }
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

        summary = { created: created, skipped: skipped, errors: errors,
                    fetched: rows.length, watermark: state.reload.watermark_at }
        if errors.positive?
          Rails.logger.warn("BQ sync done with errors: #{summary.inspect}")
        else
          Rails.logger.info("BQ sync done: #{summary.inspect}")
        end
        summary
      end

      private

      def fetch_rows(watermark)
        Integrations::BigqueryClient.query(SQL, params: { watermark: watermark })
      rescue StandardError => e
        Rails.logger.error("BQ sync: query failed, watermark untouched: #{e.class}: #{e.message}")
        nil
      end
    end
  end
end
