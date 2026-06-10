# Shared examples for the authz matrix every endpoint group needs:
#   * 401 when unauthenticated
#   * 401 when the signed-in moderator has been disabled
#   * (admin endpoints) 403 for active non-admin moderators
RSpec.shared_examples "requires moderator" do |method, path_proc, body = {}|
  it "returns 401 when unauthenticated (#{method.upcase} #{path_proc})" do
    path = instance_exec(&path_proc)
    public_send(method, path, params: body, as: :json)
    expect(response).to have_http_status(:unauthorized)
    expect(json["error"]).to eq("Unauthorized: an active moderator account is required.")
  end

  it "returns 401 when the moderator is disabled (#{method.upcase} #{path_proc})" do
    path = instance_exec(&path_proc)
    moderator = create(:moderator)
    sign_in_as(moderator)
    moderator.update!(status: "disabled")
    public_send(method, path, params: body, as: :json)
    expect(response).to have_http_status(:unauthorized)
    expect(json["error"]).to eq("Unauthorized: an active moderator account is required.")
  end
end

RSpec.shared_examples "admin only" do |method, path_proc, body = {}|
  it "returns 403 for a non-admin moderator (#{method.upcase} #{path_proc})" do
    path = instance_exec(&path_proc)
    sign_in_as(create(:moderator, role: "moderator"))
    public_send(method, path, params: body, as: :json)
    expect(response).to have_http_status(:forbidden)
    expect(json["error"]).to eq("Forbidden: admin role required.")
  end
end
