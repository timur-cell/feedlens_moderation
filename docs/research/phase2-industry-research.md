# Phase 2 — How Classifieds Platforms Moderate Listings (Industry Research)

**Question:** How do classifieds/marketplace platforms worldwide moderate
user-submitted listings, where does AI fit, and is "proactive moderation"
(auto-correct + notify the seller, rather than just block) real industry
practice?

**Method:** five parallel research angles (architectures; named platforms US /
Europe / Asia / MENA across real-estate, autos, and general goods; proactive
moderation; LLMs-in-moderation + EU law; ideal architecture + Besedo/Implio).
Claims were collected as falsifiable statements with source URLs and a
source-quality grade.

> **Sourcing caveat (important):** the research environment blocked direct page
> fetches (HTTP 403) for most primary domains, so figures were captured from
> search-engine result snippets and cross-checked against secondary reporting
> rather than read verbatim. Vendor case-study numbers (Besedo, OLX, eBay,
> Meta) are **self-reported marketing/PR** unless noted. URLs are given so each
> load-bearing number can be confirmed in a browser before it's treated as
> fact. I mark confidence as **[strong] / [medium] / [weak]** per claim.

---

## 1. The canonical architecture: hybrid, confidence-tiered, human-in-the-loop

There is a clear industry consensus on the shape of a marketplace moderation
system, and it is **not** "an AI decides." It is a pipeline:

> **signal ingestion → rule/ML scoring (parallel: text, image, price, seller
> history) → confidence-tiered decision → action → human review queue → audit +
> feedback loop.**

- Moderation is canonically split into **pre-publication** (hold until approved;
  max safety, adds latency), **post-publication** (publish then remove; better UX,
  higher risk), and **reactive** (user-report driven). Listings are a textbook
  pre- or hybrid case, and the choice is an explicit speed-vs-safety trade-off.
  [strong] — getstream.io, lassomoderation.com, digi-texx.com
- The **decision layer is a confidence-tiered router**: auto-act only on the
  extremes (e.g. very-high / very-low risk), route the uncertain middle band to
  humans, and order that human queue by **harm severity × reach**. Practitioners
  call the auto-vs-human threshold "the single most consequential engineering
  decision." [medium] — getstream.io moderation course, searchatlas.com
- The Digital Trust & Safety Partnership (industry standards body) defines
  moderation as relying on "some combination of people and machines… automation
  executing simpler tasks at scale and humans focusing on issues requiring nuance
  and context." [strong] — dtspartnership.org
- An **event-driven / queue design** (decouple moderation from the publish path,
  replayable log, partitioned for parallelism) is the standard way to scale and
  stay resilient. [medium, by analogy] — confluent.io

**Relevance to us:** this is exactly the architecture our prototype *gestures at*
but doesn't actually run — our pipeline is synchronous, not queued; our "router"
trusts a single LLM's self-reported confidence; and our human-review band is a
dumping ground, not a severity-ordered queue (see Phase 1 C2, C3).

## 2. What Implio/Besedo (the thing we're replacing) actually is

This matters because the prototype copied Implio's *vocabulary* (tiers,
categories, lists, viktor_* flags) without copying its *architecture*.

- Implio is a **rule engine over typed fields + curated lists + AI classifiers as
  inputs**, with exactly **three terminal actions — approve / reject / send-to-
  manual — plus a tracking-only ("no action") mode.** AI model output becomes a
  *tag* that a human-authored rule consumes; the AI does not decide on its own.
  [medium, vendor docs] — help.besedo.com
- The rule builder is **drop-down/no-code over fields like title, price, user id,
  region**; Besedo ships shared global "Smart Lists" (denylists, image-similarity)
  so customers don't start from scratch. [medium, vendor] — besedo.com
- Besedo's stated design rule: **automation and accuracy trade off** ("the more
  automation you want, the less accuracy"), and they target **≥95% filter accuracy
  before automating** a decision. [medium, vendor] — besedo.com
