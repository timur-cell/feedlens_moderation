# CORS for local development only: the Vite dev server (http://localhost:5173)
# talks to the Rails API with session cookies. In production the SPA is served
# same-origin, so no CORS is needed.
if Rails.env.development?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins "http://localhost:5173"
      resource "/api/*", headers: :any, methods: :any, credentials: true
      resource "/image-proxy", headers: :any, methods: %i[get options], credentials: true
    end
  end
end
