// Formatting + derivation helpers shared by the Queue, Decisions, Rules and
// Overview screens. Pure functions, no React.

export interface ListingLike {
  price?: number;
  priceUsd?: number;
  currency?: string;
  priceOnRequest?: boolean;
  city?: string;
  state?: string;
  country?: string;
  office?: string;
  officeGroupName?: string;
}

/** "$4,037,634" · "Price on request" · "—" */
export function formatPrice(listing: ListingLike | undefined | null): string {
  if (!listing) return "—";
  if (listing.priceOnRequest) return "Price on request";
  if (listing.priceUsd != null) return `$${Math.round(listing.priceUsd).toLocaleString()}`;
  if (listing.price != null) return `${Math.round(listing.price).toLocaleString()} ${listing.currency || ""}`.trim();
  return "—";
}

/** "Marbella, ES" — city + 2-letter country, falling back gracefully. */
export function formatLocation(listing: ListingLike | undefined | null): string {
  if (!listing) return "";
  return [listing.city, listing.state, listing.country].filter(Boolean).join(", ");
}

/** "Marbella, ES · Best House Fuengirola" — list-row secondary line. */
export function formatLocationOffice(listing: ListingLike | undefined | null): string {
  if (!listing) return "";
  const loc = [listing.city, listing.country].filter(Boolean).join(", ");
  const office = listing.officeGroupName || listing.office;
  return [loc, office].filter(Boolean).join(" · ");
}

export type AgeSeverity = "ok" | "warn" | "late";

/** Compact "26h" / "9h" / "40m" / "3d 4h" from an epoch-ms timestamp. */
export function formatAge(sinceMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - sinceMs);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.floor(diff / 1000)}s`;
}

/**
 * SLA severity from age. Defaults match the design's "amber > 4h · red > 24h".
 */
export function ageSeverity(
  sinceMs: number,
  nowMs: number = Date.now(),
  warnHours = 4,
  lateHours = 24,
): AgeSeverity {
  const hours = (nowMs - sinceMs) / 3_600_000;
  if (hours >= lateHours) return "late";
  if (hours >= warnHours) return "warn";
  return "ok";
}

/**
 * Per-rule precision = 1 − (falsePositive / matches), as a 0–100 integer.
 * Returns null when the rule has never matched (nothing to judge).
 */
export function rulePrecision(rule: {
  matchCount?: number | null;
  falsePositiveCount?: number | null;
}): number | null {
  const matches = rule.matchCount ?? 0;
  if (!matches) return null;
  const fp = rule.falsePositiveCount ?? 0;
  return Math.max(0, Math.min(100, Math.round((1 - fp / matches) * 100)));
}

/** Hex color for a precision value — red <60, amber <85, green ≥85. */
export function precisionColor(pct: number | null): string {
  if (pct == null) return "var(--je-ink-3)";
  if (pct < 60) return "var(--je-error)";
  if (pct < 85) return "var(--je-warning-raw)";
  return "var(--je-success)";
}

export type Outcome = "approved" | "rejected" | "notice" | "manual" | "pending";

/** Maps an API outcome string to a StatusChip kind. */
export function outcomeKind(outcome: string): "approved" | "rejected" | "notice" | "manual" {
  if (outcome === "approved") return "approved";
  if (outcome === "rejected") return "rejected";
  if (outcome === "notice") return "notice";
  return "manual";
}

/** A rule match's action ("flag" | "reject" | "notice") → chip kind + label. */
export function actionLabel(action: string | undefined): string {
  switch (action) {
    case "reject":
      return "Reject";
    case "notice":
      return "Notice";
    case "flag":
      return "Flag";
    default:
      return action ? action[0].toUpperCase() + action.slice(1) : "Flag";
  }
}
