# GET /image-proxy?url= — fetches img.jamesedition.com images server-side
# (their CDN 500s when a browser User-Agent is present). Exact parity with
# the /image-proxy route in convex/http.ts: https-only, parsed-hostname
# allowlist (jamesedition.com and subdomains), proxied content-type and
# cache headers. No auth, no CSRF.
class ImageProxyController < ActionController::Base
  skip_forgery_protection

  def show
    target = parse_target(params[:url])
    unless allowed?(target)
      return render plain: "Invalid or missing url parameter", status: :bad_request
    end

    begin
      upstream = fetch_image(target)
    rescue StandardError
      return render plain: "Image fetch error", status: :bad_gateway
    end

    code = upstream.code.to_i
    unless (200..299).cover?(code)
      return render plain: "Image fetch failed", status: code
    end

    response.set_header("Cache-Control", "public, max-age=86400, s-maxage=604800")
    response.set_header("Access-Control-Allow-Origin", "*")
    send_data upstream.body,
              type: upstream["content-type"].presence || "image/jpeg",
              disposition: "inline"
  end

  # OPTIONS /image-proxy — CORS preflight
  def preflight
    response.set_header("Access-Control-Allow-Origin", "*")
    response.set_header("Access-Control-Allow-Methods", "GET")
    response.set_header("Access-Control-Allow-Headers", "Content-Type")
    response.set_header("Access-Control-Max-Age", "86400")
    head :no_content
  end

  private

  def parse_target(raw)
    URI(raw.to_s)
  rescue URI::Error
    nil
  end

  # Validate the PARSED hostname, not the raw string — substring checks
  # would let attacker-controlled URLs through (open proxy / SSRF).
  def allowed?(target)
    return false unless target&.scheme == "https"

    host = target.host.to_s
    host == "jamesedition.com" || host.end_with?(".jamesedition.com")
  end

  def fetch_image(target)
    Net::HTTP.start(target.host, target.port, use_ssl: true,
                    open_timeout: 10, read_timeout: 20) do |http|
      request = Net::HTTP::Get.new(target.request_uri)
      request["Accept"] = "*/*"
      # No User-Agent = no CDN 500 error (Net::HTTP defaults to "Ruby").
      request.delete("User-Agent")
      http.request(request)
    end
  end
end
