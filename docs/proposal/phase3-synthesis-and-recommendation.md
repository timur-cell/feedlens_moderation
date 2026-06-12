# Phase 3 — Synthesis & Recommendation: In-House Moderation v1

This compares the prototype (Phase 1 code review, validated against the
production export) with industry practice (Phase 2 research) and proposes a
target architecture, the specific repo changes, a roadmap, and an honest verdict.

**Convention:** *Fact* = verified from code (`file:line`), the production export,
or a cited source. *Recommendation* = my proposal. v1 reliability is prioritized
over feature completeness, per the brief.

---

## 0. The honest verdict, up front

**Keep the project. Largely rebuild the decision path. Delete a lot.**

- The prototype is **not** fine as-is. In production it **auto-approved ~91% of
  listings, never once invoked its LLM, and ignored its own AI param-scan flags**
  (Phase 1 empirical section). Its hardest reject rules are dead due to field/type
  mismatches. As a moderation system it is currently close to a no-op with a large,
  expensive surface area.
- But the **foundations worth keeping are real**: a clean, pure, well-tested
  deterministic rule `Engine`; a 586-spec suite with golden fixtures; sound webhook
  auth; and a fail-to-manual instinct. The problem is **wiring and direction**, and
  that is the cheaper half to fix.
- Industry evidence says the *right* design here is **simpler than what exists**: a
  cheap deterministic cascade with the LLM as a constrained advisor behind a
  human-owned queue (Phase 2 §1, §3). The prototype over-built the parts that don't
  matter (Convex/Implio parity machinery) and under-built the parts that do
  (async processing, calibration, auditability, a feedback loop).

So: this is **not** "manufacture changes for their own sake." There is a real gap
between what the tool claims to do and what it does, and closing it means removing
complexity, not adding it.

---

## 1. Target architecture for v1 (simplest viable, with a clear extension path)

The design principle from research (Phase 2 §1–§3, validated by Besedo/Implio's
own model and the OLX/mobile.de/Subito hybrids): **cheap-deterministic-first
cascade, LLM as advisor not judge, human owns the consequential middle, everything
async and auditable.**

```
                          ┌─────────────────────────────────────────┐
  webhook / direct call → │ 1. INGEST (fast-accept, idempotent)      │
  (new/updated listing)   │    - validate + store raw event          │
                          │    - dedupe on (je_id, event_id)         │
                          │    - enqueue ModerateListingJob; 200 OK  │
                          └───────────────────┬─────────────────────┘
                                              │ (Solid Queue, bounded concurrency)
                          ┌───────────────────▼─────────────────────┐
                          │ 2. DETERMINISTIC ENGINE (authoritative)  │
                          │    - typed-field rules + lists           │
                          │    - hard auto-reject / hard auto-approve │
                          │    - else → escalate                     │
                          └───────────────────┬─────────────────────┘
                              clear            │ uncertain
                ┌────────────────────────────┐ │
                ▼                            ▼ │
        ┌──────────────┐          ┌────────────▼───────────────┐
        │ 3a. AUTO      │          │ 3b. LLM ADVISOR (optional)  │
        │  approve/reject│         │  - sanitized input          │
        │  w/ stored    │          │  - structured output        │
        │  reason       │          │  - calibrated, sampled      │
        └──────┬───────┘          │  - NEVER sole authority on   │
               │                  │    consequential rejects     │
               │                  └────────────┬───────────────┘
               │                      advise    │
               ▼                               ▼
        ┌──────────────────────────────────────────────────────┐
        │ 4. DECISION + ACTION (one guarded state machine)       │
        │    approve | reject | notice | manual-queue            │
        │    - persist decision + rule snapshot + model + reason │
        │    - never overwrite a human override                  │
        └───────────────────┬──────────────────────────────────┘
                            │
                ┌───────────▼───────────┐     ┌────────────────────┐
                │ 5. MANUAL QUEUE        │────▶│ 6. FEEDBACK LOOP    │
                │  (severity-ordered)    │ ovr │  override → rule FP │
                │  human decides         │     │  counter, metrics  │
                └────────────────────────┘     └────────────────────┘
```

**The five load-bearing decisions for v1:**

