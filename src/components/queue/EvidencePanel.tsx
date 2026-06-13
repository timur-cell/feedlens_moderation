// Shared evidence rendering — consumed by Queue detail, Focus mode and ⌘K
// Inspect (per the design handoff §6 build note: build it once, don't fork).
//
// WhyFlagged takes *normalized* props so any source — a stored moderation
// result, or the summarized moderate-by-id response — can feed it through a
// tiny adapter.
import { SectionLabel } from "@/components/ops";
import { actionLabel } from "@/lib/queueFormat";

export interface EvidenceMatch {
  ruleName: string;
  action?: string;
  tier?: string;
  details?: string;
  message?: string;
}

export interface EvidenceScan {
  verdict?: string;
  flagCount?: number;
  flags?: { code?: string; message?: string }[];
}

export interface EvidenceLlm {
  recommendation?: string;
  confidence?: number;
  assessment?: string;
}

export interface EvidenceVision {
  property_condition?: number | string;
  image_quality?: string;
  image_type?: string;
  watermark_text?: string;
}

/** Normalize a stored moderation result into evidence props. */
export function evidenceFromResult(result: any): {
  matches: EvidenceMatch[];
  scan?: EvidenceScan;
  llm?: EvidenceLlm;
  vision?: EvidenceVision;
  visionModel?: string;
} {
  return {
    matches: result?.ruleMatches || [],
    llm: result?.llmTriggered ? result?.llmResponse : undefined,
    vision: result?.visionResult && !result?.visionResult?.error ? result.visionResult : undefined,
    visionModel: result?.visionModel,
  };
}

export function WhyFlagged({
  matches,
  scan,
  llm,
  vision,
  visionModel,
  dense,
}: {
  matches: EvidenceMatch[];
  scan?: EvidenceScan;
  llm?: EvidenceLlm;
  vision?: EvidenceVision;
  visionModel?: string;
  dense?: boolean;
}) {
  const hasScan = !!scan?.flagCount;
  const hasLlm = !!llm;

  if (matches.length === 0 && !hasLlm && !hasScan) {
    return (
      <div className="border border-border bg-je-surface px-3 py-2 text-[12px] text-je-ink-2">
        Held for manual review — no rule fired. Spot-check and decide.
      </div>
    );
  }

  return (
    <div className={`grid gap-2 ${dense ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
      {matches.map((m, i) => (
        <div key={i} className="border border-border border-t-2 border-t-je-warning-raw px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">{m.ruleName}</span>
            <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
              {actionLabel(m.action)}
              {m.tier ? ` · ${m.tier}` : ""}
            </span>
          </div>
          {m.details && <div className="mt-1 font-mono text-[11px] text-je-ink-2">{m.details}</div>}
          {m.message && (
            <div className="mt-1.5 bg-je-surface px-2 py-1 text-[12px] italic text-je-ink-2">“{m.message}”</div>
          )}
        </div>
      ))}

      {hasScan && (
        <div className="border border-border border-t-2 border-t-je-warning-raw px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">AI param scan</span>
            <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
              {scan?.verdict || "review"} · {scan?.flagCount} flag{scan?.flagCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1 text-[12px] text-je-ink-2">
            {(scan?.flags || [])
              .slice(0, 3)
              .map((f) => f.message || f.code)
              .join(" · ")}
          </div>
        </div>
      )}

      {hasLlm && (
        <div className="border border-border border-t-2 border-t-je-teal-border bg-je-teal-bg px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-semibold">AI assessment</span>
            <span className="inline-flex h-5 items-center rounded-[4px] border border-je-teal-border bg-background px-1.5 text-[10px] text-je-teal">
              {llm?.recommendation}
              {llm?.confidence ? ` · conf ${Math.round(llm.confidence * 100)}%` : ""}
            </span>
          </div>
          {llm?.assessment && <div className="mt-1 text-[12px] text-je-ink-2">{llm.assessment}</div>}
        </div>
      )}

      {vision && (
        <div className="border border-border px-3 py-2 text-[12px] text-je-ink-2">
          Vision ({visionModel || "claude"}): condition {vision.property_condition ?? "—"}/6 · quality{" "}
          {vision.image_quality || "—"} · {vision.image_type || "—"}
          {vision.watermark_text ? ` · watermark “${vision.watermark_text}”` : " · no watermark"}
        </div>
      )}
    </div>
  );
}

export function ListingFacts({ listing }: { listing: any }) {
  const ppsqm =
    listing.pricePerSqm != null
      ? `$${Math.round(listing.pricePerSqm).toLocaleString()}`
      : listing.priceUsd && listing.livingArea
        ? `≈ $${Math.round(listing.priceUsd / listing.livingArea).toLocaleString()}`
        : null;
  const facts: [string, string | null][] = [
    ["Category", [listing.category?.replace("RealEstate", "Real estate"), listing.realEstateType].filter(Boolean).join(" · ") || null],
    ["Price / m²", ppsqm],
    ["Beds · Baths", listing.bedrooms != null || listing.bathrooms != null ? `${listing.bedrooms ?? "—"} · ${listing.bathrooms ?? "—"}` : null],
    ["LQI", listing.lqi != null ? `${listing.lqi}` : null],
    [
      "Living · Land",
      listing.livingArea != null || listing.landArea != null
        ? `${listing.livingArea != null ? `${listing.livingArea.toLocaleString()} m²` : "—"} · ${listing.landArea != null ? `${listing.landArea.toLocaleString()} m²` : "—"}`
        : null,
    ],
    [
      "Images",
      listing.imageCount != null
        ? `${listing.imageCount}${listing.avgImageWidth != null && listing.avgImageHeight != null ? ` · avg ${Math.round(listing.avgImageWidth)}×${Math.round(listing.avgImageHeight)}` : ""}`
        : null,
    ],
    ["Office", listing.officeGroupName || listing.office || null],
    ["Description", listing.descriptionLength != null ? `${listing.descriptionLength.toLocaleString()} chars` : null],
    ["Plan · Feed", [listing.officeSubscription, listing.feedSource].filter(Boolean).join(" · ") || null],
    ["Rental · Pre-owned", `${listing.rental ? "Yes" : "No"} · ${listing.preOwned ? "Yes" : "No"}`],
  ];
  return (
    <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
      {facts.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border py-[5px] text-[12.5px]">
          <span className="shrink-0 text-je-ink-2">{k}</span>
          {v ? <span className="num text-right font-medium">{v}</span> : <span className="text-je-ink-3">—</span>}
        </div>
      ))}
    </div>
  );
}

/** Used as a section header above WhyFlagged. */
export function WhyFlaggedSection(props: Parameters<typeof WhyFlagged>[0]) {
  return (
    <div>
      <SectionLabel className="mb-1.5">Why flagged</SectionLabel>
      <WhyFlagged {...props} />
    </div>
  );
}
