require "rails_helper"

RSpec.describe Ai::VisionAnalyzer do
  let(:anthropic_url) { "https://api.anthropic.com/v1/messages" }
  let(:openai_url) { "https://api.openai.com/v1/chat/completions" }

  let(:jpeg_bytes) { (+"\xFF\xD8\xFF\xE0").force_encoding(Encoding::BINARY) + "fakejpegdata" }
  let(:png_bytes) { (+"\x89PNG\r\n\x1A\n").force_encoding(Encoding::BINARY) + "fakepngdata" }
  let(:bmp_bytes) { (+"BM").force_encoding(Encoding::BINARY) + "fakebmpdata" }

  def claude_response(text, model: "claude-haiku-4-5-20251001", input_tokens: 120, output_tokens: 60)
    {
      model: model,
      content: [ { type: "text", text: text } ],
      usage: { input_tokens: input_tokens, output_tokens: output_tokens }
    }.to_json
  end

  def vision_json
    '{"property_condition":4.5,"watermark_size":6,"watermark_share":0,"watermark_text":"",' \
      '"image_quality":"high","image_type":"Real photo","image_type_confidence":92,"conclusion":4.8}'
  end

  describe ".analyze (Claude provider)" do
    around { |example| with_env("ANTHROPIC_API_KEY" => "test-anthropic-key") { example.run } }

    it "fetches images as base64, skips broken/unsupported ones and sends the JE prompt to Claude" do
      stub_request(:get, "https://img.example/good.jpg").to_return(status: 200, body: jpeg_bytes)
      stub_request(:get, "https://img.example/broken.jpg").to_return(status: 404)
      stub_request(:get, "https://img.example/legacy.bmp").to_return(status: 200, body: bmp_bytes)
      stub_request(:get, "https://img.example/good.png").to_return(status: 200, body: png_bytes)

      claude_stub = stub_request(:post, anthropic_url)
        .with(headers: {
          "x-api-key" => "test-anthropic-key",
          "anthropic-version" => "2023-06-01",
          "content-type" => "application/json"
        }) do |req|
          body = JSON.parse(req.body)
          content = body.dig("messages", 0, "content")
          images = content.select { |b| b["type"] == "image" }
          text = content.last

          body["model"] == "claude-haiku-4-5-20251001" &&
            body["max_tokens"] == 1024 &&
            !body.key?("temperature") &&
            body["messages"].length == 1 &&
            body.dig("messages", 0, "role") == "user" &&
            images.length == 2 && # broken + bmp skipped
            images[0].dig("source", "type") == "base64" &&
            images[0].dig("source", "media_type") == "image/jpeg" &&
            images[0].dig("source", "data") == Base64.strict_encode64(jpeg_bytes) &&
            images[1].dig("source", "media_type") == "image/png" &&
            text["type"] == "text" &&
            text["text"].start_with?("We are a global luxury real estate portal") &&
            text["text"].include?("Respond with a valid RFC-8259 complaint JSON")
        end
        .to_return(status: 200, body: claude_response(vision_json))

      result = described_class.analyze(
        image_urls: %w[https://img.example/good.jpg https://img.example/broken.jpg
                       https://img.example/legacy.bmp https://img.example/good.png],
        title: "Test Villa",
        je_id: "16680095"
      )

      expect(claude_stub).to have_been_requested
      expect(result["property_condition"]).to eq(4.5)
      expect(result["conclusion"]).to eq(4.8)
      expect(result["watermark_share"]).to eq(0)
      expect(result["watermark_text"]).to be_nil # "" is falsy → null
      expect(result["image_quality"]).to eq("high")
      expect(result["image_type"]).to eq("Real photo")
      expect(result["image_type_confidence"]).to eq(92)
      expect(result["unidentifiable"]).to be(false)
      expect(result["llm"]).to eq("claude")
      expect(result["input_tokens"]).to eq(120)
      expect(result["output_tokens"]).to eq(60)
      expect(result["error"]).to be_nil
    end

    it "persists an ImageRecognitionResult row" do
      listing = create(:listing, je_id: "16680095")
      stub_request(:get, "https://img.example/good.jpg").to_return(status: 200, body: jpeg_bytes)
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(vision_json))

      expect do
        described_class.analyze(image_urls: [ "https://img.example/good.jpg" ], title: "Test Villa", je_id: "16680095")
      end.to change(ImageRecognitionResult, :count).by(1)

      record = ImageRecognitionResult.last
      expect(record.listing).to eq(listing)
      expect(record.je_id).to eq("16680095")
      expect(record.llm).to eq("claude")
      expect(record.result["property_condition"]).to eq(4.5)
    end

    it "uses vision_model and max_images_per_vision_scan from settings" do
      Setting.create!(key: Setting::KEY, vision_model: "claude-custom-vision", max_images_per_vision_scan: 1)
      stub_request(:get, "https://img.example/1.jpg").to_return(status: 200, body: jpeg_bytes)

      claude_stub = stub_request(:post, anthropic_url)
        .with { |req| JSON.parse(req.body)["model"] == "claude-custom-vision" }
        .to_return(status: 200, body: claude_response(vision_json, model: "claude-custom-vision"))

      described_class.analyze(
        image_urls: %w[https://img.example/1.jpg https://img.example/2.jpg],
        title: "T", je_id: "16680095"
      )

      expect(claude_stub).to have_been_requested
      # second image never fetched: maxImagesPerVisionScan == 1
      expect(WebMock).not_to have_requested(:get, "https://img.example/2.jpg")
    end

    it "returns an error result without calling Claude when every image is unsupported" do
      stub_request(:get, "https://img.example/legacy.bmp").to_return(status: 200, body: bmp_bytes)

      result = described_class.analyze(image_urls: [ "https://img.example/legacy.bmp" ], title: "T", je_id: "1")

      expect(result["error"]).to eq("No images could be loaded")
      expect(result["property_condition"]).to be_nil
      expect(WebMock).not_to have_requested(:post, anthropic_url)
    end

    it "returns an error result for empty image lists" do
      result = described_class.analyze(image_urls: [], title: "T")
      expect(result["error"]).to eq("No image URLs provided")
    end

    it "turns Claude API errors into a non-fatal error result" do
      stub_request(:get, "https://img.example/good.jpg").to_return(status: 200, body: jpeg_bytes)
      stub_request(:post, anthropic_url).to_return(status: 529, body: "overloaded")

      result = described_class.analyze(image_urls: [ "https://img.example/good.jpg" ], title: "T", je_id: "1")

      expect(result["error"]).to start_with("Vision analysis failed:")
      expect(result["property_condition"]).to be_nil
    end
  end

  describe ".analyze (GPT-4o fallback provider)" do
    around { |example| with_env("OPENAI_API_KEY" => "test-openai-key") { example.run } }

    it "sends image URLs directly (detail: low) to GPT-4o without base64 fetching" do
      openai_stub = stub_request(:post, openai_url)
        .with(headers: { "Authorization" => "Bearer test-openai-key" }) do |req|
          body = JSON.parse(req.body)
          content = body.dig("messages", 0, "content")
          images = content.select { |b| b["type"] == "image_url" }

          body["model"] == "gpt-4o" &&
            body["max_tokens"] == 1024 &&
            images.length == 2 &&
            images[0].dig("image_url", "url") == "https://img.example/1.jpg" &&
            images[0].dig("image_url", "detail") == "low" &&
            content.last["type"] == "text" &&
            content.last["text"].start_with?("We are a global luxury real estate portal")
        end
        .to_return(status: 200, body: {
          model: "gpt-4o",
          choices: [ { message: { content: vision_json } } ],
          usage: { prompt_tokens: 200, completion_tokens: 80 }
        }.to_json)

      result = described_class.analyze(
        image_urls: %w[https://img.example/1.jpg https://img.example/2.jpg],
        title: "T", je_id: "1", provider: "openai"
      )

      expect(openai_stub).to have_been_requested
      expect(WebMock).not_to have_requested(:get, "https://img.example/1.jpg")
      expect(WebMock).not_to have_requested(:post, anthropic_url)
      expect(result["llm"]).to eq("openai")
      expect(result["property_condition"]).to eq(4.5)
      expect(result["input_tokens"]).to eq(200)
      expect(result["output_tokens"]).to eq(80)
    end
  end

  describe ".parse_vision_response (defensive parsing)" do
    def parse(text)
      described_class.parse_vision_response(text, "model-x", "claude", 1, 2)
    end

    it "tolerates non-numeric scores" do
      result = parse('{"property_condition":"Unidentifiable","conclusion":"N/A","watermark_share":"none",' \
                     '"watermark_size":"big","image_quality":"low","image_type":"Real photo","image_type_confidence":50}')

      expect(result["property_condition"]).to eq(0)
      expect(result["unidentifiable"]).to be(true)
      expect(result["conclusion"]).to be_nil
      expect(result["watermark_share"]).to eq(0)
      expect(result["watermark_size"]).to be_nil
    end

    it "parses numeric strings like JS parseFloat" do
      result = parse('{"property_condition":"4.5","conclusion":"3.9/6"}')
      expect(result["property_condition"]).to eq(4.5)
      expect(result["conclusion"]).to eq(3.9)
    end

    it "extracts JSON from markdown fences" do
      result = parse("```json\n#{vision_json}\n```")
      expect(result["property_condition"]).to eq(4.5)
      expect(result["error"]).to be_nil
    end

    it "extracts the first JSON object from surrounding prose" do
      result = parse("Here is my analysis: {\"property_condition\": 3.0, \"conclusion\": 2.5} Hope this helps!")
      expect(result["property_condition"]).to eq(3.0)
      expect(result["conclusion"]).to eq(2.5)
    end

    it "averages per-image array responses" do
      arr = '[{"property_condition":4,"conclusion":4,"image_quality":"high","image_type":"Real photo","watermark_text":"abc"},' \
            '{"property_condition":2,"conclusion":3,"image_quality":"low","image_type":"AI-generated","watermark_text":"def"}]'
      result = parse(arr)

      expect(result["property_condition"]).to eq(3.0)
      expect(result["conclusion"]).to eq(3.5)
      expect(result["image_quality"]).to eq("low")          # worst quality wins
      expect(result["image_type"]).to eq("AI-generated")    # most cautious type wins
      expect(result["watermark_text"]).to eq("abc, def")
    end

    it "returns an error result for unparsable responses" do
      result = parse("not json at all")
      expect(result["error"]).to eq("Failed to parse response")
      expect(result["raw"]).to eq("not json at all")
      expect(result["property_condition"]).to be_nil
    end

    it "detects refusals" do
      result = parse("I'm sorry, I can't assist with that request.")
      expect(result["error"]).to start_with("LLM refused:")
    end

    it "detects empty responses" do
      result = parse("")
      expect(result["error"]).to start_with("LLM refused:")
    end
  end

  describe ".detect_image_type" do
    it "detects types from magic bytes regardless of headers" do
      expect(described_class.detect_image_type(jpeg_bytes)).to eq("image/jpeg")
      expect(described_class.detect_image_type(png_bytes)).to eq("image/png")
      expect(described_class.detect_image_type(bmp_bytes)).to eq("image/bmp")
      expect(described_class.detect_image_type("GIF89a...")).to eq("image/gif")
      expect(described_class.detect_image_type("RIFF1234WEBPxxxx")).to eq("image/webp")
      expect(described_class.detect_image_type("unknown")).to eq("image/jpeg")
    end
  end

  describe ".analyze_listing_url" do
    around { |example| with_env("ANTHROPIC_API_KEY" => "test-anthropic-key") { example.run } }

    it "fetches the listing, analyzes each image and persists a ListingImageAnalysis" do
      je_id = "16680095"
      stub_request(:get, "https://www.jamesedition.com/api/mobile/v1/listings/#{je_id}")
        .to_return(status: 200, body: {
          listing: {
            headline: "URL Villa",
            price: "$1,000,000",
            humanized_location: "Villa in Marbella, Spain",
            images: %w[https://img.example/1.jpg https://img.example/2.jpg],
            floor_plan_images: [],
            office_name: "Office"
          }
        }.to_json)
      stub_request(:get, %r{https://img\.example/\d\.jpg}).to_return(status: 200, body: jpeg_bytes)
      stub_request(:post, anthropic_url).to_return(status: 200, body: claude_response(vision_json))

      result = nil
      expect do
        result = described_class.analyze_listing_url(url: "https://www.jamesedition.com/real_estate/villa-#{je_id}")
      end.to change(ListingImageAnalysis, :count).by(1)

      expect(result["listing"]["jeId"]).to eq(je_id)
      expect(result["analyzedImages"]).to eq(2)
      expect(result["perImageResults"].length).to eq(2)
      expect(result["perImageResults"].first["imageIndex"]).to eq(0)
      expect(result["perImageResults"].first["property_condition"]).to eq(4.5)
      expect(result["summary"]["avgCondition"]).to eq(4.5)
      expect(result["summary"]["realPhotoCount"]).to eq(2)
      expect(result["summary"]["successCount"]).to eq(2)

      record = ListingImageAnalysis.last
      expect(record.je_id).to eq(je_id)
      expect(record.total_images).to eq(2)
      expect(record.summary["dominantImageType"]).to eq("Real Photo")
    end

    it "rejects invalid inputs" do
      expect { described_class.analyze_listing_url(url: "abc") }.to raise_error(ArgumentError, /Invalid listing URL or ID/)
    end
  end
end