1. **Async, queue-first ingestion.** The HTTP handler validates, stores, dedupes on
   an idempotency key, enqueues, returns 200. All AI/vision/LLM work runs in Solid
   Queue with bounded concurrency. *(Fixes Phase 1 C2; matches Phase 2 §1 event-
   driven consensus and the idempotency/fast-accept pattern.)* This single change
   removes the outage risk and is the highest-priority item.

2. **Deterministic rules are authoritative; the LLM only breaks ties.** Hard
   reject/approve rules decide on their own. The LLM is consulted **only** for the
   genuinely uncertain middle, its output is **advice**, and a consequential
   auto-reject requires either a deterministic rule or human confirmation — never
   the LLM's self-reported confidence alone. *(Fixes C1's default-open + C3; matches
   Phase 2 §3: LLM confidence is miscalibrated and injectable, so it must not gate
   removal.)*

3. **Fail-to-manual, not fail-to-approve.** When any rule path fires but can't reach
   a confident clean decision — including when the LLM/vision is down or the API key
   is missing — the listing goes to the **manual queue**, not to auto-approve.
   Genuinely clean listings (no rule hit) can still auto-approve. *(Fixes C1; this is
   the explicit fail-open-vs-fail-closed choice from Phase 2 §1 — for a luxury
   marketplace, fail toward human review.)*

4. **One guarded state machine for `moderation_status`.** A single transition method;
   machine decisions cannot silently overwrite a human override; every transition
   records who/why. *(Fixes C4/C5; required anyway by DSA Art. 17/20 — stored reason
   + human-owned reversal, Phase 2 §6.)*

5. **Every decision is reconstructible.** Persist on each result: the rule
   version/snapshot that matched, the model id + prompt version (if LLM used), the
   thresholds in effect, and a human-readable reason. *(Fixes S9; DSA statement-of-
   reasons, Phase 2 §6.)*

**What v1 deliberately does NOT include:** vision on every listing, an LLM in the
hot path, proactive auto-rewriting of seller text, cron "routines," or a trust-tier
system. Those are roadmap items (§3), gated on v1 being reliable and measured.

---

## 2. Specific changes to the current repo

### 2A. Fix (correctness — these make the system actually moderate)
- **Flip the default-open posture.** `engine.rb:144`: a listing that triggered any
  rule path but didn't reach a confident clean state should resolve to `manual`, not
  `approved`. Keep auto-approve only for genuinely no-match-clean listings.
- **Repair the dead rules / data plumbing** (all confirmed against the production
  export):
  - Populate `price_usd` at ingest. **Owner's input (2026-06): JamesEdition
    already auto-converts prices to USD in its own code** — so the fix is
    plumbing, not building an FX service: identify the USD field in the JE
    API / push payload (the current `JeClient` parses only `price`/`currency`
    and `fetch_and_moderate.rb` hardcodes `price_usd: nil`) and map it
    through. Until that lands, 23 `priceUsd` rules compare USD thresholds
    against raw EUR/GBP/AED via the `price_of` fallback;
  - Add a field-name alias map (or rename rule fields) so `gptCondition`/`gptConclusion`/
    `gptWatermarkSold`/`gptImageType`/`viktor*` resolve to the hash keys the engine
    actually exposes. `rule_evaluator.rb:206`, `runner.rb:142-143`.
  - Route single-field `country` conditions through `CountryMatcher`
    (`condition_evaluator.rb:30`), and **fix the comma-split country parser**
    (`je_client.rb:323` produces "Andalusia"/"Marbella" as countries).
  - Populate `officeGroupId` or rewrite the 8 `groupFilter` rules against a real
    field. `rule_evaluator.rb:146`.
  - Word-boundary match for `exact` list items (`rule_evaluator.rb:310`); honor
    `conditions` on rules that also carry a `listRef` (`engine.rb:114`).
- **Add the one test that prevents regressions of all the above:** assert every
  enabled reject rule can match at least one fixture listing. (The golden suite is
  the right place; it currently locks in parity, not efficacy.)
