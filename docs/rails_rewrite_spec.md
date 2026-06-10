# FeedLens Moderation — Rails Rewrite Technical Spec

## Current Stack
- **Backend**: Convex (TypeScript) — serverless functions, real-time DB
- **Frontend**: React + Vite + Tailwind + shadcn/ui
- **Auth**: Convex Auth (@convex-dev/auth) with email/password
- **AI**: Anthropic Claude (vision + param scan) + OpenAI GPT-4o (fallback vision)
- **External**: Implio API (ad moderation platform), JE Mobile API (listing data)
- **Hosting**: Viktor Spaces (Vercel + Convex)

## Codebase Size
- Backend: ~12,800 lines TypeScript (27 files in `convex/`)
- Frontend: ~17,400 lines TSX/TS (14 pages, ~50 components)
- 124 total TS/TSX files

---

## Data Models (→ PostgreSQL tables)

### 1. `listings`
Primary entity. Imported from JE via mobile API or LAS push endpoint.
- `je_id` (string, unique index) — JE listing ID
- `title`, `price`, `currency`, `price_usd`, `price_on_request`
- `category` (real_estate, cars, etc.), `real_estate_type` (villa, apartment, etc.)
- `country`, `city`, `state`
- `bedrooms`, `bathrooms`, `living_area`, `land_area`
- `image_count`, `image_urls` (JSON array), `avg_image_width`, `avg_image_height`
- `lqi` (0-100 quality index), `description_length`, `description`
- `office`, `office_group_name`, `office_subscription` (freemium/basic/premium)
- `feed_source` (Kyero, DealerCenter, etc.), `listing_url`
- `rental` (bool), `pre_owned` (bool), `year`, `outdated` (bool), `price_per_sqm`
- GPT vision fields: `chatgpt_conclusion`, `chatgpt_property_condition`, `chatgpt_watermark_share`, etc.
- LAS accuracy fields: `accuracy_score` (0-1), `accuracy_flags` (JSON array), `accuracy_user_message`, `accuracy_action`, `accuracy_scanned_at`
- `moderation_status`: pending | approved | rejected | notice | manual
- `batch_id`, `imported_at`
- Indexes: je_id, status, batch, imported_at, country, feed_source

### 2. `moderation_results`
One per moderation run per listing.
- `listing_id` (FK), `je_id`
- `outcome`: approved | rejected | notice | manual
- `rule_matches` (JSON array of `{ruleName, ruleCategory, tier, action, message, details}`)
- `llm_triggered` (bool), `llm_response` (JSON: scores, assessment, recommendation, confidence, model, tokens)
- `seller_message`, `refuse_reason_type` (other/images/illegal/duplicate)
- `vision_result` (JSON), `vision_model`
- `confidence` (0-1)
- Override tracking: `overridden_by`, `overridden_at`, `override_reason`, `original_outcome`
- `processed_at`

### 3. `rules`
79+ moderation rules with config.
- `name` (unique), `display_name`, `description`
- `category`: simple_code | hybrid_vision | auto_ai | former_manual | internal
- `listing_category`: real_estate | cars | all
- `tier`: auto | verify | manual
- `enabled` (bool), `action`: reject | notice | flag
- `priority` (lower = runs first)
- `config` (JSON — varies by category, see Rule Engine below)
- `seller_message`
- Stats: `match_count`, `false_positive_count`, `last_matched_at`
- `created_at`, `last_modified_at`, `last_modified_by`

### 4. `moderation_lists`
Named lists of patterns used by rules (e.g., banned keywords, exception offices).
- `name` (unique), `display_name`, `description`
- `category`: automotive | exceptions | image_quality | location | real_estate.availability | etc.
- `source`: screenshots | implio | manual
- `items` (JSON array of `{value, type: "exact"|"regex", pattern?, flags?}`)
- `item_count`, `updated_at`

### 5. `message_templates`
Email/notice templates sent to sellers.
- `name`, `display_name`, `category` (reject/notice), `subject`, `body`, `is_default`

### 6. `moderators` (users)
- `name`, `email` (unique), `role` (admin/moderator/viewer), `status` (active/invited/disabled)
- `created_at`, `last_login_at`, `invited_by`, `action_count`

### 7. `moderator_activity`
Audit log.
- `moderator_id` (FK), `moderator_name`, `action`, `target_type`, `target_id`, `details`, `timestamp`

### 8. `image_recognition_results`
Standalone image analysis results.
- `listing_id` (FK), `je_id`, `title`, `image_urls`, `llm` (claude/gpt), `result` (JSON), `analyzed_at`

### 9. `listing_image_analyses`
Per-image analysis with Implio submission tracking.
- `je_id`, listing metadata fields, `total_images`, `analyzed_images`
- `per_image_results` (JSON), `summary` (JSON)
- `implio_status`, `implio_submitted_at`, `analyzed_at`

### 10. `ai_parameter_scans`
AI sanity checks on listing parameters.
- `listing_id` (FK), `je_id`, `verdict` (reject/review/ok)
- `flags` (JSON array of `{code, severity, message, field, expected, actual}`)
- `summary`, `confidence`, `parameters_checked` (JSON), `model`, `tokens_used`, `scanned_at`

