require "webmock/rspec"

WebMock.disable_net_connect!(allow_localhost: true)

module ApiHelpers
  # Signs the moderator in through the real session endpoint so request
  # specs exercise the same code path as the SPA.
  def sign_in_as(moderator, password: "Password!123")
    post "/api/session", params: { email: moderator.email, password: password }, as: :json
    expect(response).to have_http_status(:ok), "sign_in_as failed: #{response.status} #{response.body}"
    moderator
  end

  def json
    JSON.parse(response.body)
  end
end

RSpec.configure do |config|
  config.include ApiHelpers, type: :request
end