- **Harden the LLM path** *(if/when it's in the loop)*: sanitize/delimit seller text
  and treat it as untrusted data (C3); stop disclosing the threshold in the prompt
  (S5); put `recommendation`/`confidence` first and raise `MAX_TOKENS`, and treat
  `stop_reason == "max_tokens"` as a degrade signal (S4); add bounded retry/backoff
  for 429/5xx and wire the existing `alert_on_api_errors` flag (S1).
- **Vision SSRF/size hardening** (S6): allowlist public hosts, block private/link-
  local ranges, cap body size, validate content-type. *(Only relevant once vision is
  used deliberately — see §3.)*
- **Transactions + locks** around persist (S7): wrap `ModerationResult.create!` +
  `listing.update!` + stats in a transaction with a per-listing advisory lock;
  `update_counters` for `match_count`.
- **Webhook idempotency** (C5): dedupe on a stable event id; monotonic-timestamp
  guard; don't downgrade a human-decided status; return non-2xx for genuinely failed
  items so the sender retries.

### 2B. Simplify / delete (these remove the over-engineering the owner suspected)
- **Delete the Implio submit-back integration** — `ImplioClient` (~199 lines), its
  unused job, and 3 call sites. They're replacing Implio; the integration only logs
  (stub default on) and is never enqueued. (Phase 1 N1.)
- **Delete the dead `accuracy` category** — 13 seed rules + `evaluate_accuracy`
  (~55 lines); doubly dead (excluded from evaluation AND its fields never mapped).
  (N2.)
- **Collapse the rule taxonomy** from 6 categories to a `needs_llm` boolean + a
  display label; in the evaluation code the 6 categories already reduce to 2
  behaviors. (N3.)
- **Retire the Convex parity layer incrementally:** keep only `JsCompat`'s regex
  translation (it actively causes the falsy-zero price bug elsewhere); replace
  `ConvexDoc` + `*_at_ms` shadow columns with standard `as_json`/ISO-8601 + one SPA
  shim; consolidate the 4 copy-pasted JSON-fence-stripping blocks into the existing
  helper. (N4, N5, N6.) *This is the bulk of the "simplified at launch" win.*
- **Decide ParamScan's fate:** as built it's a paid Claude call per listing whose
  verdict changes nothing (10 of 11 flagged listings were approved anyway). Either
  **feed it into the decision** (make its `review`/`reject` verdict escalate to
  manual) or **cut it from the hot path**. Don't keep paying for an ignored signal.
  (S10.)
- **Drop `daily_stats`** (written only by the importer, read by nothing) or
  repurpose it as the dashboard rollup that also fixes the full-table-scan dashboard
  (S8). Add the missing composite index for the queue/poll queries (N9).

### 2C. Keep (don't touch these)
- The pure `Moderation::Engine` core and the RSpec + golden-fixture harness.
- Constant-time webhook auth.
- The fail-to-manual rescue posture (just change its *default direction*).

---

## 3. Roadmap — and an explicit verdict on your three ideas

### Idea A — Cron jobs / "routines" modeled inside the tool for proactive scanning
**Verdict: Yes, but as plain scheduled jobs, not a new in-tool abstraction. Phase 2.**
- Industry precedent is strong for *periodic re-scanning* (re-validate live listings,
  catch ones that went stale/sold, re-check after rule changes). Property Finder's
  auto-unpublish-after-3-days and Bayut's badge expiry are exactly this.
- **Recommendation:** use Solid Queue's recurring jobs (the repo already has
  `recurring.yml`) for concrete routines — "re-moderate listings older than N days,"
  "expire stale approvals," "sweep `pending` listings stuck by a failed enrich"
  (which today are invisible forever — C5). **Do not** build a generic
  "routines engine" DSL inside the app; that's the kind of speculative framework
  that got the prototype into trouble. Model each routine as one small job.
- *Reliability note:* these must be idempotent and bounded (they run against the
  whole catalog), and they belong **after** v1's async pipeline exists, or they'll
  amplify the current thread-starvation problem.

### Idea B — Additional AI rules
**Verdict: Yes, incrementally, gated on calibration and a feedback loop. Phase 2–3.**
- This is how Besedo/Kaidee ramped (65%→85% automation over years, accuracy-gated)
  and how OLX operates (40+ models). Adding AI capability is right; adding it as
  *more uncalibrated auto-deciders* is not.
