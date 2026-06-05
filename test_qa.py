"""
FeedLens System QA Test Suite
Tests all rule categories with 20 synthetic listings via HTTP API.
"""
import json
import os
import time
import httpx

API_BASE = os.environ.get("FEEDLENS_API_BASE", "https://your-deployment.convex.site/api")
API_KEY = os.environ.get("FEEDLENS_API_KEY", "")
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# ─── Test Listing Definitions ─────────────────────────────────────
# 20 listings designed to trigger specific rule categories

TEST_LISTINGS = [
    # ── 5 Clean listings (should APPROVE) ──
    {
        "id": "clean_1",
        "category_label": "clean",
        "expected_outcome": "approved",
        "data": {
            "jeId": "QA-CLEAN-001",
            "title": "Luxury Penthouse in Monaco with Ocean View",
            "priceUsd": 5500000,
            "currency": "EUR",
            "category": "real_estate",
            "realEstateType": "penthouse",
            "country": "MC",
            "city": "Monte Carlo",
            "imageCount": 25,
            "avgImageWidth": 1920,
            "avgImageHeight": 1080,
            "lqi": 85,
            "descriptionLength": 1200,
            "description": "Stunning penthouse apartment offering panoramic sea views across the Mediterranean. Features marble floors, designer kitchen, and private terrace.",
            "officeSubscription": "premium",
            "bedrooms": 4,
            "bathrooms": 3,
            "livingArea": 350,
        },
    },
    {
        "id": "clean_2",
        "category_label": "clean",
        "expected_outcome": "approved",
        "data": {
            "jeId": "QA-CLEAN-002",
            "title": "Modern Villa with Pool in Marbella",
            "priceUsd": 3200000,
            "currency": "EUR",
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "ES",
            "city": "Marbella",
            "imageCount": 30,
            "avgImageWidth": 2400,
            "avgImageHeight": 1600,
            "lqi": 92,
            "descriptionLength": 1500,
            "description": "Elegant contemporary villa in a gated community with infinity pool, landscaped gardens, and mountain views. Recently built with premium finishes throughout.",
            "officeSubscription": "premium",
            "bedrooms": 5,
            "bathrooms": 5,
            "livingArea": 600,
            "landArea": 1200,
        },
    },
    {
        "id": "clean_3",
        "category_label": "clean",
        "expected_outcome": "approved",
        "data": {
            "jeId": "QA-CLEAN-003",
            "title": "Charming Chateau in Loire Valley",
            "priceUsd": 4800000,
            "currency": "EUR",
            "category": "real_estate",
            "realEstateType": "chateau",
            "country": "FR",
            "city": "Tours",
            "imageCount": 40,
            "avgImageWidth": 2000,
            "avgImageHeight": 1500,
            "lqi": 88,
            "descriptionLength": 2000,
            "description": "Historic 18th-century chateau set in 15 hectares of parkland. Fully restored with modern amenities while preserving original character. Features a wine cellar and guest cottage.",
            "officeSubscription": "premium",
            "bedrooms": 8,
            "bathrooms": 6,
            "livingArea": 800,
            "landArea": 150000,
        },
    },
    {
        "id": "clean_4",
        "category_label": "clean",
        "expected_outcome": "approved",
        "data": {
            "jeId": "QA-CLEAN-004",
            "title": "Waterfront Apartment in Lisbon",
            "priceUsd": 1800000,
            "currency": "EUR",
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "PT",
            "city": "Lisbon",
            "imageCount": 15,
            "avgImageWidth": 1600,
            "avgImageHeight": 1200,
            "lqi": 75,
            "descriptionLength": 900,
            "description": "Beautifully designed apartment overlooking the Tagus River. Open-plan living with floor-to-ceiling windows and high-end finishes.",
            "officeSubscription": "basic",
            "bedrooms": 3,
            "bathrooms": 2,
            "livingArea": 180,
        },
    },
    {
        "id": "clean_5",
        "category_label": "clean",
        "expected_outcome": "approved",
        "data": {
            "jeId": "QA-CLEAN-005",
            "title": "Tuscan Farmhouse with Vineyard",
            "priceUsd": 2900000,
            "currency": "EUR",
            "category": "real_estate",
            "realEstateType": "farmhouse",
            "country": "IT",
            "city": "Siena",
            "imageCount": 35,
            "avgImageWidth": 2200,
            "avgImageHeight": 1500,
            "lqi": 90,
            "descriptionLength": 1800,
            "description": "Authentic Tuscan farmhouse surrounded by olive groves and vineyards. Carefully restored with original stone walls and terracotta floors. Features a swimming pool and panoramic views.",
            "officeSubscription": "premium",
            "bedrooms": 6,
            "bathrooms": 4,
            "livingArea": 450,
            "landArea": 50000,
        },
    },

    # ── 3 Low image resolution (simple_code → REJECT) ──
    {
        "id": "low_res_1",
        "category_label": "low_image_resolution",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-LOWRES-001",
            "title": "Villa with Low Resolution Photos",
            "priceUsd": 1200000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "ES",
            "city": "Malaga",
            "imageCount": 10,
            "avgImageWidth": 320,
            "avgImageHeight": 240,
            "lqi": 60,
            "descriptionLength": 500,
            "description": "A lovely villa in Malaga with garden and pool.",
            "officeSubscription": "basic",
            "bedrooms": 3,
            "bathrooms": 2,
            "livingArea": 200,
        },
    },
    {
        "id": "low_res_2",
        "category_label": "low_image_resolution",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-LOWRES-002",
            "title": "Apartment with Tiny Images",
            "priceUsd": 800000,
            "category": "cars",
            "country": "DE",
            "imageCount": 5,
            "avgImageWidth": 200,
            "avgImageHeight": 150,
            "lqi": 45,
            "descriptionLength": 300,
            "description": "Luxury car for sale.",
            "officeSubscription": "basic",
        },
    },
    {
        "id": "low_res_3",
        "category_label": "low_image_resolution",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-LOWRES-003",
            "title": "Property with Very Small Photos",
            "priceUsd": 950000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "IT",
            "city": "Rome",
            "imageCount": 8,
            "avgImageWidth": 400,
            "avgImageHeight": 300,
            "lqi": 55,
            "descriptionLength": 400,
            "description": "Nice apartment in Rome center.",
            "officeSubscription": "basic",
            "bedrooms": 2,
            "bathrooms": 1,
            "livingArea": 90,
        },
    },

    # ── 2 Low LQI (simple_code → REJECT) ──
    {
        "id": "low_lqi_1",
        "category_label": "low_lqi",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-LOWLQI-001",
            "title": "Budget Property Low Quality Index",
            "priceUsd": 600000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "GR",
            "city": "Athens",
            "imageCount": 5,
            "avgImageWidth": 1200,
            "avgImageHeight": 900,
            "lqi": 15,
            "descriptionLength": 100,
            "description": "Apartment for sale.",
            "officeSubscription": "freemium",
            "bedrooms": 2,
            "bathrooms": 1,
        },
    },
    {
        "id": "low_lqi_2",
        "category_label": "low_lqi",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-LOWLQI-002",
            "title": "House with Very Low Quality Score",
            "priceUsd": 750000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "PT",
            "city": "Porto",
            "imageCount": 3,
            "avgImageWidth": 1000,
            "avgImageHeight": 800,
            "lqi": 20,
            "descriptionLength": 150,
            "description": "House for sale in Porto. Nice views.",
            "officeSubscription": "basic",
            "bedrooms": 3,
            "bathrooms": 2,
        },
    },

    # ── 2 Missing/few images (simple_code → REJECT) ──
    {
        "id": "few_pics_1",
        "category_label": "few_pictures",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-FEWPICS-001",
            "title": "Luxury Villa With Only One Photo",
            "priceUsd": 2000000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "ES",
            "city": "Barcelona",
            "imageCount": 1,
            "avgImageWidth": 1920,
            "avgImageHeight": 1080,
            "lqi": 70,
            "descriptionLength": 600,
            "description": "Beautiful villa in Barcelona with gardens and pool. Needs more photos.",
            "officeSubscription": "premium",
            "bedrooms": 4,
            "bathrooms": 3,
        },
    },
    {
        "id": "few_pics_2",
        "category_label": "few_pictures",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-FEWPICS-002",
            "title": "No Image Property Listing",
            "priceUsd": 1500000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "FR",
            "city": "Nice",
            "imageCount": 0,
            "avgImageWidth": 0,
            "avgImageHeight": 0,
            "lqi": 50,
            "descriptionLength": 400,
            "description": "Nice apartment on the French Riviera.",
            "officeSubscription": "basic",
            "bedrooms": 2,
            "bathrooms": 1,
        },
    },

    # ── 2 GPT watermark scores (hybrid_vision → depends on rule config) ──
    {
        "id": "watermark_1",
        "category_label": "watermark_high",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-WMARK-001",
            "title": "Property with Watermarked Images",
            "priceUsd": 1800000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "IT",
            "city": "Milan",
            "imageCount": 10,
            "avgImageWidth": 1600,
            "avgImageHeight": 1200,
            "lqi": 65,
            "chatGptWatermarkShare": 0.55,
            "chatGptWatermarkText": "RealEstateAgency.com",
            "chatGptPropertyCondition": 3,
            "descriptionLength": 600,
            "description": "Beautiful property in Milan. Large garden with pool.",
            "officeSubscription": "basic",
            "bedrooms": 4,
            "bathrooms": 3,
        },
    },
    {
        "id": "watermark_2",
        "category_label": "watermark_high",
        "expected_outcome": "rejected",
        "data": {
            "jeId": "QA-WMARK-002",
            "title": "Heavy Watermark Estate Photos",
            "priceUsd": 2500000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "ES",
            "city": "Madrid",
            "imageCount": 15,
            "avgImageWidth": 1400,
            "avgImageHeight": 1000,
            "lqi": 70,
            "chatGptWatermarkShare": 0.75,
            "chatGptWatermarkText": "PropertyFinder.es",
            "chatGptPropertyCondition": 4,
            "descriptionLength": 800,
            "description": "Magnificent estate in Madrid with 5 bedrooms and modern amenities.",
            "officeSubscription": "premium",
            "bedrooms": 5,
            "bathrooms": 4,
        },
    },

    # ── 2 Commercial keywords (auto_ai → triggers LLM or MANUAL) ──
    {
        "id": "commercial_1",
        "category_label": "commercial_keywords",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-COMM-001",
            "title": "Office Space For Lease - Commercial Building Downtown",
            "priceUsd": 900000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "US",
            "city": "New York",
            "imageCount": 10,
            "avgImageWidth": 1600,
            "avgImageHeight": 1200,
            "lqi": 60,
            "descriptionLength": 500,
            "description": "Prime commercial office space available for lease. Open floor plan, modern HVAC. Retail ground floor with warehouse storage.",
            "officeSubscription": "basic",
        },
    },
    {
        "id": "commercial_2",
        "category_label": "commercial_keywords",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-COMM-002",
            "title": "Retail Shop and Warehouse Investment Property",
            "priceUsd": 1200000,
            "category": "real_estate",
            "realEstateType": "commercial",
            "country": "GB",
            "city": "London",
            "imageCount": 8,
            "avgImageWidth": 1400,
            "avgImageHeight": 1000,
            "lqi": 55,
            "descriptionLength": 400,
            "description": "Investment property with retail on ground floor and warehouse at rear. Good rental income.",
            "officeSubscription": "basic",
        },
    },

    # ── 2 "SOLD" in title (auto_ai → triggers LLM or MANUAL) ──
    {
        "id": "sold_1",
        "category_label": "sold_listing",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-SOLD-001",
            "title": "SOLD - Luxury Penthouse in Dubai Marina",
            "priceUsd": 4500000,
            "category": "real_estate",
            "realEstateType": "penthouse",
            "country": "AE",
            "city": "Dubai",
            "imageCount": 20,
            "avgImageWidth": 2000,
            "avgImageHeight": 1500,
            "lqi": 85,
            "descriptionLength": 1200,
            "description": "This property has been sold. Stunning penthouse with views of the marina.",
            "officeSubscription": "premium",
            "bedrooms": 3,
            "bathrooms": 3,
        },
    },
    {
        "id": "sold_2",
        "category_label": "sold_listing",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-SOLD-002",
            "title": "Under Offer - Beautiful Villa on the Coast",
            "priceUsd": 3000000,
            "category": "real_estate",
            "realEstateType": "villa",
            "country": "GR",
            "city": "Mykonos",
            "imageCount": 25,
            "avgImageWidth": 1800,
            "avgImageHeight": 1200,
            "lqi": 80,
            "descriptionLength": 1000,
            "description": "This villa is currently under offer. Beautiful sea views and private beach access.",
            "officeSubscription": "premium",
            "bedrooms": 5,
            "bathrooms": 4,
        },
    },

    # ── 2 Extreme prices (former_manual → MANUAL queue) ──
    {
        "id": "extreme_price_1",
        "category_label": "extreme_price",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-PRICE-001",
            "title": "Small Studio in Central Paris",
            "priceUsd": 150000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "FR",
            "city": "Paris",
            "imageCount": 8,
            "avgImageWidth": 1200,
            "avgImageHeight": 900,
            "lqi": 60,
            "descriptionLength": 300,
            "description": "Small studio apartment near the Eiffel Tower. Good rental potential.",
            "officeSubscription": "freemium",
            "bedrooms": 0,
            "bathrooms": 1,
            "livingArea": 25,
        },
    },
    {
        "id": "extreme_price_2",
        "category_label": "extreme_price",
        "expected_outcome": "manual",
        "data": {
            "jeId": "QA-PRICE-002",
            "title": "Cozy Apartment in Lisbon",
            "priceUsd": 200000,
            "category": "real_estate",
            "realEstateType": "apartment",
            "country": "PT",
            "city": "Lisbon",
            "imageCount": 6,
            "avgImageWidth": 1400,
            "avgImageHeight": 1000,
            "lqi": 55,
            "descriptionLength": 250,
            "description": "Affordable apartment in the Alfama district. Needs some renovation.",
            "officeSubscription": "freemium",
            "bedrooms": 1,
            "bathrooms": 1,
            "livingArea": 45,
        },
    },
]


