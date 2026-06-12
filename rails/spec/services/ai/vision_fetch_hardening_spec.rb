require "rails_helper"

# Phase 3 hardening (review finding S6): seller-supplied image URLs must not
# reach internal hosts (SSRF) or exhaust memory.
RSpec.describe Ai::VisionAnalyzer do
  describe ".safe_image_url?" do
    it "allows public http(s) URLs" do
      expect(described_class.send(:safe_image_url?, "https://img.jamesedition.com/a.jpg")).to be(true)
      expect(described_class.send(:safe_image_url?, "http://cdn.example.com/b.png")).to be(true)
    end

    it "blocks non-http schemes" do
      expect(described_class.send(:safe_image_url?, "ftp://img.example/a.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "file:///etc/passwd")).to be(false)
    end

    it "blocks localhost and internal host suffixes" do
      expect(described_class.send(:safe_image_url?, "http://localhost/x.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://db.internal/x.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://printer.local/x.jpg")).to be(false)
    end

    it "blocks loopback, private and link-local IP literals" do
      expect(described_class.send(:safe_image_url?, "http://127.0.0.1/x.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://10.0.0.5/x.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://192.168.1.1/x.jpg")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://169.254.169.254/latest/meta-data/")).to be(false)
      expect(described_class.send(:safe_image_url?, "http://[::1]/x.jpg")).to be(false)
    end

    it "blocks malformed URLs" do
      expect(described_class.send(:safe_image_url?, "not a url")).to be(false)
    end
  end

  describe ".fetch_images_as_base64" do
    let(:jpeg_bytes) { [ 0xFF, 0xD8, 0xFF, 0xE0 ].pack("C*") + "jpegdata" }

    it "never issues a request for blocked URLs" do
      # No webmock stub registered: a real fetch attempt would raise
      # WebMock::NetConnectNotAllowedError, so an empty result proves the
      # guard fired before any HTTP.
      results = described_class.fetch_images_as_base64(
        [ "http://169.254.169.254/latest/meta-data/", "http://localhost/x.jpg" ]
      )
      expect(results).to eq([])
    end

    it "skips bodies above the size cap and keeps normal images" do
      stub_request(:get, "https://img.example/huge.jpg")
        .to_return(status: 200, body: jpeg_bytes,
                   headers: { "Content-Length" => (described_class::MAX_IMAGE_BYTES + 1).to_s })
      stub_request(:get, "https://img.example/ok.jpg").to_return(status: 200, body: jpeg_bytes)

      results = described_class.fetch_images_as_base64(
        %w[https://img.example/huge.jpg https://img.example/ok.jpg]
      )

      expect(results.length).to eq(1)
      expect(results.first[:media_type]).to eq("image/jpeg")
    end
  end
end
