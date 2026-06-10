require "net/http"
require "json"

module Listings
  # Port of the JE data-source client in convex/fetchListing.ts:
  # mobile API -> search API -> HTML scrape fallback chain, plus the
  # European-aware price parsing and location/area normalization.
  class JeClient
    BASE_URL = "https://www.jamesedition.com".freeze
    USER_AGENT = "FeedLens/1.0".freeze
    HTML_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36".freeze
    OPEN_TIMEOUT = 10
    READ_TIMEOUT = 30

    CURRENCY_SYMBOLS = { "$" => "USD", "€" => "EUR", "£" => "GBP" }.freeze

    # Strip property type prefixes like "House in ", "Villa in " from
    # location strings.
    PROPERTY_TYPE_PREFIX_RE = /\A(House|Apartment|Villa|Penthouse|Land|Estate|Condo|Office|Studio|Townhouse|Other|Plot|Chalet|Castle|Farm|Mansion|Duplex|Loft|Bungalow|Cottage|Ranch)\s+in\s+/i

    # Country/region resolution for vision gating — replicates the
    # resolveCountryCode maps in convex/fetchListing.ts.
    COUNTRY_NAME_TO_CODE_MAP = {
      "spain" => "ES", "italy" => "IT", "portugal" => "PT", "france" => "FR", "greece" => "GR",
      "united states" => "US", "usa" => "US", "united kingdom" => "UK", "uk" => "UK",
      "germany" => "DE", "austria" => "AT", "switzerland" => "CH", "netherlands" => "NL",
      "belgium" => "BE", "sweden" => "SE", "norway" => "NO", "denmark" => "DK", "finland" => "FI",
      "ireland" => "IE", "croatia" => "HR", "turkey" => "TR", "cyprus" => "CY", "malta" => "MT",
      "monaco" => "MC", "luxembourg" => "LU", "montenegro" => "ME",
      "united arab emirates" => "AE", "uae" => "AE", "thailand" => "TH",
      "australia" => "AU", "canada" => "CA", "mexico" => "MX", "brazil" => "BR",
      "south africa" => "ZA", "morocco" => "MA", "russia" => "RU", "china" => "CN", "india" => "IN"
    }.freeze
    REGION_TO_CODE_MAP = {
      "algarve" => "PT", "lisbon" => "PT", "madeira" => "PT", "azores" => "PT", "porto" => "PT",
      "balearic islands" => "ES", "andalusia" => "ES", "catalonia" => "ES", "canary islands" => "ES",
      "valencia" => "ES", "galicia" => "ES", "basque country" => "ES",
      "tuscany" => "IT", "sardinia" => "IT", "sicily" => "IT", "lombardy" => "IT", "lazio" => "IT",
      "puglia" => "IT", "liguria" => "IT", "umbria" => "IT", "veneto" => "IT", "campania" => "IT",
      "provence-alpes-côte d'azur" => "FR", "île-de-france" => "FR", "corsica" => "FR",
      "brittany" => "FR", "normandy" => "FR", "occitanie" => "FR",
      "crete" => "GR", "peloponnese" => "GR", "attica" => "GR", "cyclades" => "GR",
      "florida" => "US", "california" => "US", "new york" => "US", "texas" => "US",
      "dubai" => "AE", "abu dhabi" => "AE"
    }.freeze

    class << self
      # Cascading fetch: mobile API -> search API -> HTML scrape.
      # Returns { data:, source: } with snake_case keys, or nil if all fail.
      def fetch_listing(je_id, url: nil)
        data = fetch_from_mobile_api(je_id)
        return { data: data, source: "mobile_api" } if data

        data = fetch_from_search_api(je_id)
        return { data: data, source: "search_api" } if data

        data = fetch_from_html(je_id, url || "#{BASE_URL}/listing/#{je_id}")
        return { data: data, source: "html_scrape" } if data

        nil
      end

      # ─── Mobile API (primary source) ──────────────────────────────────
      def fetch_from_mobile_api(je_id)
        response = http_get("#{BASE_URL}/api/mobile/v1/listings/#{je_id}",
                            headers: { "Accept" => "application/json", "User-Agent" => USER_AGENT })
        return nil unless response&.code == "200"

        listing = JSON.parse(response.body)["listing"]
        return nil unless listing

        parsed = parse_mobile_api_price(listing["price"].to_s)
        price_on_request = listing["price_on_request"] || false

        location_source = js_or(listing["location_name"], listing["humanized_location"])
        location = parse_location(location_source.to_s, listing["address"].to_s)

        bedrooms = listing["bedrooms"].is_a?(Numeric) ? listing["bedrooms"] : nil
        bathrooms = parse_numeric_value(listing["bathrooms"])
        living_area = parse_living_area(listing["living_area"])
        lot_size_value = listing.dig("lot_size", "value")
        land_area = lot_size_value.is_a?(Numeric) && !lot_size_value.zero? ? lot_size_value.round : nil

        all_images = Array(listing["images"]) + Array(listing["floor_plan_images"])
        description = listing["description"]

        {
          je_id: je_id,
          title: presence(listing["headline"]) || "Listing #{je_id}",
          price: parsed&.dig(:price),
          currency: parsed&.dig(:currency),
          price_on_request: price_on_request ? true : nil,
          category: "real_estate",
          real_estate_type: presence(listing["property_type"]),
          country: location[:country],
          city: location[:city],
          state: location[:state],
          bedrooms: bedrooms,
          bathrooms: bathrooms,
          living_area: living_area,
          land_area: land_area && land_area.positive? ? land_area : nil,
          image_count: all_images.empty? ? nil : all_images.length,
          image_urls: all_images.empty? ? nil : all_images.first(30),
          description_length: description&.length,
          description: description&.slice(0, 5000),
          office: presence(listing["office_name"]),
          listing_url: presence(listing["url"]) || "#{BASE_URL}/real_estate/#{je_id}",
          raw_data: {
            "source" => "mobile_api",
            "latitude" => listing["latitude"],
            "longitude" => listing["longitude"],
            "listedAt" => listing["listed_at"],
            "updatedAt" => listing["updated_at"],
            "views" => listing["views"],
            "saves" => listing["saves"],
            "yearBuilt" => listing["year_built"],
            "hasVideo" => listing["has_video"],
            "hasVirtualTour" => listing["has_virtual_tour"],
            "officeListingsCount" => listing["office_listings_count"],
            "listingReference" => listing["listing_reference"],
            "isActive" => listing["is_active"]
          }
        }
      rescue StandardError
        nil
      end

      # ─── Search API (fallback for 500s from the single-listing API) ───
      def fetch_from_search_api(je_id)
        response = http_get("#{BASE_URL}/api/mobile/v1/listings?listing_id=#{je_id}",
                            headers: { "Accept" => "application/json", "User-Agent" => USER_AGENT })
        return nil unless response&.code == "200"

        listings = JSON.parse(response.body)["listings"]
        return nil unless listings.is_a?(Array) && !listings.empty?

        listing = listings.first
        return nil unless listing && listing["listing_id"].to_i == je_id.to_i

        price_str = listing["price"].to_s
        price_on_request = price_str == "P.O.R." || price_str.downcase.include?("request")
        parsed = price_on_request ? nil : parse_mobile_api_price(price_str)

        location = parse_location(listing["humanized_location"].to_s, "")
        type_match = listing["humanized_location"].to_s.match(/\A(\w+)\s+in\s+/i)

        all_images = Array(listing["images"])

        {
          je_id: je_id,
          title: presence(listing["headline"]) || "Listing #{je_id}",
          price: parsed&.dig(:price),
          currency: parsed&.dig(:currency),
          price_on_request: price_on_request ? true : nil,
          category: "real_estate",
          real_estate_type: type_match && type_match[1],
          country: location[:country],
          city: location[:city],
          state: location[:state],
          bedrooms: parse_numeric_value(listing["bedrooms"]),
          bathrooms: parse_numeric_value(listing["bathrooms"]),
          living_area: parse_living_area(listing["living_area"]),
          image_count: all_images.empty? ? nil : all_images.length,
          image_urls: all_images.empty? ? nil : all_images.first(30),
          office: presence(listing["office_name"]),
          listing_url: "#{BASE_URL}/listing/#{je_id}",
          raw_data: {
            "source" => "search_api",
            "isNew" => listing["is_new"],
            "hasVideo" => listing["has_video"],
            "hasVirtualTour" => listing["has_virtual_tour"],
            "available" => listing["available"]
          }
        }
      rescue StandardError
        nil
      end

      # ─── HTML scrape (last data-bearing fallback) ─────────────────────
      def fetch_from_html(je_id, url)
        response = http_get(url, headers: {
          "User-Agent" => HTML_USER_AGENT,
          "Accept" => "text/html,application/xhtml+xml"
        }, follow_redirects: true)
        return nil unless response&.code == "200"

        html = response.body.to_s
        return nil if html.include?("Just a moment") || html.include?("cf-browser-verification")

        product = extract_ld_json(html).find { |d| d["@type"] == "Product" }
        return nil unless product

        og_title = extract_meta(html, "og:title")
        page_title = html[%r{<title[^>]*>([^<]+)</title>}i, 1]&.strip
        title = js_or(og_title, product["name"], page_title, "Listing #{je_id}")

        price = nil
        currency = nil
        description = nil
        image_urls = []

        offers = product["offers"]
        if offers.is_a?(Hash) && truthy(offers["price"])
          price = offers["price"].is_a?(String) ? js_parse_float(offers["price"]) : offers["price"]
          currency = js_or(offers["priceCurrency"], "USD")
        end
        description = product["description"]
        image_urls = product["image"] if product["image"].is_a?(Array)

        description = extract_meta(html, "og:description") unless truthy(description)

        html_imgs = html.scan(%r{https://img\.jamesedition\.com/listing_images/[^"'\s>)\\,]+})
                        .map { |u| u.gsub("&amp;", "&") }.uniq
        image_urls = html_imgs if html_imgs.length > image_urls.length

        body_text = html.gsub(/<[^>]+>/, " ").gsub(/\s+/, " ")
        beds_match = body_text.match(/(\d+)\s*Beds?/i)
        baths_match = body_text.match(/(\d+)\s*Baths?/i)
        sqm_match = body_text.match(/([\d,]+)\s*(?:Sq\.?\s*[Mm]|m²)/)
        sqft_match = body_text.match(/([\d,]+)\s*Sqft/i)

        living_area =
          if sqm_match
            sqm_match[1].delete(",").to_i
          elsif sqft_match
            (sqft_match[1].delete(",").to_i * 0.0929).round
          end

        {
          je_id: je_id,
          title: title.to_s.sub(/\s*\|\s*JamesEdition\z/, "").strip,
          price: price,
          currency: currency,
          category: "real_estate",
          bedrooms: beds_match && beds_match[1].to_i,
          bathrooms: baths_match && baths_match[1].to_i,
          living_area: living_area,
          image_count: image_urls.empty? ? nil : image_urls.length,
          image_urls: image_urls.empty? ? nil : image_urls.first(30),
          description_length: description&.length,
          description: description&.slice(0, 5000),
          listing_url: url,
          raw_data: { "source" => "html_scrape", "ldJson" => product }
        }
      rescue StandardError
        nil
      end

      # ─── Listing info for per-image vision analysis ────────────────────
      # Port of fetchListingInfo in convex/imageRecognitionActions.ts.
      # Returns a camelCase ListingInfo hash or nil.
      def fetch_listing_info(je_id)
        info = listing_info_from_mobile_api(je_id)
        return info if info

        listing_info_from_search_api(je_id)
      end

      # ─── Price parsing (port of parseMobileApiPrice) ──────────────────
      # Handles "$1,200,000", "€950,000", "£2,500,000", "1.200.000 €",
      # mixed-separator detection and European-thousands-only formats.
      def parse_mobile_api_price(price_str)
        return nil unless truthy(price_str)

        price_str = ensure_utf8(price_str.to_s)
        m = price_str.match(/([€$£])\s*([\d,.\s]+)/) || price_str.match(/([\d,.\s]+)\s*([€$£])/)
        return nil unless m

        sym_idx = m[1].match(/[€$£]/) ? 1 : 2
        num_idx = sym_idx == 1 ? 2 : 1
        sym = m[sym_idx].strip
        num_str = m[num_idx].strip

        if num_str.include?(",") && num_str.include?(".")
          # $1,200,000.00 or €1.200.000,00
          num_str =
            if num_str.rindex(",") > num_str.rindex(".")
              num_str.delete(".").sub(",", ".") # European
            else
              num_str.delete(",") # US
            end
        elsif num_str.match?(/\A\d{1,3}(\.\d{3})+\z/)
          # European thousands separators only: 1.200.000 -> 1200000.
          num_str = num_str.delete(".")
        else
          num_str = num_str.gsub(/[,\s]/, "")
        end

        price = js_parse_float(num_str)
        return nil if price.nil?

        { price: price, currency: CURRENCY_SYMBOLS[sym] || "USD" }
      end

      # Port of parseNumericValue: first [\d,.\s]+ run, strip commas/spaces,
      # then JS parseInt semantics (stops at the first non-digit).
      def parse_numeric_value(str)
        return nil unless truthy(str)

        m = str.to_s[/([\d,.\s]+)/, 1]
        return nil unless m

        digits = m.gsub(/[,\s]/, "")[/\A\d+/]
        digits&.to_i
      end

      # Port of parseLivingArea: sqft -> sqm conversion.
      def parse_living_area(str)
        return nil unless truthy(str)

        num = parse_numeric_value(str)
        return nil if num.nil?
        return (num * 0.0929).round if str.to_s.match?(/sqft/i)

        num
      end

      # Port of parseLocation (strips property-type prefixes first).
      def parse_location(humanized, address)
        raw = js_or(humanized, address, "")
        loc = raw.to_s.sub(PROPERTY_TYPE_PREFIX_RE, "")
        parts = loc.split(",").map(&:strip).reject(&:empty?)
        if parts.length >= 2
          {
            country: parts.last,
            state: parts.length >= 3 ? parts[-2] : nil,
            city: parts.first
          }
        elsif parts.length == 1
          { country: parts.first }
        else
          {}
        end
      end

      # Port of resolveCountryCode in convex/fetchListing.ts (vision gating).
      def resolve_country_code(country)
        return "" unless truthy(country)

        trimmed = country.to_s.strip
        lower = trimmed.downcase
        return trimmed.upcase if trimmed.match?(/\A[A-Za-z]{2}\z/)
        return COUNTRY_NAME_TO_CODE_MAP[lower] if COUNTRY_NAME_TO_CODE_MAP[lower]
        return REGION_TO_CODE_MAP[lower] if REGION_TO_CODE_MAP[lower]

        trimmed.upcase
      end

      private

      def listing_info_from_mobile_api(je_id)
        response = http_get("#{BASE_URL}/api/mobile/v1/listings/#{je_id}",
                            headers: { "Accept" => "application/json", "User-Agent" => USER_AGENT })
        return nil unless response&.code == "200"

        listing = JSON.parse(response.body)["listing"]
        return nil unless listing

        parsed = parse_mobile_api_price(listing["price"].to_s)
        loc = js_or(listing["location_name"], listing["humanized_location"], "").to_s.sub(PROPERTY_TYPE_PREFIX_RE, "")
        parts = loc.split(",").map(&:strip).reject(&:empty?)
        all_images = Array(listing["images"]) + Array(listing["floor_plan_images"])
        type_match = listing["humanized_location"].to_s.match(PROPERTY_TYPE_PREFIX_RE)

        {
          "jeId" => je_id,
          "title" => js_or(listing["headline"], "Listing #{je_id}"),
          "listingUrl" => js_or(listing["url"], "#{BASE_URL}/listing/#{je_id}"),
          "price" => parsed&.dig(:price),
          "currency" => parsed&.dig(:currency),
          "country" => parts.length >= 2 ? parts.last : parts.first,
          "city" => parts.length >= 2 ? parts.first : nil,
          "state" => parts.length >= 3 ? parts[-2] : nil,
          "realEstateType" => type_match ? type_match[1] : presence(listing["property_type"]),
          "bedrooms" => listing["bedrooms"].is_a?(Numeric) ? listing["bedrooms"] : nil,
          "bathrooms" => parse_numeric_value(listing["bathrooms"]),
          "livingArea" => parse_living_area(listing["living_area"]),
          "office" => presence(listing["office_name"]),
          "totalImages" => all_images.length,
          "imageUrls" => all_images
        }
      rescue StandardError
        nil
      end

      def listing_info_from_search_api(je_id)
        response = http_get("#{BASE_URL}/api/mobile/v1/listings?listing_id=#{je_id}",
                            headers: { "Accept" => "application/json", "User-Agent" => USER_AGENT })
        return nil unless response&.code == "200"

        listings = JSON.parse(response.body)["listings"]
        return nil unless listings.is_a?(Array) && !listings.empty?

        listing = listings.first
        parsed = parse_mobile_api_price(listing["price"].to_s)
        loc = listing["humanized_location"].to_s.sub(PROPERTY_TYPE_PREFIX_RE, "")
        parts = loc.split(",").map(&:strip).reject(&:empty?)
        type_match = listing["humanized_location"].to_s.match(PROPERTY_TYPE_PREFIX_RE)

        {
          "jeId" => je_id,
          "title" => js_or(listing["headline"], "Listing #{je_id}"),
          "listingUrl" => "#{BASE_URL}/listing/#{je_id}",
          "price" => parsed&.dig(:price),
          "currency" => parsed&.dig(:currency),
          "country" => parts.length >= 2 ? parts.last : parts.first,
          "city" => parts.length >= 2 ? parts.first : nil,
          "state" => nil,
          "realEstateType" => type_match ? type_match[1] : nil,
          "bedrooms" => parse_numeric_value(listing["bedrooms"]),
          "bathrooms" => parse_numeric_value(listing["bathrooms"]),
          "livingArea" => parse_living_area(listing["living_area"]),
          "office" => presence(listing["office_name"]),
          "totalImages" => Array(listing["images"]).length,
          "imageUrls" => Array(listing["images"])
        }
      rescue StandardError
        nil
      end

      def extract_ld_json(html)
        html.scan(%r{<script\s+type\s*=\s*["']application/ld\+json["']\s*>([\s\S]*?)</script>}i).filter_map do |(json)|
          JSON.parse(json)
        rescue JSON::ParserError
          nil
        end
      end

      def extract_meta(html, property)
        html[/<meta\s+property=["']#{Regexp.escape(property)}["']\s+content=["']([^"']+)["']/i, 1] ||
          html[/<meta\s+content=["']([^"']+)["']\s+property=["']#{Regexp.escape(property)}["']/i, 1]
      end

      def http_get(url, headers: {}, follow_redirects: false, redirect_limit: 5)
        uri = URI(url)
        response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                   open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT) do |http|
          request = Net::HTTP::Get.new(uri)
          headers.each { |k, v| request[k] = v }
          http.request(request)
        end

        if follow_redirects && response.is_a?(Net::HTTPRedirection) && redirect_limit.positive? && response["location"]
          location = URI.join(url, response["location"]).to_s
          return http_get(location, headers: headers, follow_redirects: true, redirect_limit: redirect_limit - 1)
        end

        response
      rescue StandardError
        nil
      end

      # Currency symbols are multi-byte: binary-encoded inputs (e.g. raw
      # HTTP bodies) must be reinterpreted as UTF-8 before regexp matching.
      def ensure_utf8(str)
        return str if str.encoding == Encoding::UTF_8

        forced = str.dup.force_encoding(Encoding::UTF_8)
        forced.valid_encoding? ? forced : str.encode(Encoding::UTF_8, invalid: :replace, undef: :replace)
      end

      # JS parseFloat: leading float, NaN -> nil.
      def js_parse_float(value)
        s = value.to_s.strip[/\A[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/]
        s&.to_f
      end

      def js_or(*values)
        Moderation::JsCompat.js_or(*values)
      end

      def truthy(value)
        Moderation::JsCompat.js_truthy?(value)
      end

      def presence(value)
        truthy(value) ? value : nil
      end
    end
  end
end