def run_tests():
    """Run all QA tests and return structured results."""
    print("=" * 60)
    print("FeedLens System QA Test Suite")
    print("=" * 60)

    results = {
        "health": None,
        "listings": [],
        "summary": {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
        },
        "rule_categories": {},
        "outcomes": {"approved": 0, "rejected": 0, "manual": 0, "notice": 0, "error": 0},
        "issues": [],
    }

    client = httpx.Client(timeout=60.0)

    # ─── Test 1: Health endpoint ──────────────────────────────────
    print("\n📡 Test 1: Health Check")
    try:
        resp = client.get(f"{API_BASE}/health")
        health = resp.json()
        if health.get("status") == "ok":
            print(f"  ✅ Health OK: {health}")
            results["health"] = {"status": "pass", "response": health}
        else:
            print(f"  ❌ Unexpected health response: {health}")
            results["health"] = {"status": "fail", "response": health}
            results["issues"].append("Health check returned unexpected status")
    except Exception as e:
        print(f"  ❌ Health check failed: {e}")
        results["health"] = {"status": "error", "error": str(e)}
        results["issues"].append(f"Health endpoint error: {e}")

    # ─── Test 2: Create and moderate listings ─────────────────────
    print(f"\n📋 Test 2: Creating and moderating {len(TEST_LISTINGS)} test listings")
    print("-" * 60)

    for i, test in enumerate(TEST_LISTINGS):
        test_id = test["id"]
        cat_label = test["category_label"]
        expected = test["expected_outcome"]
        data = test["data"]
        results["summary"]["total"] += 1

        print(f"\n  [{i+1:02d}/{len(TEST_LISTINGS)}] {test_id} ({cat_label})")
        print(f"       Title: {data['title'][:50]}...")
        print(f"       Expected: {expected}")

        try:
            # Submit listing and moderate in one call
            resp = client.post(
                f"{API_BASE}/moderate",
                json=data,
                headers=HEADERS,
            )

            if resp.status_code != 200:
                print(f"       ❌ API error {resp.status_code}: {resp.text[:200]}")
                results["summary"]["errors"] += 1
                results["outcomes"]["error"] += 1
                results["listings"].append({
                    "id": test_id,
                    "category": cat_label,
                    "expected": expected,
                    "actual": "error",
                    "status": "error",
                    "error": f"HTTP {resp.status_code}: {resp.text[:200]}",
                    "rule_matches": [],
                })
                results["issues"].append(f"{test_id}: API returned {resp.status_code}")
                continue

            body = resp.json()

            if not body.get("success"):
                print(f"       ❌ API returned success=false: {body}")
                results["summary"]["errors"] += 1
                results["outcomes"]["error"] += 1
                results["listings"].append({
                    "id": test_id,
                    "category": cat_label,
                    "expected": expected,
                    "actual": "error",
                    "status": "error",
                    "error": str(body),
                    "rule_matches": [],
                })
                continue

            # Extract result (single listing)
            mod_results = body.get("results", [])
            if not mod_results:
                print(f"       ❌ No moderation results returned")
                results["summary"]["errors"] += 1
                continue

            result = mod_results[0]
            actual_outcome = result.get("outcome", "unknown")
            rule_matches = result.get("ruleMatches", [])
            llm_triggered = result.get("llmTriggered", False)

            # Track rule categories
            for rm in rule_matches:
                rc = rm.get("ruleCategory", "unknown")
                if rc not in results["rule_categories"]:
                    results["rule_categories"][rc] = {"count": 0, "rules": {}}
                results["rule_categories"][rc]["count"] += 1
                rn = rm.get("ruleName", "unknown")
                results["rule_categories"][rc]["rules"][rn] = results["rule_categories"][rc]["rules"].get(rn, 0) + 1

            # Check if outcome matches expectation
            # For "manual" expectations: accept manual OR rejected (if LLM auto-decided)
            # For auto_ai rules without LLM key: they go to manual queue
            passed = False
            if expected == "manual":
                # Manual expected: accept manual, rejected, or notice (LLM might auto-decide)
                passed = actual_outcome in ("manual", "rejected", "notice")
            elif expected == "rejected":
                passed = actual_outcome == "rejected"
            elif expected == "approved":
                passed = actual_outcome == "approved"
            elif expected == "notice":
                passed = actual_outcome in ("notice", "approved")
            else:
                passed = actual_outcome == expected

            status_icon = "✅" if passed else "❌"
            print(f"       Actual: {actual_outcome} {status_icon}")
            print(f"       Rules: {[m.get('ruleName') for m in rule_matches]}")
            if llm_triggered:
                print(f"       LLM: triggered")

            if passed:
                results["summary"]["passed"] += 1
            else:
                results["summary"]["failed"] += 1
                results["issues"].append(
                    f"{test_id}: Expected '{expected}' but got '{actual_outcome}' "
                    f"(rules: {[m.get('ruleName') for m in rule_matches]})"
                )

            results["outcomes"][actual_outcome] = results["outcomes"].get(actual_outcome, 0) + 1
            results["listings"].append({
                "id": test_id,
                "category": cat_label,
                "expected": expected,
                "actual": actual_outcome,
                "status": "pass" if passed else "fail",
                "rule_matches": [m.get("ruleName") for m in rule_matches],
                "llm_triggered": llm_triggered,
                "je_id": data["jeId"],
            })

        except Exception as e:
            print(f"       ❌ Exception: {e}")
            results["summary"]["errors"] += 1
            results["outcomes"]["error"] += 1
            results["listings"].append({
                "id": test_id,
                "category": cat_label,
                "expected": expected,
                "actual": "error",
                "status": "error",
                "error": str(e),
                "rule_matches": [],
            })
            results["issues"].append(f"{test_id}: Exception - {e}")

    # ─── Test 3: Check stats endpoint ─────────────────────────────
    print("\n\n📊 Test 3: Stats Endpoint")
    try:
        resp = client.get(f"{API_BASE}/stats")
        stats = resp.json()
        print(f"  Stats: {json.dumps(stats, indent=2)}")
        results["stats"] = stats
    except Exception as e:
        print(f"  ❌ Stats error: {e}")
        results["issues"].append(f"Stats endpoint error: {e}")

    # ─── Summary ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    s = results["summary"]
    print(f"  Total:   {s['total']}")
    print(f"  Passed:  {s['passed']} ✅")
    print(f"  Failed:  {s['failed']} ❌")
    print(f"  Errors:  {s['errors']} ⚠️")
    print(f"\n  Outcomes:")
    for outcome, count in results["outcomes"].items():
        if count > 0:
            print(f"    {outcome}: {count}")
    print(f"\n  Rule Categories Triggered:")
    for cat, info in results["rule_categories"].items():
        print(f"    {cat}: {info['count']} matches")
        for rule, count in info["rules"].items():
            print(f"      - {rule}: {count}")

    if results["issues"]:
        print(f"\n  Issues ({len(results['issues'])}):")
        for issue in results["issues"]:
            print(f"    ⚠️  {issue}")
    else:
        print("\n  🎉 No issues found!")

    # Save results to file
    with open("/work/viktor-spaces/feedlens/qa_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to qa_results.json")

    client.close()
    return results


if __name__ == "__main__":
    run_tests()
