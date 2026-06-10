# FeedLens Rails REST API Contract

Shared contract between the Rails backend (`rails/`) and the React SPA (`src/`).
Behavior parity target: the Convex implementation in `convex/` (read it when ambiguous).

## Conventions

- All endpoints are JSON under `/api` except `GET /image-proxy`.
- **JSON keys are camelCase** (matching the Convex document shape the frontend already consumes).
- Records serialize like Convex docs: `_id` (string), `_creationTime` (epoch **milliseconds**), plus camelCase fields.
  All timestamp fields (`processedAt`, `importedAt`, `updatedAt`, `createdAt`, `lastLoginAt`, `overriddenAt`,
  `analyzedAt`, `scannedAt`, `lastMatchedAt`, `lastModifiedAt`, …) are epoch milliseconds (numbers), as in Convex.
- DB columns are snake_case; serializers camelize.
- Auth: Devise session cookies. CSRF: the SPA sends `X-CSRF-Token` fetched from `GET /api/session` (also set as
  `XSRF-TOKEN` readable cookie); non-GET requests without a valid token are rejected (422/401).
- Roles: `admin | moderator | viewer`; status: `active | invited | disabled`.
  - `require_moderator!` = any **active** account (any role) → else 401 `{ "error": "Unauthorized: an active moderator account is required." }`
  - `require_admin!` = active + role admin → else 403 `{ "error": "Forbidden: admin role required." }`
  - Mirrors `convex/authz.ts` exactly (note: viewers pass `require_moderator!` — same as TS).
- Errors: `{ "error": "<message>" }` with appropriate status (401/403/404/422/400).

## Auth / session

| Method & path | Auth | Body / params | Returns |
|---|---|---|---|
| `GET /api/session` | none | — | 200 `{ user: ModeratorDoc \| null, csrfToken }` |
| `POST /api/session` | none | `{ email, password }` | 200 `{ user, csrfToken }`; 401 on bad creds; updates `lastLoginAt`, sets status invited→active |
| `DELETE /api/session` | session | — | 204 |
| `POST /api/password` | none | `{ email }` | 200 always (sends Devise reset mail if SMTP configured) |
| `PUT /api/password` | none | `{ token, password }` | 200 / 422 |

ModeratorDoc: `{ _id, _creationTime, name, email, role, status, createdAt, lastLoginAt?, invitedBy?, actionCount? }`

## Users / team (mirrors convex/users.ts + adminUsers.ts)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/users` | moderator | all moderators |
| `GET /api/users/stats` | moderator | `{ total, active, invited, disabled, admins, moderators, viewers }` |
| `GET /api/users/:id/activity?limit=` | moderator | activity log entries |
| `GET /api/activity?limit=` | moderator | recent activity (default 50) |
| `POST /api/users` | admin | `{ name, email, role, password? }` → creates active login (password defaults to `DEFAULT_USER_PASSWORD` env). Returns `{ success, moderatorId, message, password }` |
| `PATCH /api/users/:id` | admin | `{ name?, role?, status? }` |
| `DELETE /api/users/:id` | admin | soft delete → status disabled |
| `POST /api/users/:id/reactivate` | admin | status active |
| `POST /api/users/set-password` | admin | `{ email, newPassword }` → `{ success, message }` |

## Listings (convex/listings.ts)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/listings/pending` | moderator | status=manual, limit 100, newest first (queue) |
| `GET /api/listings/recent?limit=50` | moderator | by importedAt desc |
| `GET /api/listings?status=&limit=50` | moderator | by status |
| `GET /api/listings/stats` | moderator | `{ total, approved, rejected, noticed, manual, pending }` |
| `GET /api/listings/:id` | moderator | by primary key |
| `GET /api/listings/by-je-id/:jeId` | moderator | |
| `POST /api/listings/:id/moderate` | moderator | runs rule engine; returns `{ outcome, ruleMatches, llmTriggered, confidence, visionAnalyzed?, aiScanVerdict? }` |

## Moderate by ID (convex/fetchListing.ts)

`POST /api/moderate-by-id` (moderator) — body `{ inputs: string[] }` (JE ids or URLs).
Fetches from the JE mobile API, creates/updates listing, optionally vision-scans (countries in
`settings.visionCountries`), runs moderation. Returns
`{ success, count, successCount, errorCount, results: [{ jeId, input, listingId?, title?, outcome?, ruleMatches?, llmTriggered?, visionAnalyzed?, status, dataSource?, error?, aiScan? }] }`.

