"""
BQ → FeedLens LAS Sync Script

Queries BigQuery for AI-validated flagged listings from the listing_accuracy_score table
and pushes them to FeedLens via the /api/push-flagged endpoint.

Usage:
  uv run python scripts/sync-las-from-bq.py

Requires: BQ query results as JSON input (from Viktor's BQ integration)
"""
import json
import os
import re
import sys
import urllib.request

FEEDLENS_PUSH_URL = os.environ.get("FEEDLENS_PUSH_URL", "https://your-deployment.convex.site/api/push-flagged")
# Must match the LAS_PUSH_API_KEY env var set on the Convex deployment.
API_KEY = os.environ.get("LAS_PUSH_API_KEY")
if not API_KEY:
    sys.exit("LAS_PUSH_API_KEY environment variable is required")

def parse_ai_label(ai_review: str | None) -> str | None:
    """Extract label from AI review text like '[ACCURATE] ...' """
    if not ai_review:
        return None
    match = re.match(r'\[([A-Z_]+)\]', ai_review)
    return match.group(1) if match else None

def derive_action(flags: list[str], score: float) -> str:
    """Derive action from flags and score, matching LAS actions table logic."""
    critical_flags = {
        "AI_WRONG_CURRENCY", "AI_ABSURD_PRICE_SCALE", "AI_SURFACE_UNIT_MISMATCH",
        "AI_IMPLAUSIBLE_AREA", "AI_WRONG_PROPERTY_TYPE", "LIVING_AREA_LT_10_SQM",
    }
    if any(f in critical_flags for f in flags):
        return "reject"
    if score < 0.4:
        return "reject"
    if any(f.startswith("AI_") for f in flags):
        return "warn"
    if score < 0.6:
        return "warn"
    return "notice"

def push_batch(listings: list[dict]) -> dict:
    """Push a batch of listings to FeedLens."""
    payload = json.dumps({"listings": listings}).encode()
    req = urllib.request.Request(
        FEEDLENS_PUSH_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-Api-Key": API_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def transform_row(row: dict) -> dict:
    """Transform a BQ row into the FeedLens push format."""
    ai_validated_at = row.get("ai_validated_at")
    if isinstance(ai_validated_at, dict):
        ai_validated_at = ai_validated_at.get("value")
    
    return {
        "listing_id": str(row["listing_id"]),
        "total_score": row["score"],
        "price_score": row.get("price_score"),
        "location_score": row.get("location_score"),
        "coherency_score": row.get("coherency_score"),
        "staleness_score": row.get("staleness_score"),
        "ai_label": parse_ai_label(row.get("ai_review")),
        "flags": row.get("flags", []),
        # ai_review is debug-only — not synced (per Tarik)
        "user_message": row.get("user_message"),
        "action": derive_action(row.get("flags", []), row["score"]),
        "ai_validated_at": ai_validated_at,
    }

def main():
    # Read BQ results from stdin or file
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)
    
    # BQ results come as [rows, {}, metadata] 
    rows = data if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) else data[0]
    
    print(f"Total rows from BQ: {len(rows)}")
    
    # Transform
    listings = [transform_row(r) for r in rows]
    print(f"Transformed {len(listings)} listings")
    
    # Push in batches of 100
    BATCH_SIZE = 100
    total_processed = 0
    total_skipped = 0
    total_created = 0
    total_updated = 0
    total_errors = 0
    
    for i in range(0, len(listings), BATCH_SIZE):
        batch = listings[i:i + BATCH_SIZE]
        print(f"Pushing batch {i // BATCH_SIZE + 1} ({len(batch)} listings)...")
        try:
            result = push_batch(batch)
            total_processed += result.get("processed", 0)
            total_skipped += result.get("skipped", 0)
            total_created += result.get("created", 0)
            total_updated += result.get("updated", 0)
            total_errors += result.get("errors", 0)
            print(f"  → processed={result.get('processed')}, skipped={result.get('skipped')}, created={result.get('created')}, updated={result.get('updated')}")
        except Exception as e:
            print(f"  → ERROR: {e}")
            total_errors += len(batch)
    
    print(f"\nSync complete:")
    print(f"  Processed: {total_processed}")
    print(f"  Created:   {total_created}")
    print(f"  Updated:   {total_updated}")
    print(f"  Skipped:   {total_skipped}")
    print(f"  Errors:    {total_errors}")

if __name__ == "__main__":
    main()