- Published classifieds automation benchmarks (all **self-reported marketing**):
  Anibis ~**94% automation at 99.8% accuracy**; Kaidee **85% automation, >95%
  accuracy, 94% of ads live within 5 min**, grown incrementally 65%→85% over ~3
  years, 55% smaller moderation team. [weak, vendor self-report] — besedo.com
- Besedo markets Implio as automating "**up to 80%**" of moderation. [weak,
  vendor] — besedo.com

**Takeaway:** the contract to match is modest and clear — *typed-field rules +
lists + AI tags → {approve, reject, manual} + tracking mode*, ramped up
gradually with accuracy gating. The legacy `viktor_reject`/`tier`/6-category
machinery in our repo is incidental to that contract, not essential to it.

## 3. AI's real role: a cheap-first cascade, with the LLM on a short leash

The research is consistent and, for our purposes, corrective:

- **High-volume platforms default to cheap classifiers, not LLMs.** Google's
  Perspective API (a lightweight toxicity classifier, not an LLM) was doing **~500M
  requests/day in 2021**. Lightweight fine-tuned classifiers can rival LLM "guard"
  models on narrow tasks at <0.05s latency. [strong / medium] — Jigsaw PR;
  aimoderationtools.com
- The consensus pattern is a **cascade / router**: cheapest check first, escalate
  to an expensive model only on low confidence — reported to cut blended cost
  **~45–85%** while keeping most quality, *when most traffic resolves cheaply*.
  [medium, practitioner] — tianpan.co
- **But LLM self-reported confidence is not trustworthy.** An ICLR 2025 study across
  9 guard models / 12 benchmarks found them **systematically overconfident and
  miscalibrated** (often >90% confidence on safe inputs), degrading under attack.
  LLM-as-judge also shows **self-preference** and **position bias**. [strong,
  peer-reviewed] — arXiv 2410.10414, 2410.21819, 2506.22316
- **Prompt injection is a live, demonstrated threat to moderation pipelines.**
  Indirect prompt injection has been catalogued with 22 in-the-wild techniques
  explicitly including "suppress/manipulate moderation"; "emoji smuggling" hit
  **100% success** against some detection guardrails. [strong, security vendors +
  arXiv] — unit42.paloaltonetworks.com, arXiv 2504.11168
- OpenAI's own "GPT-4 for content moderation" (2023) frames the LLM as a
  **policy-iteration accelerator and triage aid that needs humans in the loop** —
  it beat lightly-trained but not experienced human moderators. [medium, vendor] —
  openai.com
- **Image/AI-render detection is not reliable enough to stand alone**: SynthID-style
  watermarks degrade under cropping/re-rendering, and a missing watermark is "not
  proof an image is real." Multimodal moderation APIs have category coverage gaps.
  [strong, vendor-stated limits] — blog.google, openai.com

**Direct implication for our repo:** the prototype does the *opposite* of the
consensus — it puts an **uncalibrated LLM's self-reported confidence in charge of
auto-reject/approve**, feeds it **raw seller text** (injectable), and **tells it
the threshold**. Industry practice says: cheap deterministic checks decide the
clear cases, the LLM only *advises* on the uncertain middle, its confidence is
treated as unreliable, and a human owns the consequential calls.

## 4. "Proactive moderation" (auto-correct + notify) — VALIDATED

This was the user's hypothesis to test. **It is real, mainstream, and arguably
the dominant direction of travel** — though with an important nuance about what
"correct" means. It shows up in three concrete forms:

**(a) AI-assisted listing creation (auto-generate / auto-categorize / auto-price)**
- **eBay "Magical" listing tool** (Sept 2023): generates title, description,
  category/subcategory, and suggests price + shipping from one photo; eBay reported
  ~30% of daily US app sellers tried it and 95%+ of triers kept the AI description.
  [strong] — innovation.ebayinc.com, TechCrunch
- **Mercari "AI Listing Support"** (default-on Sep 2024): auto-fills description,
  condition, and price from a photo. [strong] — about.mercari.com
- **Meta / Facebook Marketplace AI** (2026): generates title, description, and
  suggested local price from photos. [medium] — about.fb.com, valueaddedresource.net
