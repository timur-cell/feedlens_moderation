require "net/http"
require "json"
require "base64"

module Ai
  # Port of convex/imageRecognitionActions.ts: Claude vision analysis of
  # listing images (with the GPT-4o URL-based path as fallback provider),
  # defensive response parsing and per-listing image analysis by URL.
  class VisionAnalyzer
    DEFAULT_PROVIDER = "claude".freeze

    MODELS = {
      "openai" => "gpt-4o",
      "claude" => "claude-haiku-4-5-20251001"
    }.freeze

    # The exact prompt from JE's ConditionRecognizer (verbatim from the TS).
    JE_CONDITION_PROMPT = <<~PROMPT.chomp.freeze
      We are a global luxury real estate portal, our goal is to improve the quality of listings on the platform by cleaning and lowering down in search inappropriate and low-quality listings.
      Please rate the following attributes for the given image: [property_condition, watermark_share, watermark_size, watermark_text, image_quality, image_type, image_type_confidence, conclusion]

      Here's a legend and explanation of the attributes:
      property_condition:
      - 6: Luxury property – this property exceeds the highest standards of comfort and elegance, featuring exceptional design, premium materials, and state-of-the-art amenities. It represents the pinnacle of luxury living, offering an unparalleled experience.
      - 5: Excellent – the property is in near-perfect condition with high-quality finishes and updates. It has been meticulously maintained and shows minimal to no wear, ensuring a superior living environment.
      - 4: Good – this property is well-maintained and in good condition, with some signs of normal wear. It may benefit from minor updates or cosmetic improvements but it is overall a comfortable and appealing space.
      - 3: Average – the property is in average condition, showing signs of wear and use. It may require some repairs and updates to meet current standards but remains functional and habitable.
      - 2: Poor – this property requires significant repairs and updates. It shows extensive wear and may have issues that need immediate attention to make it livable.
      - 1: Disrepair – the property is in a state of neglect and requires extensive repairs or complete renovation. It is likely not habitable in its current condition and may represent a significant investment to restore.
      - Unidentifiable: It is hard to determine the condition of the property or the property is not shown in the images.

      watermark_share: (0 to 10) number of accessed watermarked images related to a specific listing ID

      watermark_size:
      - 1: XXL – a watermark that covers the entire image, offering the highest level of protection. Coverage: 50-100% of the image area.
      - 2: XL - these watermarks are designed to be very noticeable and cover a significant portion of the image, making unauthorized use difficult. Coverage: 25-50% of the image area.
      - 3: L – a watermark that balances visibility with subtlety. Coverage: 10-25% of the image area.
      - 4: M – slightly more visible than the minimal coverage. Coverage: 5-10% of the image area.
      - 5: S – Small watermarking that covers a very small portion. Coverage: Up to 5% of the image area.
      - 6: No watermarks present

      watermark_text:
      - Collect all words from watermarks, separated with comma. Leave empty if no text found.

      image_quality:
      - poor: The image quality is poor enough to make it difficult or impossible to determine the photo's content accurately.
      - low: The image has low quality, with some content being identifiable, but it suffers from significant flaws.
      - moderate: The image is good enough to be used but has issues that impact how clearly its content can be seen.
      - high: The image is of high quality with minor issues that do not significantly detract from its overall utility.
      - professional: The image has a professional-like quality with no negative issues.
      - visualization: Digitally created or rendered image of the property.

      image_type:
      - AI-generated: Fully synthetic visuals (diffusion models, GANs, or AI-tools). Signs: unrealistic lighting, distorted hands/objects, mismatched reflections, "too perfect" patterns, odd artifacts. Even if only partially AI-modified, treat the entire listing as AI-generated.
      - Render (3D / CGI): Non-photographic computer-generated renderings, architectural visualizations, or staging done via 3D modeling software. Signs: clean sterile lines, uniform/global lighting, flat surfaces without natural imperfections.
      - Real photo: Authentic photographs taken with a camera. Natural imperfections are present.

      Decision Rules for image type:
      - Analyze the entire batch of images per listing.
      - If there is any evidence of AI-generated or AI-modified content in one or more images, classify the listing as "AI-generated".
      - If the majority of images are clearly 3D renders and no AI artifacts are found, classify as "Render (3D / CGI)".
      - Only classify as "Real photo" if all images appear authentic, unmodified, and free of AI/CGI characteristics.
      - Output must be strict: only one category is allowed per listing.
      - Be conservative — when uncertain, default toward "AI-generated" or "Render (3D / CGI)", never toward "Real photo".

      image_type_confidence:
      - A number from 1 to 100 expressing how confident you are in the selected image_type classification.

      conclusion: Rate how good this property is for the global premium & luxury residential real estate portal from 1 to 6 (decimal). Where: 6 is the best for the premium & luxury portal, and 1 means completely unsuitable.

      Respond with a valid RFC-8259 complaint JSON, compressed, without formatting and without ```json prefix:
      {
        "property_condition": 1.0 to 6.0,
        "watermark_size": 1.0 to 6.0,
        "watermark_share": 0 to 10,
        "watermark_text": "Words from all watermarks separated with comma",
        "image_quality": "High" or any other mentioned in the legend,
        "image_type": "AI-generated" or any other mentioned in the legend,
        "image_type_confidence": 1 to 100,
        "conclusion": 1.0 to 6.0
      }
    PROMPT

    # Claude's vision API rejects anything else (e.g. image/bmp) with a 400,
    # which would fail the whole multi-image request.
    CLAUDE_SUPPORTED_MEDIA_TYPES = %w[image/jpeg image/png image/gif image/webp].freeze

    EMPTY_RESULT = {
      "property_condition" => nil, "conclusion" => nil, "watermark_share" => nil,
      "watermark_size" => nil, "watermark_text" => nil, "image_quality" => nil,
      "image_type" => nil, "image_type_confidence" => nil, "unidentifiable" => false,
      "model" => "none", "llm" => "none", "input_tokens" => 0, "output_tokens" => 0
    }.freeze

    QUALITY_ORDER = %w[poor low moderate high professional visualization].freeze
    TYPE_ORDER = [ "AI-generated", "Render (3D / CGI)", "Real photo" ].freeze
    NUMERIC_AVERAGE_FIELDS = %w[property_condition conclusion watermark_share watermark_size image_type_confidence].freeze

    TYPE_PREFIX_RE = /\A(House|Apartment|Villa|Penthouse|Land|Estate|Condo|Office|Studio|Townhouse|Other|Plot|Chalet|Castle|Farm|Mansion|Duplex|Loft|Bungalow|Cottage|Ranch)\s+in\s+/i

    IMAGE_FETCH_TIMEOUT = 15
    LISTING_BATCH_SIZE = 5

    class << self
      # Port of analyzeForModeration / analyzeImagesFromUrls. Returns the
      # VisionResult hash (string keys, same fields as the TS interface).
      # Unfetchable / unsupported-format images are skipped, never fatal.
      def analyze(image_urls:, title:, je_id: nil, provider: nil)
        provider = provider == "openai" ? "openai" : DEFAULT_PROVIDER
        urls = Array(image_urls)
        return EMPTY_RESULT.merge("error" => "No image URLs provided") if urls.empty?

        max_images = max_images_per_scan
        result =
          begin
            if provider == "openai"
              # OpenAI: send URLs directly — same as JE's condition_recognizer.rb
              raw = call_openai(urls.first(max_images))
              parse_vision_response(raw[:raw_text], raw[:model], provider, raw[:input_tokens], raw[:output_tokens])
            else
              # Claude requires base64
              images = fetch_images_as_base64(urls, max_images)
              if images.empty?
                EMPTY_RESULT.merge("error" => "No images could be loaded")
              else
                raw = call_claude(images)
                parse_vision_response(raw[:raw_text], raw[:model], provider, raw[:input_tokens], raw[:output_tokens])
              end
            end
          rescue StandardError => e
            EMPTY_RESULT.merge("error" => "Vision analysis failed: #{e.message}")
          end

        persist_recognition_result(je_id: je_id, title: title, image_urls: urls, llm: provider, result: result)
        result
      end

      # Port of analyzeListingByUrl: per-image Claude analysis for a full
      # listing fetched from JE by URL or id. Persists a ListingImageAnalysis
      # row and returns the same payload shape as the TS action.
      def analyze_listing_url(url:, max_images: 10)
        max_images = [ max_images || 10, 30 ].min

        trimmed = url.to_s.strip
        je_id =
          if trimmed.start_with?("http")
            trimmed[%r{[-/](\d{5,})(?:[?#]|$)}, 1].to_s
          else
            trimmed.gsub(/\D/, "")
          end
        if je_id.empty? || je_id.length < 5
          raise ArgumentError, "Invalid listing URL or ID. Please enter a valid JamesEdition listing URL or numeric ID."
        end

        listing = Listings::JeClient.fetch_listing_info(je_id)
        if listing.nil?
          raise ArgumentError, "Could not fetch listing data for ID #{je_id}. The listing may not exist or may be unavailable."
        end
        raise ArgumentError, "Listing #{je_id} has no images to analyze." if listing["imageUrls"].empty?

        images_to_analyze = listing["imageUrls"].first(max_images)
        all_results = images_to_analyze.each_with_index.map { |img_url, idx| analyze_single_image(img_url, idx) }

        summary = build_listing_summary(all_results)

        record = ListingImageAnalysis.create!(
          je_id: listing["jeId"],
          title: listing["title"],
          listing_url: listing["listingUrl"],
          price: listing["price"],
          currency: listing["currency"],
          country: listing["country"],
          city: listing["city"],
          state: listing["state"],
          real_estate_type: listing["realEstateType"],
          bedrooms: listing["bedrooms"],
          bathrooms: listing["bathrooms"],
          living_area: listing["livingArea"],
          office: listing["office"],
          total_images: listing["totalImages"],
          analyzed_images: all_results.length,
          per_image_results: all_results,
          summary: summary,
          analyzed_at: now_ms
        )

        {
          "analysisId" => record.id,
          "listing" => listing.slice("jeId", "title", "listingUrl", "price", "currency", "country", "city",
                                     "state", "realEstateType", "bedrooms", "bathrooms", "livingArea", "office"),
          "totalImages" => listing["totalImages"],
          "analyzedImages" => all_results.length,
          "perImageResults" => all_results,
          "summary" => summary
        }
      end

      # ─── Vision response parsing (port of parseVisionResponse) ────────
      def parse_vision_response(raw_text, model, llm, input_tokens, output_tokens)
        base = EMPTY_RESULT.merge(
          "model" => model, "llm" => llm,
          "input_tokens" => input_tokens, "output_tokens" => output_tokens
        )

        raw_text = raw_text.to_s
        lower = raw_text.downcase
        if raw_text.empty? || lower.include?("i'm sorry") || lower.include?("i can't assist")
          return base.merge("error" => "LLM refused: #{raw_text[0, 100]}", "raw" => raw_text)
        end

        cleaned = raw_text.gsub(/```json\n?/, "").gsub(/```\n?/, "").strip

        parsed = nil
        begin
          direct = JSON.parse(cleaned)
          parsed = direct.is_a?(Array) ? average_array_results(direct) : direct
        rescue JSON::ParserError
          json_match = cleaned[/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/m]
          if json_match.nil?
            array_match = cleaned[/\[[\s\S]*\]/]
            if array_match
              begin
                arr = JSON.parse(array_match)
                parsed = average_array_results(arr) if arr.is_a?(Array) && !arr.empty?
              rescue JSON::ParserError
                # fall through
              end
            end
            unless parsed
              return base.merge("error" => "Failed to parse response", "raw" => raw_text[0, 500])
            end
          else
            begin
              parsed = JSON.parse(json_match)
            rescue JSON::ParserError
              return base.merge("error" => "JSON parse failed", "raw" => raw_text[0, 500])
            end
          end
        end

        unless parsed.is_a?(Hash)
          return base.merge("error" => "Unexpected response format", "raw" => raw_text[0, 500])
        end

        cond_raw = parsed["property_condition"]
        unidentifiable = cond_raw.is_a?(String) && cond_raw.downcase.include?("unidentif")
        condition_num = unidentifiable ? 0 : float_or_nil(cond_raw)
        conclusion_num = float_or_nil(parsed["conclusion"])

        base.merge(
          "property_condition" => condition_num,
          "conclusion" => conclusion_num,
          "watermark_share" => int_or_zero(parsed["watermark_share"]),
          "watermark_size" => float_or_nil(parsed["watermark_size"]),
          "watermark_text" => truthy_or_nil(parsed["watermark_text"]),
          "image_quality" => truthy_or_nil(parsed["image_quality"]),
          "image_type" => truthy_or_nil(parsed["image_type"]),
          "image_type_confidence" => truthy_or_nil(parsed["image_type_confidence"]),
          "unidentifiable" => unidentifiable
        )
      end

      # ─── Image fetching (port of fetchImagesAsBase64) ──────────────────
      def fetch_images_as_base64(urls, max_images = 5)
        results = []
        urls.first(max_images).each do |url|
          begin
            response = http_get(url, timeout: IMAGE_FETCH_TIMEOUT)
            unless response.is_a?(Net::HTTPSuccess)
              Rails.logger.info("Image fetch failed: #{response.code} #{url}")
              next
            end
            body = response.body.to_s
            # Detect actual image type from magic bytes (don't trust the
            # content-type header — JE CDN often mislabels PNGs as JPEG).
            media_type = detect_image_type(body)
            unless CLAUDE_SUPPORTED_MEDIA_TYPES.include?(media_type)
              Rails.logger.info("Skipping unsupported image type #{media_type}: #{url}")
              next
            end
            results << { base64: Base64.strict_encode64(body), media_type: media_type }
          rescue StandardError => e
            Rails.logger.error("Image fetch error for #{url}: #{e.message}")
          end
        end
        results
      end

      # Port of detectImageType (magic bytes; default JPEG when unknown).
      def detect_image_type(data)
        bytes = data.to_s.bytes
        return "image/png" if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47
        return "image/jpeg" if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
        return "image/gif" if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46
        if bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 &&
           bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50
          return "image/webp"
        end
        return "image/bmp" if bytes[0] == 0x42 && bytes[1] == 0x4D

        "image/jpeg"
      end

      private

      def max_images_per_scan
        max = Setting.current["max_images_per_vision_scan"]
        max.is_a?(Numeric) && max.positive? ? max.to_i : 10
      end

      def vision_model
        Setting.current["vision_model"].presence || MODELS["claude"]
      end

      # ─── Claude Vision (port of callClaude) ────────────────────────────
      def call_claude(images)
        model = vision_model
        image_contents = images.map do |img|
          { type: "image", source: { type: "base64", media_type: img[:media_type], data: img[:base64] } }
        end
        response = ClaudeClient.messages(
          model: model,
          max_tokens: 1024,
          messages: [ { role: "user", content: image_contents + [ { type: "text", text: JE_CONDITION_PROMPT } ] } ]
        )
        {
          raw_text: ClaudeClient.text_content(response),
          model: response["model"] || model,
          input_tokens: ClaudeClient.input_tokens(response),
          output_tokens: ClaudeClient.output_tokens(response)
        }
      end

      # ─── GPT-4o Vision (port of callOpenAI: URLs direct, detail: low) ──
      def call_openai(image_urls)
        image_messages = image_urls.map do |url|
          { type: "image_url", image_url: { url: url, detail: "low" } }
        end
        response = OpenaiClient.chat_completions(
          model: MODELS["openai"],
          max_tokens: 1024,
          messages: [ { role: "user", content: image_messages + [ { type: "text", text: JE_CONDITION_PROMPT } ] } ]
        )
        {
          raw_text: OpenaiClient.text_content(response),
          model: response["model"] || MODELS["openai"],
          input_tokens: OpenaiClient.prompt_tokens(response),
          output_tokens: OpenaiClient.completion_tokens(response)
        }
      end

      # ─── Per-image analysis (port of analyzeSingleImage) ───────────────
      def analyze_single_image(image_url, index)
        base = {
          "imageUrl" => image_url, "imageIndex" => index,
          "property_condition" => nil, "conclusion" => nil, "watermark_share" => nil,
          "watermark_size" => nil, "watermark_text" => nil, "image_quality" => nil,
          "image_type" => nil, "image_type_confidence" => nil
        }

        images = fetch_images_as_base64([ image_url ], 1)
        return base.merge("error" => "Failed to fetch image") if images.empty?

        raw = call_claude(images)
        parsed = parse_vision_response(raw[:raw_text], raw[:model], "claude", raw[:input_tokens], raw[:output_tokens])

        merged = base.merge(
          parsed.slice("property_condition", "conclusion", "watermark_share", "watermark_size",
                       "watermark_text", "image_quality", "image_type", "image_type_confidence", "model")
        ).merge(
          "input_tokens" => parsed["input_tokens"],
          "output_tokens" => parsed["output_tokens"]
        )
        merged["error"] = parsed["error"] if parsed["error"]
        merged
      rescue StandardError => e
        base.merge("error" => "Analysis failed: #{e.message}")
      end

      # ─── Summary statistics (port of analyzeListingByUrl step 4) ───────
      def build_listing_summary(all_results)
        valid = all_results.select { |r| r["error"].nil? && !r["property_condition"].nil? }
        valid_count = valid.length

        avg = ->(field) { valid_count.positive? ? ((valid.sum { |r| r[field] || 0 }.to_f / valid_count) * 10).round / 10.0 : nil }
        avg_condition = avg.call("property_condition")
        avg_conclusion = avg.call("conclusion")
        avg_watermark_share = avg.call("watermark_share")
        avg_confidence = valid_count.positive? ? (valid.sum { |r| r["image_type_confidence"] || 0 }.to_f / valid_count).round : nil

        real_photo_count = valid.count { |r| r["image_type"].to_s.downcase.include?("real") }
        render_count = valid.count do |r|
          t = r["image_type"].to_s.downcase
          t.include?("render") || t.include?("3d") || t.include?("cgi")
        end
        ai_generated_count = valid.count { |r| r["image_type"].to_s.downcase.include?("ai") }
        watermarked_count = valid.count { |r| (r["watermark_share"] || 0).positive? }

        type_counts = [
          { type: "Real Photo", count: real_photo_count },
          { type: "Render 3D/CGI", count: render_count },
          { type: "AI-Generated", count: ai_generated_count }
        ]
        dominant_type = type_counts.max_by { |t| t[:count] }

        quality_counts = {}
        valid.each do |r|
          q = (r["image_quality"] || "Unknown").downcase
          quality_counts[q] = (quality_counts[q] || 0) + 1
        end
        dominant_quality = quality_counts.max_by { |_, c| c }&.first || "Unknown"

        {
          "avgCondition" => avg_condition,
          "avgConclusion" => avg_conclusion,
          "avgWatermarkShare" => avg_watermark_share,
          "avgConfidence" => avg_confidence,
          "realPhotoCount" => real_photo_count,
          "renderCount" => render_count,
          "aiGeneratedCount" => ai_generated_count,
          "watermarkedCount" => watermarked_count,
          "dominantImageType" => dominant_type&.dig(:type) || "Unknown",
          "dominantQuality" => dominant_quality,
          "qualityCounts" => quality_counts,
          "totalInputTokens" => all_results.sum { |r| r["input_tokens"] || 0 },
          "totalOutputTokens" => all_results.sum { |r| r["output_tokens"] || 0 },
          "successCount" => valid_count,
          "errorCount" => all_results.length - valid_count
        }
      end

      # Average results when GPT returns per-image array (port of
      # averageArrayResults, incl. worst-case text aggregation).
      def average_array_results(arr)
        return nil if arr.empty?
        return arr.first if arr.length == 1

        result = arr.first.dup
        NUMERIC_AVERAGE_FIELDS.each do |field|
          values = arr.map { |r| r[field].is_a?(Numeric) ? r[field].to_f : js_parse_float(r[field]) }.compact
          result[field] = ((values.sum / values.length) * 10).round / 10.0 if values.any?
        end

        rank_in = lambda do |order, value|
          i = order.index(value)
          i.nil? ? order.length : i
        end

        qualities = arr.map { |r| r["image_quality"]&.downcase }.select { |q| Moderation::JsCompat.js_truthy?(q) }
        if qualities.any?
          result["image_quality"] = qualities.reduce(qualities.first) do |worst, q|
            rank_in.call(QUALITY_ORDER, q) < rank_in.call(QUALITY_ORDER, worst) ? q : worst
          end
        end

        types = arr.map { |r| r["image_type"] }.select { |t| Moderation::JsCompat.js_truthy?(t) }
        if types.any?
          result["image_type"] = types.reduce(types.first) do |worst, t|
            rank_in.call(TYPE_ORDER, t) < rank_in.call(TYPE_ORDER, worst) ? t : worst
          end
        end

        texts = arr.map { |r| r["watermark_text"] }.select { |t| Moderation::JsCompat.js_truthy?(t) }
        joined = texts.join(", ")
        result["watermark_text"] = joined.empty? ? nil : joined

        result
      end

      def persist_recognition_result(je_id:, title:, image_urls:, llm:, result:)
        return if je_id.to_s.empty?

        ImageRecognitionResult.create!(
          listing: Listing.find_by(je_id: je_id),
          je_id: je_id,
          title: title.presence || "Listing #{je_id}",
          image_urls: image_urls,
          llm: llm,
          result: result,
          analyzed_at: now_ms
        )
      rescue StandardError => e
        Rails.logger.error("Failed to persist image recognition result for #{je_id}: #{e.message}")
      end

      # JS `typeof x === "number" ? x : parseFloat(x) || null`
      def float_or_nil(value)
        return value if value.is_a?(Numeric)

        f = js_parse_float(value)
        f && !f.zero? ? f : nil
      end

      # JS `typeof x === "number" ? x : parseInt(x) || 0`
      def int_or_zero(value)
        return value if value.is_a?(Numeric)

        s = value.to_s.strip
        digits = s[/\A[+-]?\d+/]
        digits ? digits.to_i : 0
      end

      # JS `x || null`
      def truthy_or_nil(value)
        Moderation::JsCompat.js_truthy?(value) ? value : nil
      end

      # JS parseFloat: leading float, NaN -> nil.
      def js_parse_float(value)
        s = value.to_s.strip[/\A[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/]
        s&.to_f
      end

      def http_get(url, timeout:)
        uri = URI(url)
        Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                        open_timeout: timeout, read_timeout: timeout) do |http|
          request = Net::HTTP::Get.new(uri)
          http.request(request)
        end
      end

      def now_ms
        (Time.current.to_f * 1000).to_i
      end
    end
  end
end