## Moderation results (convex/moderation.ts)

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/moderation-results/recent?limit=50` | moderator | by processedAt desc |
| `GET /api/moderation-results/by-outcome?outcome=&limit=50` | moderator | |
| `GET /api/moderation-results/for-listing/:listingId` | moderator | |
| `GET /api/moderation-results/by-rule?ruleName=&limit=20` | moderator | `{ total, totalResults, percentage, items: [{ result, listing }] }` |
| `GET /api/moderation-results/latest-by-je-id/:jeId` | moderator | single result or null |
| `POST /api/moderation-results/:id/override` | moderator | `{ newOutcome, reason?, sellerMessage?, refuseReasonType? }`; attributes to the session moderator; stores originalOutcome |
| `POST /api/moderation-results/:id/override-with-implio` | moderator | override + Implio submit → `{ success, implioSubmitted, implioError? }` |
| `GET /api/dashboard/stats?startDate=&endDate=` | moderator | `{ stats: {...}, dailyData: [...] }` (epoch ms params) |
| `GET /api/dashboard/export-csv?startDate=&endDate=` | moderator | JSON array of export rows (same as TS `exportCSV`) |

## Rules (convex/rules.ts) — reads moderator, writes admin

`GET /api/rules` · `POST /api/rules` · `PATCH /api/rules/:id` · `DELETE /api/rules/:id` ·
`POST /api/rules/:id/toggle` · `POST /api/rules/suggest` (AI; moderator).

## Lists (convex/lists.ts) — reads moderator, writes admin

`GET /api/lists` · `POST /api/lists` · `PATCH /api/lists/:id` · `DELETE /api/lists/:id` ·
`POST /api/lists/:id/items` (body `{ item: {value,type,pattern?,flags?} }`) ·
`DELETE /api/lists/:id/items/:index` · `POST /api/lists/seed` (admin; reseed from JSON) ·
`POST /api/lists/suggest` (AI; moderator).

## Message templates — reads moderator, writes admin

`GET /api/messages` · `POST /api/messages` · `PATCH /api/messages/:id` · `DELETE /api/messages/:id`

## Notes (convex/notes.ts) — moderator

`GET /api/listings/:listingId/notes` · `POST /api/listings/:listingId/notes` (`{ content }`; author = session user) ·
`DELETE /api/notes/:id`

## Settings (convex/settings.ts)

`GET /api/settings` (moderator; merged DB+defaults) · `PATCH /api/settings` (admin) ·
`POST /api/settings/reset` (admin)

## Image recognition (convex/imageRecognition*.ts) — moderator

| Endpoint | Notes |
|---|---|
| `GET /api/image-recognition/results` | saved results |
| `DELETE /api/image-recognition/results/:id` / `DELETE /api/image-recognition/results` | one / all |
| `GET /api/image-recognition/analyses` | listing image analyses |
| `DELETE /api/image-recognition/analyses/:id` / `DELETE /api/image-recognition/analyses` | one / all |
| `POST /api/image-recognition/analyze` | `{ imageUrls, title, jeId? }` → Claude vision (GPT-4o fallback) |
| `POST /api/image-recognition/analyze-listing-url` | `{ url }` → fetch JE listing, per-image analysis |
| `POST /api/image-recognition/submit-implio` | `{ jeId, outcome, message? }` |

## AI parameter scans (convex/aiParamScan.ts) — moderator

`GET /api/param-scans/recent?limit=` · `GET /api/param-scans/by-je-id/:jeId` · `GET /api/param-scans/stats` ·
`POST /api/listings/:id/param-scan`

## Remediation (convex/remediation.ts) — moderator

`GET /api/remediation/stats` · `GET /api/remediation/recent?limit=&offset=` · `POST /api/remediation/batch-scan`

## System endpoints

- `POST /api/push-flagged` — `X-Api-Key` must equal `LAS_PUSH_API_KEY` (constant-time compare;
  `ActiveSupport::SecurityUtils.secure_compare` on padded/hashed values). Same body contract, dedup
  (`ai_validated_at` + `user_message` vs stored `accuracySourceUpdatedAt`/`accuracyUserMessage`),
  response `{ processed, skipped, created, updated, errors }`. Creates/updates listing, sets status `manual`,
  enqueues `EnrichListingJob`. 401 on bad/missing key; 400 on bad JSON / missing listings array.
- `GET /image-proxy?url=` — no auth. Parse URL; require `https:` and hostname `jamesedition.com` or
  `*.jamesedition.com` (parsed hostname check, not substring). 400 invalid, 502 fetch error,
  proxies content-type + cache headers.

## Background jobs (Solid Queue)

- `ClaudeVisionJob` / vision service — Claude messages API, model from settings, GPT-4o fallback.
- `AiParamScanJob` / param scan service.
- `ImplioSubmissionJob` — payload parity with TS `submitToImplio`; `IMPLIO_STUB=true` (default) logs instead of POSTing.
- `EnrichListingJob` — JE mobile API enrichment after push-flagged create.

AI/HTTP calls run synchronously inside request flows where the TS action was synchronous
(moderate-by-id, analyze) — implemented as service objects also wrapped by jobs for async use.

## Env vars

`DATABASE_HOST/PORT/USER/PASSWORD/NAME`, `SECRET_KEY_BASE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`DEFAULT_USER_PASSWORD`, `LAS_PUSH_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `IMPLIO_API_KEY`,
`IMPLIO_STUB` (default true), `SMTP_*` (Devise mailers). Frontend: `VITE_API_BASE` (default same-origin `""`).