- **Recommendation:** introduce new AI rules in **"tracking-only" mode first**
  (Implio's own pattern — Phase 2 §2): the rule runs, logs what it *would* have done,
  and a human compares against actual outcomes until it clears an accuracy bar (Besedo
  targets ≥95%) before it's allowed to auto-act. This requires the **feedback loop**
  (override → `false_positive_count` → rule metrics) that is currently dead (N7) — so
  **build the feedback loop before the AI rules.** Prefer cheap specialized
  classifiers over LLM calls for high-volume narrow checks (Phase 2 §3); reserve the
  LLM for the uncertain middle.

### Idea C — Proactive moderation (fix + notify seller, vs just blocking)
**Verdict: Strongly validated by industry practice — implement it, but scoped to
structured fixes with the seller in the loop, not silent AI rewriting. Phase 2–3.**
- Phase 2 §4 found this is mainstream: eBay/Mercari/Meta auto-generate listings,
  Bayut/Property Finder/eBay/Amazon run listing-quality scores with "fix this"
  coaching, eBay/Mercari/CarGurus do price-anomaly guidance, and **Property Finder
  runs the exact "flag mismatch → notify → auto-unpublish if uncorrected" loop in
  production.** Subito explicitly *contacts the seller* as a moderation action.
  Nudging demonstrably works ("Reconsidering Tweets": 22% revised).
- **Recommendation, in order of safety:**
  1. **Quality score + completeness nudges** (objective, no AI risk): too few photos,
     short description, missing fields → "improve your listing," down-rank or hold
     rather than hard-reject. Highest ROI, lowest risk, directly mirrors
     Bayut/Property Finder.
  2. **Structured auto-corrections with notify** (verifiable): wrong category,
     obvious price-unit error, currency — suggest/auto-fix and tell the seller, with
     an undo. Mirrors Adevinta Cognition auto-fill.
  3. **Price-anomaly nudge** (advisory): "your price is far from comparable listings."
  4. **Avoid for v1:** LLM-rewriting the seller's free-text description and
     republishing it — that reintroduces every injection/calibration risk from §3
     and has the least industry precedent. If pursued later, do it as a *suggestion
     the seller accepts*, never a silent edit.
- *DSA note:* "fix + notify" is also the compliance-friendly path — a quality nudge or
  a correction-with-notice is lighter-touch than a rejection and still satisfies the
  statement-of-reasons expectation when you do enforce.

### Roadmap sequence (dependency-ordered)
1. **v1 reliability** (§1, §2A async + fix dead rules + state machine + auditability;
   §2B deletions). *Goal: the system actually moderates, reliably, and you can prove
   why each decision happened.*
2. **Feedback loop + metrics** (override→FP counter, precision/recall on a labelled
   set, golden datasets per Phase 2 §1 claim 13–15). *Goal: you can measure
   automation rate and accuracy.*
3. **Proactive quality nudges (Idea C.1)** + **scheduled routines (Idea A)**.
4. **Tracking-mode AI rules → graduated auto-action (Idea B)** + structured
   auto-correction (Idea C.2–3).
5. *Later/optional:* trust-tiering (fast-lane trusted offices), vision at scale,
   richer proactive correction.

---

## 4. What "good" looks like, and a reality check

- The defensible target from peers is **~80–90% automation at high accuracy with most
  listings live in minutes** (Besedo Anibis/Kaidee, all self-reported — Phase 2 §2).
  That is reachable, but it is an **operational program** (labelled data, the
  feedback loop, gradual accuracy-gated automation), not a one-time build. OLX's
  in-house success runs on a standing data-science + moderation org (Phase 2 §5).
- The prototype's current effective automation is ~91% approve — but that's
  *automation without moderation*, which is worse than Implio, not better. The bar for
  v1 is not "more automated than Implio"; it's "automates the easy decisions
  **correctly** and routes the rest to humans **reliably**."
- **Build-vs-buy honesty:** in-house is the right call for control/cost at 400k/month,
  but the research's recurring warning (Phase 2 §5) applies — an MVP that looks done
  can collapse under real use, which is precisely what the production export shows
  already happened once. v1 should be ruthlessly simple and measured before it grows.

---

## 5. Traceability

- Phase 1 findings: `docs/review/phase1-code-review.md` (each finding `file:line`-cited
  and re-verified; headline findings additionally confirmed against the production
  export).
- Phase 2 research: `docs/research/phase2-industry-research.md` (claims with source
  URLs and confidence grades; vendor self-reported figures flagged).
- The VPS at `187.124.46.57` could not be inspected (sandbox egress blocks SSH/direct
  HTTP); runtime tuning recommendations are code/load-derived, not measured. Rotate
  the root credential that was shared in chat.