- **OLX**: category-prediction model auto-selects category from the title and
  *recommends improvements* (add images, replace blurry images). [strong] —
  tech.olx.com
- **Leboncoin**: ~70 AI features incl. auto-generated descriptions. [medium] —
  leboncoin engineering blog

**(b) Listing-quality scoring + explicit "improve your listing" coaching**
- **Bayut / dubizzle (Profolio)** — the cleanest MENA example: a **tri-color listing
  quality score**; a listing stays "yellow" until required elements are added
  (floor plans, ≥10 photos at set resolution, 750–2000-char descriptions), then
  turns "green" and **ranks higher**. Non-compliant = down-ranked, not deleted.
  [strong, vendor docs] — bayut.com
- **eBay Listing Quality Report** and **Amazon Listing Quality Dashboard** (Item
  Data Quality score 0–100): both score listings and tell sellers exactly what to
  fix. [strong / medium] — ebay.com, reasonautomation.com
- **Etsy** quality score with a temporary new-listing search boost. [medium] —
  etsy.com

**(c) Price guidance / anomaly nudges**
- **eBay** in-flow price recommendation from recently-sold comparables, with a
  sell-through-likelihood graph. [strong] — ebay.com
- **Mercari Smart Pricing**: NN-suggested price + floor, auto-adjusting toward the
  floor. [strong] — mercari engineering
- **CarGurus** rates every used-car listing Great/Good/…/Overpriced vs an ML
  "Instant Market Value," and tells dealers the price cut needed to reach a better
  rating. [strong] — cargurus help

**(d) The strongest production example of the exact loop the user proposed —
Property Finder (Dubai).** Its Dubai listing verification became **fully
automated via the Dubai Land Department API** (June 2025): the system
**auto-flags a price mismatch** against the official permit (e.g. listing AED
2.2M vs permit AED 2.0M) in a "Listings Action Tracker" and **auto-unpublishes
the listing after 3 days if the seller doesn't correct it.** Its per-listing
**Quality Score** runs concrete automated checks (title 20–50 chars, description
300–2000 chars, image ≥800×600 at aspect 1.3–1.8, one photo per room) and an
automated price-comparison that penalizes outliers; agents need an average
score >85% to qualify for the "SuperAgent" ranking boost. [strong, vendor docs]
— support.propertyfinder.ae. **Bayut** similarly runs a **pre-publication
"Instant Check"** gate (listings don't publish until compliance/DLD-permit
status passes) and auto-assigns its "TruCheck" badge from regulator data.
[strong, vendor docs] — support.bayut.com. This is "detect problem → notify
seller → give them a window to fix → enforce if they don't," in production, at a
direct vertical peer.

**(e) Auto-fill of structured attributes is mature in classifieds specifically.**
Adevinta's "Cognition" team ships a CNN reaching **90–95% accuracy** on
brand/model/colour/year that lets sellers auto-fill required ad fields from a
photo (in production on coches.net); Finn.no auto-populates ad tags via image
recognition; Leboncoin auto-populates attributes with an n-gram classifier;
Carousell auto-suggests category+title from the photo in <100ms. mobile.de
launched an AI listing **"Qualitätscheck"** (Feb 2026) scoring images/attributes/
description out of 100% to improve ranking — explicitly **advisory, not
auto-rewriting**. [strong/medium, eng blogs + newsrooms] — adevinta tech blog,
tech.finn.no, mobile.de newsroom. mobile.de also routes fraud-scored private
listings (Catboost/H2O ensemble, **F1≈0.73**) to a **human** agent rather than
auto-deleting. [strong, peer-reviewed] — ceur-ws.org Vol-3052.

**The behavioral evidence (from adjacent social-media research):** nudging users to
fix problematic content *works* — the "Reconsidering Tweets" A/B study found a
prompt led 9% to cancel and 22% to revise. [strong, peer-reviewed] — arXiv
2112.00773. Trust & Safety practice formally describes a **soft-to-hard
enforcement spectrum** (warn → label → down-rank → quarantine → remove) as the
proportionate alternative to binary block. [strong, TSPA] — tspa.org

