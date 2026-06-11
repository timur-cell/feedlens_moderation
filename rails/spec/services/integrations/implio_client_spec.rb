require "rails_helper"

RSpec.describe Integrations::ImplioClient do
  let(:implio_url) { "https://api.implio.com/v1/ads" }

  let(:listing) do
    create(:listing,
           je_id: "16680095",
           title: "Stunning Villa in Marbella",
           category: "real_estate",
           price: 1_200_000.0,
           price_usd: 1_300_000.0,
           price_on_request: false,
           city: "Marbella",
           country: "Spain",
           real_estate_type: "villa",
           bedrooms: 5,
           bathrooms: 4,
           living_area: 350.0,
           land_area: 1000.0,
           image_count: 12,
           description_length: 540,
           lqi: 75.0,
           office: "12345",
           office_group_name: "Lux Group",
           office_subscription: "premium",
           feed_source: "Kyero",
           chat_gpt_conclusion: "4.5",
           chat_gpt_property_condition: 4.0,
           chat_gpt_watermark_share: 0.0,
           chat_gpt_image_quality: "high",
           chat_gpt_image_type: "Real photo")
  end

  let(:rule_matches) do
    [ { "ruleName" => "price_too_low", "ruleCategory" => "simple_code", "tier" => "auto",
        "action" => "reject", "message" => "Price below standards", "details" => "priceUsd 1300000 < threshold" } ]
  end

  let(:moderation_result) do
    create(:moderation_result, listing: listing, outcome: "rejected", rule_matches: rule_matches,
                               seller_message: "Your listing does not meet our quality standards.",
                               confidence: 1.0)
  end

  # Exact payload parity with submitToImplio in convex/moderation.ts.
  let(:expected_payload) do
    [ {
      "id" => "16680095",
      "content" => {
        "title" => "Stunning Villa in Marbella",
        "body" => "FeedLens Moderation: REJECTED\n\n" \
                  "[simple_code/auto] price_too_low (reject): priceUsd 1300000 < threshold\n\n" \
                  "Seller message: Your listing does not meet our quality standards."
      },
      "customerSpecific" => {
        "listing_url" => "https://www.jamesedition.com/real_estate/-/-16680095",
        "price" => 1_200_000.0,
        "price_usd" => 1_300_000.0,
        "price_on_request" => false,
        "location_city" => "Marbella",
        "location_country" => "Spain",
        "real_estate_type" => "villa",
        "bedrooms" => 5,
        "bathrooms" => 4,
        "living_area" => 350.0,
        "land_area" => 1000.0,
        "number_of_pictures" => 12,
        "description_length" => 540,
        "listing_quality_index" => 75.0,
        "office_group_name" => "Lux Group",
        "office_subscription_level" => "premium",
        "listing_feed_source" => "Kyero",
        "chat_gpt_conclusion" => "4.5",
        "chat_gpt_property_condition" => 4.0,
        "chat_gpt_watermark_share" => 0.0,
        "chat_gpt_image_quality" => "high",
        "chat_gpt_image_type" => "Real photo",
        "viktor_flagged" => true,
        "viktor_assessment" => "[simple_code/auto] price_too_low (reject): priceUsd 1300000 < threshold",
        "viktor_confidence" => 1.0,
        "viktor_outcome" => "rejected",
        "viktor_reject" => true,
        "seller_message" => "Your listing does not meet our quality standards."
      }
    } ]
  end

  describe ".build_payload" do
    it "matches the TS submitToImplio payload exactly (rejected)" do
      payload = described_class.build_payload(
        listing: listing,
        je_id: listing.je_id,
        outcome: "rejected",
        rule_matches: rule_matches,
        seller_message: "Your listing does not meet our quality standards.",
        confidence: 1.0
      )

      # JSON round-trip so undefined-key dropping is asserted on the wire shape
      expect(JSON.parse(JSON.generate(payload))).to eq(expected_payload)
      # chat_gpt_watermark_text is nil on the listing → dropped like JS undefined
      expect(payload.first["customerSpecific"]).not_to have_key("chat_gpt_watermark_text")
    end

    it "sets viktor_approve for approvals and manual_review for manual outcomes" do
      approved = described_class.build_payload(listing: listing, je_id: listing.je_id,
                                               outcome: "approved", rule_matches: [])
      cs = approved.first["customerSpecific"]
      expect(cs["viktor_approve"]).to be(true)
      expect(cs).not_to have_key("viktor_reject")
      expect(cs).not_to have_key("seller_message")
      expect(cs["viktor_assessment"]).to eq("FeedLens outcome: approved")
      expect(cs["viktor_confidence"]).to be_nil # explicit null, not dropped

      manual = described_class.build_payload(listing: listing, je_id: listing.je_id,
                                             outcome: "manual", rule_matches: [])
      cs = manual.first["customerSpecific"]
      expect(cs["manual_review"]).to be(true)
      expect(cs["viktor_flagged"]).to be(true)
      expect(cs).not_to have_key("viktor_approve")

      notice = described_class.build_payload(listing: listing, je_id: listing.je_id,
                                             outcome: "notice", rule_matches: [], seller_message: "Tidy up")
      cs = notice.first["customerSpecific"]
      expect(cs["viktor_approve"]).to be(true)
      expect(cs["seller_message"]).to eq("Tidy up")
    end

    it "derives the listing_url segment from the category" do
      car = create(:listing, je_id: "777777", title: "Ferrari", category: "cars")
      payload = described_class.build_payload(listing: car, je_id: car.je_id, outcome: "approved", rule_matches: [])
      expect(payload.first["customerSpecific"]["listing_url"]).to eq("https://www.jamesedition.com/cars/-/-777777")
    end
  end

  describe ".submit_result" do
    context "stub mode (default — IMPLIO_STUB unset)" do
      it "logs the payload and performs zero HTTP requests" do
        with_env("IMPLIO_STUB" => nil, "IMPLIO_API_KEY" => "should-not-be-used") do
          logged = nil
          allow(Rails.logger).to receive(:info) { |msg| logged = msg }

          result = described_class.submit_result(moderation_result)

          expect(result).to eq(success: true, stubbed: true)
          expect(WebMock).not_to have_requested(:post, implio_url)
          expect(logged).to include("[Implio STUB]")
          expect(JSON.parse(logged[/\[\{.*\}\]\z/m])).to eq(expected_payload)
        end
      end

      it "also stubs when IMPLIO_STUB is the string 'true'" do
        with_env("IMPLIO_STUB" => "true") do
          expect(described_class.submit_result(moderation_result)).to eq(success: true, stubbed: true)
          expect(WebMock).not_to have_requested(:post, implio_url)
        end
      end
    end

    context "stub mode off" do
      it "returns a No API key error when the key is missing" do
        with_env("IMPLIO_STUB" => "false", "IMPLIO_API_KEY" => nil) do
          expect(described_class.submit_result(moderation_result)).to eq(success: false, error: "No API key")
          expect(WebMock).not_to have_requested(:post, implio_url)
        end
      end

      it "POSTs the exact payload with the X-Api-Key header" do
        with_env("IMPLIO_STUB" => "false", "IMPLIO_API_KEY" => "implio-key") do
          implio_stub = stub_request(:post, implio_url)
            .with(headers: { "X-Api-Key" => "implio-key", "Content-Type" => "application/json" }) do |req|
              JSON.parse(req.body) == expected_payload
            end
            .to_return(status: 200, body: "{}")

          expect(described_class.submit_result(moderation_result)).to eq(success: true)
          expect(implio_stub).to have_been_requested
        end
      end

      it "returns the error body on HTTP failure" do
        with_env("IMPLIO_STUB" => "false", "IMPLIO_API_KEY" => "implio-key") do
          stub_request(:post, implio_url).to_return(status: 422, body: "bad ad")
          expect(described_class.submit_result(moderation_result)).to eq(success: false, error: "422: bad ad")
        end
      end

      it "rescues network failures" do
        with_env("IMPLIO_STUB" => "false", "IMPLIO_API_KEY" => "implio-key") do
          stub_request(:post, implio_url).to_timeout
          result = described_class.submit_result(moderation_result)
          expect(result[:success]).to be(false)
          expect(result[:error]).to be_present
        end
      end
    end
  end

  describe ".submit_decision" do
    it "builds a decision payload for a known listing" do
      listing # create it
      with_env("IMPLIO_STUB" => "false", "IMPLIO_API_KEY" => "implio-key") do
        implio_stub = stub_request(:post, implio_url)
          .with do |req|
            payload = JSON.parse(req.body)
            cs = payload.first["customerSpecific"]
            payload.first["id"] == "16680095" &&
              cs["viktor_outcome"] == "rejected" &&
              cs["viktor_reject"] == true &&
              cs["seller_message"] == "Watermarked images" &&
              cs["viktor_assessment"] == "FeedLens outcome: rejected"
          end
          .to_return(status: 200, body: "{}")

        result = described_class.submit_decision(je_id: "16680095", outcome: "rejected", message: "Watermarked images")
        expect(result).to eq(success: true)
        expect(implio_stub).to have_been_requested
      end
    end

    it "works for jeIds without a local listing (minimal payload)" do
      with_env("IMPLIO_STUB" => nil) do
        result = described_class.submit_decision(je_id: "99999999", outcome: "approved")
        expect(result).to eq(success: true, stubbed: true)
      end
    end
  end
end
