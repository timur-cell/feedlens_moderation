// FeedLens ops primitives — the JamesEdition dense-console dialect.
//
// One hue + one shape per outcome, everywhere. Chips are outlined with an ~8%
// tint, never saturated fills, and always carry a text label. Borders over
// shadows; square corners (4px max on chips); tabular numerals on metrics.
//
// These are the shared building blocks the redesigned screens compose with —
// see docs design handoff "Design tokens / Component sheet".
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ageSeverity, formatAge, type AgeSeverity } from "@/lib/queueFormat";

/* ─── Keyboard hint ─────────────────────────────────────────────── */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-block rounded-[3px] border border-b-2 border-border bg-background px-[5px] font-mono text-[10px] leading-[15px] text-je-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ─── Section label (10px uppercase tracking) ───────────────────── */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[10px] font-semibold uppercase tracking-[0.12em] text-je-ink-3", className)}>
      {children}
    </div>
  );
}

/* ─── Outcome / status chip ─────────────────────────────────────── */
export type StatusKind = "approved" | "rejected" | "notice" | "manual" | "shadow" | "live" | "off";

const STATUS_STYLES: Record<StatusKind, string> = {
  approved: "text-je-success border-je-success bg-je-success-bg",
  rejected: "text-je-error border-je-error bg-je-error-bg",
  notice: "text-je-warning border-je-warning-raw bg-je-warning-bg",
  manual: "text-je-ink-2 border-border bg-je-surface",
  shadow: "text-je-teal border-je-teal-border bg-je-teal-bg",
  live: "text-je-success border-je-success bg-je-success-bg",
  off: "text-je-ink-3 border-border bg-je-surface",
};

export function StatusChip({
  kind,
  label,
  className,
}: {
  kind: StatusKind;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 rounded-[4px] border px-2 text-[10.5px] font-semibold uppercase tracking-[0.03em] whitespace-nowrap",
        STATUS_STYLES[kind],
        className,
      )}
    >
      <span className="size-[5px] rounded-full bg-current" />
      {label ?? kind}
    </span>
  );
}

/* ─── Age / SLA chip ────────────────────────────────────────────── */
const AGE_STYLES: Record<AgeSeverity, string> = {
  ok: "text-je-ink-2 border-border bg-background",
  warn: "text-je-warning border-je-warning-raw bg-je-warning-bg",
  late: "text-je-error border-je-error bg-je-error-bg",
};

export function AgeChip({
  sinceMs,
  prefix,
  warnHours,
  lateHours,
  now,
  className,
}: {
  sinceMs: number;
  prefix?: string;
  warnHours?: number;
  lateHours?: number;
  now?: number;
  className?: string;
}) {
  const sev = ageSeverity(sinceMs, now, warnHours, lateHours);
  return (
    <span
      className={cn(
        "num inline-flex h-[18px] items-center rounded-[4px] border px-1.5 text-[10.5px] font-semibold whitespace-nowrap",
        AGE_STYLES[sev],
        className,
      )}
    >
      {prefix ? `${prefix} ` : ""}
      {formatAge(sinceMs, now)}
    </span>
  );
}

/* ─── Rule chip (mono, list-row) ────────────────────────────────── */
export function RuleChip({
  name,
  onDismiss,
  className,
  to,
}: {
  name: string;
  onDismiss?: () => void;
  className?: string;
  /** When set, the chip becomes a link to the rule's page (stops row-click propagation). */
  to?: string;
}) {
  const base =
    "inline-flex h-5 max-w-full items-center gap-1 rounded-[4px] border border-border bg-je-surface px-1.5 font-mono text-[10px] text-je-ink";

  if (to && !onDismiss) {
    return (
      <Link
        to={to}
        onClick={(e) => e.stopPropagation()}
        title={`Open rule ${name}`}
        className={cn(base, "transition-colors hover:border-je-teal hover:text-je-teal", className)}
      >
        <span className="truncate">{name}</span>
      </Link>
    );
  }

  return (
    <span className={cn(base, className)}>
      <span className="truncate">{name}</span>
      {onDismiss && (
        <button
          type="button"
          className="text-je-ink-3 hover:text-je-ink"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label={`Dismiss ${name}`}
        >
          ✕
        </button>
      )}
    </span>
  );
}

/* ─── Precision bar ─────────────────────────────────────────────── */
export function PrecisionBar({
  pct,
  width = 56,
  className,
}: {
  pct: number | null;
  width?: number;
  className?: string;
}) {
  if (pct == null) {
    return <span className="text-je-ink-3">—</span>;
  }
  const color = pct < 60 ? "var(--je-error)" : pct < 85 ? "var(--je-warning-raw)" : "var(--je-success)";
  return (
    <span className={cn("inline-flex items-center gap-[7px]", className)}>
      <span
        className="inline-block h-1 bg-je-surface"
        style={{ width }}
      >
        <span className="block h-full" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="num text-[11.5px]">{pct}%</span>
    </span>
  );
}

/* ─── Sparkline ─────────────────────────────────────────────────── */
export function Sparkline({
  points,
  width = 72,
  height = 20,
  color = "var(--je-ink)",
  fill = false,
  className,
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const pts = points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("block", className)}>
      {fill && <polygon points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity="0.08" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/* ─── Thumbnail (image with neutral fallback) ───────────────────── */
export function OpsThumb({
  src,
  alt = "",
  size,
  width,
  height,
  className,
}: {
  src?: string;
  alt?: string;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const w = size ?? width ?? 44;
  const h = size ?? height ?? 44;
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden border border-border bg-je-surface-warm", className)}
      style={{ width: w, height: h }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : null}
    </div>
  );
}
