Rails.application.routes.draw do
  devise_for :moderators, skip: :all

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api, defaults: { format: :json } do
    # --- Auth / session ----------------------------------------------------
    get "session", to: "sessions#show"
    post "session", to: "sessions#create"
    delete "session", to: "sessions#destroy"
    post "password", to: "passwords#create"
    put "password", to: "passwords#update"

    # --- Users / team ------------------------------------------------------
    get "users", to: "users#index"
    post "users", to: "users#create"
    get "users/stats", to: "users#stats"
    post "users/set-password", to: "users#set_password"
    get "users/:id/activity", to: "users#activity"
    patch "users/:id", to: "users#update"
    delete "users/:id", to: "users#destroy"
    post "users/:id/reactivate", to: "users#reactivate"
    get "activity", to: "users#recent_activity"

    # --- Listings ----------------------------------------------------------
    get "listings/pending", to: "listings#pending"
    get "listings/recent", to: "listings#recent"
    get "listings/stats", to: "listings#stats"
    get "listings/by-je-id/:je_id", to: "listings#by_je_id", constraints: { je_id: %r{[^/]+} }
    get "listings", to: "listings#index"
    get "listings/:id", to: "listings#show"
    post "listings/:id/moderate", to: "listings#moderate"
    post "listings/:id/unlock", to: "listings#unlock"
    post "listings/:id/param-scan", to: "param_scans#create"
    get "listings/:listing_id/notes", to: "notes#index"
    post "listings/:listing_id/notes", to: "notes#create"
    delete "notes/:id", to: "notes#destroy"

    post "moderate-by-id", to: "moderate_by_id#create"

    # --- Moderation results ------------------------------------------------
    get "moderation-results/recent", to: "moderation_results#recent"
    get "moderation-results/by-outcome", to: "moderation_results#by_outcome"
    get "moderation-results/for-listing/:listing_id", to: "moderation_results#for_listing"
    get "moderation-results/by-rule", to: "moderation_results#by_rule"
    get "moderation-results/latest-by-je-id/:je_id", to: "moderation_results#latest_by_je_id",
        constraints: { je_id: %r{[^/]+} }
    post "moderation-results/:id/override", to: "moderation_results#override"

    get "dashboard/stats", to: "dashboard#stats"
    get "dashboard/export-csv", to: "dashboard#export_csv"

    # --- Rules ---------------------------------------------------------------
    get "rules", to: "rules#index"
    post "rules", to: "rules#create"
    post "rules/suggest", to: "rules#suggest"
    patch "rules/:id", to: "rules#update"
    delete "rules/:id", to: "rules#destroy"
    post "rules/:id/toggle", to: "rules#toggle"

    # --- Saved views (per-moderator filter sets) -----------------------------
    get "saved-views", to: "saved_views#index"
    post "saved-views", to: "saved_views#create"
    delete "saved-views/:id", to: "saved_views#destroy"

    # --- Lists ---------------------------------------------------------------
    get "lists", to: "lists#index"
    post "lists", to: "lists#create"
    post "lists/seed", to: "lists#seed"
    post "lists/suggest", to: "lists#suggest"
    patch "lists/:id", to: "lists#update"
    delete "lists/:id", to: "lists#destroy"
    post "lists/:id/items", to: "lists#add_item"
    delete "lists/:id/items/:index", to: "lists#remove_item"

    # --- Message templates ---------------------------------------------------
    get "messages", to: "messages#index"
    post "messages", to: "messages#create"
    patch "messages/:id", to: "messages#update"
    delete "messages/:id", to: "messages#destroy"

    # --- Settings --------------------------------------------------------------
    get "settings", to: "settings#show"
    patch "settings", to: "settings#update"
    post "settings/reset", to: "settings#reset"

    # --- Image recognition -----------------------------------------------------
    get "image-recognition/results", to: "image_recognition#results"
    delete "image-recognition/results/:id", to: "image_recognition#destroy_result"
    delete "image-recognition/results", to: "image_recognition#destroy_all_results"
    get "image-recognition/analyses", to: "image_recognition#analyses"
    delete "image-recognition/analyses/:id", to: "image_recognition#destroy_analysis"
    delete "image-recognition/analyses", to: "image_recognition#destroy_all_analyses"
    post "image-recognition/analyze", to: "image_recognition#analyze"
    post "image-recognition/analyze-listing-url", to: "image_recognition#analyze_listing_url"

    # --- AI parameter scans ------------------------------------------------
    get "param-scans/recent", to: "param_scans#recent"
    get "param-scans/stats", to: "param_scans#stats"
    get "param-scans/by-je-id/:je_id", to: "param_scans#by_je_id", constraints: { je_id: %r{[^/]+} }

    # --- Remediation ---------------------------------------------------------
    get "remediation/stats", to: "remediation#stats"
    get "remediation/recent", to: "remediation#recent"
    post "remediation/batch-scan", to: "remediation#batch_scan"

    # --- System: LAS push (API-key auth, no session) -------------------------
    post "push-flagged", to: "push_flagged#create"
    match "push-flagged", to: "push_flagged#preflight", via: :options
  end

  # Image proxy (no auth, no CSRF)
  get "image-proxy", to: "image_proxy#show"
  match "image-proxy", to: "image_proxy#preflight", via: :options
end
