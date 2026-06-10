# Golden fixtures for the Ruby moderation engine port

The Ruby port of the moderation rule engine lives in
`rails/app/services/moderation/` (pure Ruby, no Rails/ActiveRecord). Its
parity with the original TypeScript implementation (`convex/moderation.ts`)
is guaranteed by a golden-fixture suite generated **by executing the real
TypeScript evaluator code**.

## Files

- `fixtures.json` — fixture listings plus synthetic `extraRules` /
  `extraLists` (names prefixed `x_`, marked `"synthetic": true`). The
  synthetic rules exercise evaluator paths the production seed data never
  reaches (hybrid_vision check types, office rules, the full operator set,
  minPrice, priority ties, a disabled rule). Each fixture carries an
  `expect` block (`outcome` / `mustMatch` / `mustNotMatch`) that the
  generator validates so fixtures cannot silently become degenerate.
- `generate.ts` — extracts the pure prelude of `convex/moderation.ts`
  (country maps, `evaluateCondition`, `evaluateSimpleRule`,
  `evaluateRegexRule`, `evaluateHybridVisionRule`, `evaluateAccuracyRule`,
  `evaluateOfficeRule`, `resolveListRefs`) into
  `.generated/moderation_pure.ts` **without rewriting any logic**, then runs
  every fixture through the same deterministic decision flow as the
  `moderateListing` action and writes
  `rails/spec/fixtures/golden/expected.json`.
- `.generated/` — build artifact, safe to delete.

## Regenerating

From the repo root:

```sh
bun scripts/golden/generate.ts
```

The script loads the REAL seed data (`rails/db/seed_data/rules.json` and
`lists.json`), appends the synthetic extras from `fixtures.json`, and fails
loudly if any fixture violates its `expect` block or if fewer than 10
distinct rules fire across the suite.

Then run the Ruby side:

```sh
cd rails && bundle exec rspec spec/services/moderation
```

`spec/services/moderation/golden_spec.rb` rebuilds the engine from the same
JSON inputs and asserts, per fixture: the ordered rule-match names, the
outcome, the needs-LLM flag, the LLM rule matches and the seller message.

## Intentional stubs

- **LLM phase**: generation stops at outcome `needs_llm` and records which
  `auto_ai` / `former_manual` rules fired. The confidence-routing logic
  (`Engine#decide_with_llm`) is covered by Ruby unit tests
  (`engine_spec.rb`) that mirror the TS thresholds (approve 0.9 / reject
  0.85, `enableAutoModeration`, invalid confidence/recommendation guards).
- **Step 3b on-demand vision**: skipped. It requires `listing.imageUrls`,
  which no fixture carries, so the real action would skip it too — the
  generator throws if a fixture would ever reach that branch.
- **Accuracy category**: disabled upstream (commented out of the
  deterministic filter in `moderation.ts`, 2026-03-17). Mirrored as disabled
  in the Ruby engine; fixture `accuracy_category_disabled` proves accuracy
  flags are ignored.

When `convex/moderation.ts`, the seed data or `fixtures.json` change,
re-run the generator and commit the updated `expected.json`.
