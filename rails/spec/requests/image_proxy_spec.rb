require "rails_helper"

RSpec.describe "Image proxy", type: :request do
  describe "GET /image-proxy" do
    it "proxies https jamesedition.com subdomain images with cache and CORS headers (no auth)" do
      stub_request(:get, "https://img.jamesedition.com/path/to/photo.jpg?w=600")
        .to_return(status: 200, body: "JPEGDATA", headers: { "Content-Type" => "image/webp" })

      get "/image-proxy", params: { url: "https://img.jamesedition.com/path/to/photo.jpg?w=600" }

      expect(response).to have_http_status(:ok)
      expect(response.body).to eq("JPEGDATA")
      expect(response.headers["Content-Type"]).to start_with("image/webp")
      cache_control = response.headers["Cache-Control"]
      expect(cache_control).to include("public")
      expect(cache_control).to include("max-age=86400")
      expect(cache_control).to include("s-maxage=604800")
      expect(response.headers["Access-Control-Allow-Origin"]).to eq("*")
    end

    it "proxies the apex domain too and defaults the content type to image/jpeg" do
      stub_request(:get, "https://jamesedition.com/img.jpg")
        .to_return(status: 200, body: "DATA", headers: {})

      get "/image-proxy", params: { url: "https://jamesedition.com/img.jpg" }
      expect(response).to have_http_status(:ok)
      expect(response.headers["Content-Type"]).to start_with("image/jpeg")
    end

    it "sends Accept: */* and no User-Agent header upstream" do
      stub = stub_request(:get, "https://img.jamesedition.com/a.jpg")
             .with { |req| req.headers["Accept"] == "*/*" && req.headers["User-Agent"].nil? }
             .to_return(status: 200, body: "X")

      get "/image-proxy", params: { url: "https://img.jamesedition.com/a.jpg" }
      expect(response).to have_http_status(:ok)
      expect(stub).to have_been_requested
    end

    describe "SSRF protection — 400 for anything but https://*.jamesedition.com" do
      [
        "http://img.jamesedition.com/a.jpg",            # not https
        "https://evil.com/?u=jamesedition.com",          # host is evil.com
        "https://jamesedition.com.evil.com/a.jpg",       # suffix-spoofed host
        "https://xjamesedition.com/a.jpg",               # prefix-spoofed host
        "ht!tp://%%%garbage"                              # unparseable
      ].each do |bad_url|
        it "rejects #{bad_url}" do
          get "/image-proxy", params: { url: bad_url }
          expect(response).to have_http_status(:bad_request)
          expect(response.body).to eq("Invalid or missing url parameter")
        end
      end

      it "rejects a missing url param" do
        get "/image-proxy"
        expect(response).to have_http_status(:bad_request)
        expect(response.body).to eq("Invalid or missing url parameter")
      end
    end

    it "mirrors upstream non-2xx statuses as 'Image fetch failed'" do
      stub_request(:get, "https://img.jamesedition.com/broken.jpg").to_return(status: 500, body: "boom")

      get "/image-proxy", params: { url: "https://img.jamesedition.com/broken.jpg" }
      expect(response).to have_http_status(:internal_server_error)
      expect(response.body).to eq("Image fetch failed")
    end

    it "returns 502 on network errors" do
      stub_request(:get, "https://img.jamesedition.com/timeout.jpg").to_timeout

      get "/image-proxy", params: { url: "https://img.jamesedition.com/timeout.jpg" }
      expect(response).to have_http_status(:bad_gateway)
      expect(response.body).to eq("Image fetch error")
    end
  end

  describe "OPTIONS /image-proxy" do
    it "returns a 204 preflight with CORS headers" do
      options "/image-proxy"
      expect(response).to have_http_status(:no_content)
      expect(response.headers["Access-Control-Allow-Origin"]).to eq("*")
      expect(response.headers["Access-Control-Allow-Methods"]).to eq("GET")
    end
  end
end