**Two honest caveats for our context:**
1. Most named examples auto-improve listings **at creation, on the seller's
   behalf, with the seller in the loop** (suggest title/price/category). They are
   *fewer* documented cases of a moderation system **silently rewriting an already-
   submitted listing's content**. The defensible version is **"suggest the fix +
   down-rank/hold until accepted + notify,"** not "edit their text and republish."
2. Auto-*correcting* a structured/objective attribute (wrong category, missing
   floor plan, a clearly-mis-keyed price) is well-supported. Auto-*rewriting*
   subjective prose with an LLM reintroduces every reliability/injection problem
   from §3. So proactive moderation is strongest for **structured, verifiable
   fixes**, weakest for free-text rewriting.

## 5. Build-vs-buy reality & in-house proof points

- **OLX** is the closest "built it in-house at classifieds scale" proof: 40+ ML
  services across nudity/fraud/forbidden-items/duplicates/spam/chat for ~300M MAU,
  fraud down ~90% over 3 years — but that is a **standing data-science + moderation
  org**, not a side project. [medium, company PR] — olxgroup.com, tech.olx.com
- A widely-echoed failure pattern: in-house moderation MVPs "collapse under
  real-world usage" and teams end up rebuilding a full platform. [weak, vendor with
  buy-bias] — getstream.io. Our Phase-1 empirical finding (the prototype approves
  ~91% and never fires its AI) is a concrete instance of "looks done, doesn't
  moderate."

## 6. Regulatory floor (EU DSA) — relevant because JamesEdition serves EU sellers

The DSA is not optional best practice; it's law for an EU-facing marketplace, and
it constrains the architecture:
- **Art. 17 — Statement of Reasons:** when you reject/restrict a listing you must
  tell the user, **including whether automated means were used.** [strong] — DSA text
- **Art. 20 — Appeals:** platforms must offer an internal complaint system, and
  reversal decisions **cannot be "solely automated"** — qualified human supervision
  is required. [strong] — DSA text
- **Art. 22 — Trusted flaggers:** their notices get priority. [strong] — Internet
  Policy Review
- **Art. 30 — KYBC:** verify business sellers' identity before they sell. [strong] —
  DLA Piper / Freshfields
- Scale signal: the EC reports **>165M moderation appeals since 2024, ~30% reversed**
  — i.e., automated moderation errors at scale are expected and must be appealable.
  [medium, EC stat conflating all moderation] — ec.europa.eu

**Implication:** auto-reject must produce a stored, human-readable reason (which
our `ModerationResult` half-does but can't reconstruct — Phase 1 S9), and a human
must own appeals. This is an argument *for* a calibrated, auditable, human-in-the-
loop design and *against* opaque LLM auto-rejection.

---

## Synthesis of the evidence (feeds Phase 3)

1. **The mainstream design is a cheap-deterministic-first cascade** with the LLM
   reserved for the uncertain middle, treated as an unreliable advisor, behind a
   human-owned queue for consequential calls. Our prototype inverts this.
2. **Implio's real contract is small** — typed-field rules + lists + AI tags →
   {approve, reject, manual} + tracking — and is reproducible without the legacy
   taxonomy baggage.
3. **Proactive moderation is validated**, most strongly for **structured,
   verifiable fixes with the seller in the loop** (category, price-anomaly,
   completeness/quality score, photo requirements), and as **down-rank/hold +
   notify** rather than silent rewriting.
4. **Treat LLM confidence as unreliable, sanitize seller input, never disclose
   thresholds, keep a human on consequential decisions** — these are the
   evidence-backed guardrails, and three of them are violated in the current code.
5. **The realistic automation target** (≈80–90% with high accuracy, ramped up
   gradually behind accuracy gates and a feedback loop) is achievable but is an
   *operational* program (golden datasets, override→retrain loop), not a one-time
   build.

*(Full claim list with per-claim sources and confidence grades is preserved in the
five research-angle outputs that produced this report; the load-bearing URLs are
inline above. Anything marked [weak] is vendor self-report and should be confirmed
before being quoted externally.)*