### 11. `remediation_results`
Fix suggestions for listing errors.
- `listing_id` (FK), `je_id`, `has_fixable_errors`, `error_count`, `total_confidence`
- `suggestions` (JSON array), `description_score` (JSON)
- `feed_source`, `office`, `category`, `country`, `model`, `tokens_used`, `scanned_at`

### 12. `daily_stats`
Aggregated daily snapshots.
- `date`, `total`, `approved`, `rejected`, `noticed`, `manual`, `llm_calls`, `avg_confidence`

### 13. `settings`
Single-row app config.
- Alert settings, AI model config, moderation thresholds

---

## Rule Engine (Core Business Logic)

The moderation engine evaluates ~79 rules against each listing. Rules have categories:

### Rule Types & Config Schema

**simple_code** — Pure field checks:
```json
{
  "conditions": [{"field": "priceUsd", "operator": "<", "value": 490000}],
  "requireAll": true,
  "countryFilter": ["ES", "FR"],
  "excludeTypes": ["plot", "land"],
  "excludeTitleKeywords": ["castle", "chateau"],
  "excludeCountries": ["US"],
  "nonRentalOnly": true,
  "categoryFilter": ["real_estate"],
  "listRef": "name_of_moderation_list",
  "excludeListRef": "name_of_exception_list"
}
```

**hybrid_vision** — Field check + AI image analysis (Claude/GPT-4o)
**auto_ai** — Fully AI-driven analysis
**former_manual** — Previously manual Implio rules, now automated
**internal** — System rules (duplicate detection, etc.)

### Rule Evaluation Flow
1. Get all enabled rules sorted by priority
2. Resolve list references (listRef → actual patterns)
3. For each rule, check if listing matches conditions
4. Collect all matches → determine outcome (reject > notice > flag > approve)
5. If AI vision needed → call Claude/GPT with listing images
6. Save moderation result
7. Submit to Implio API (approve/reject with metadata)

---

## External Integrations

### 1. JE Mobile API (read listing data)
- `GET https://www.jamesedition.com/api/mobile/v1/listings/{id}`
- Returns full listing JSON (no auth needed, no Cloudflare blocking)
- Used by "Moderate by ID" feature

### 2. Implio API (submit moderation decisions)
- `POST https://api.implio.com/v1/ads`
- Auth: `X-Api-Key` header with `IMPLIO_API_KEY`
- Submits: listing data, decision (approve/reject), AI scores, seller messages
- Called after every moderation decision

### 3. Anthropic Claude API
- Vision analysis: `claude-haiku-4-5-20251001` (configurable)
- Parameter scanning: `claude-haiku-4-5-20251001`
- Direct HTTP calls to `https://api.anthropic.com/v1/messages`

### 4. OpenAI API
- Fallback vision: `gpt-4o`
- Direct HTTP calls to `https://api.openai.com/v1/chat/completions`

### 5. LAS Push Endpoint (inbound)
- `POST /api/push-flagged` — receives batch accuracy data from BigQuery/Airflow
- Auth: `X-Api-Key` header with `LAS_PUSH_API_KEY`
- Updates listing accuracy scores, flags, and actions

### 6. Image Proxy
- `GET /image-proxy?url={jamesedition_image_url}`
- Proxies `img.jamesedition.com` images to avoid CDN 500 errors
- Only allows `*.jamesedition.com` hostnames (SSRF protection)

---

## Frontend Pages (14 pages)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Public landing page |
| `/login` | Login | Email/password auth |
| `/dashboard` | Dashboard | Stats, charts (recharts), recent activity |
| `/queue` | Queue | Pending listings for review, bulk actions |
| `/moderation-log` | Moderation Log | History of all moderation decisions |
| `/rules` | Rules | CRUD for moderation rules |
| `/lists` | Lists | CRUD for moderation lists (patterns) |
| `/messages` | Messages | Email/notice template management |
| `/image-recognition` | Image Recognition | AI vision analysis tool |
| `/moderate-by-id` | Moderate by ID | Fetch & moderate single listing by JE ID |
| `/settings` | Settings | App config, AI settings, team management |

All pages behind auth (ProtectedRoute). Admin/moderator/viewer role-based access.

---

## Environment Variables Needed

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API for vision + param scans |
| `OPENAI_API_KEY` | GPT-4o fallback vision |
| `IMPLIO_API_KEY` | Implio ad moderation API |
| `LAS_PUSH_API_KEY` | Auth for inbound LAS data push |
| `DEFAULT_USER_PASSWORD` | Default password for admin-created accounts |

---

## Migration Notes

1. **Database**: All Convex tables → PostgreSQL with ActiveRecord models. JSON columns for flexible fields (config, results, flags).
2. **Real-time**: Convex provides real-time subscriptions. In Rails, use ActionCable/Hotwire for live updates or accept polling.
3. **Auth**: Replace Convex Auth with Devise. Simple email/password.
4. **Background jobs**: Convex actions → Sidekiq jobs for AI calls, Implio submissions.
5. **API**: Convex mutations/queries → Rails controllers. Keep REST-style.
6. **Frontend**: Can keep React SPA hitting Rails API, or rewrite with Hotwire/ERB for JE consistency.
7. **The 79 rules + 22 lists**: Seed data — port `seedAllRules.ts` and `seedLists.ts` to `db/seeds.rb`.

## Source Code
GitHub: `timur-cell/feedlens_moderation` (full codebase)
