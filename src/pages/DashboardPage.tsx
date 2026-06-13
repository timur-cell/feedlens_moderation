import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { PrecisionBar, SectionLabel, Sparkline } from "@/components/ops";
import { QueryError } from "@/components/QueryError";
import { formatAge, rulePrecision } from "@/lib/queueFormat";

// Overview — "is the queue healthy and is automation trustworthy, at a glance".
// Three bands: queue health · automation quality · needs attention. No recent-
// decisions list (that's the Decisions page).

const RANGES = [
  { key: "24h", label: "24h", days: 1 },
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
];

function rangeBounds(days: number) {
  const end = Date.now();
  return { start: end - days * 86_400_000, end };
}

function StatCard({
  label,
  value,
  sub,
  spark,
  color,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  spark?: number[];
  color?: string;
  alert?: boolean;
}) {
  return (
    <div className={`flex-1 border border-border px-4 py-3.5 ${alert ? "border-t-2 border-t-je-error" : ""}`}>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 flex items-end justify-between">
        <span className={`num text-[26px] font-semibold leading-none ${alert ? "text-je-error" : ""}`}>{value}</span>
        {spark && spark.length > 1 && <Sparkline points={spark} width={84} height={26} color={color || "var(--je-ink)"} fill />}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] text-je-ink-2">{sub}</div>}
    </div>
  );
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function downloadCSV(data: any[]) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) => headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `feedlens-decisions-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const [rangeKey, setRangeKey] = useState("7d");
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const bounds = useMemo(() => rangeBounds(range.days), [range.days]);

  const { data: dashData, error, refetch } = useApiQuery(apiClient.dashboard.stats, {
    startDate: bounds.start,
    endDate: bounds.end,
  });
  const { data: queueStats } = useApiQuery(apiClient.listings.stats, undefined, { pollMs: 30000 });
  const { data: pending } = useApiQuery(apiClient.listings.pending);
  const { data: rules } = useApiQuery(apiClient.rules.list);
  const { data: exportData } = useApiQuery(apiClient.dashboard.exportCsv, {
    startDate: bounds.start,
    endDate: bounds.end,
  });

  const handleExport = useCallback(() => exportData && downloadCSV(exportData), [exportData]);

  const daily: any[] = dashData?.dailyData || [];
  const resolvedSeries = daily.map(
    (d) => d.approvedAuto + d.approvedManual + d.rejectedAuto + d.rejectedManual + d.noticedAuto + d.noticedManual,
  );
  const intakeSeries = daily.map((d) => d.total);
  const queueSeries = daily.map((d) => d.manualQueue);
  const autoSeries = daily.map((d) => {
    const auto = d.approvedAuto + d.rejectedAuto + d.noticedAuto;
    return d.total > 0 ? Math.round((auto / d.total) * 100) : 0;
  });
  const overrideSeries = daily.map((d) => {
    const manual = d.approvedManual + d.rejectedManual + d.noticedManual;
    return d.total > 0 ? Math.round((manual / d.total) * 100) : 0;
  });

  // SLA: pending listings older than 24h.
  const SLA_HOURS = 24;
  const oldest = (pending || []).reduce((max: number, l: any) => Math.min(max, l.importedAt || Date.now()), Date.now());
  const overSla = (pending || []).filter((l: any) => Date.now() - (l.importedAt || Date.now()) > SLA_HOURS * 3_600_000);

  // Long-disabled rules (30d+).
  const disabledStale = (rules || []).filter(
    (r: any) => !r.enabled && r.lastModifiedAt && Date.now() - r.lastModifiedAt > 30 * 86_400_000,
  );

  const topRules = (rules || [])
    .filter((r: any) => (r.matchCount || 0) > 0)
    .sort((a: any, b: any) => (b.matchCount || 0) - (a.matchCount || 0))
    .slice(0, 5);

  if (error && !dashData) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm text-je-ink-2">Failed to load overview: {error.message}</p>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (error && !dashData) {
    return <QueryError onRetry={refetch} />;
  }
  if (!dashData) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="size-7 animate-spin text-je-ink-3" />
      </div>
    );
  }

  const s = dashData.stats;
  const resolvedTotal = resolvedSeries.reduce((a, b) => a + b, 0);
  const intakeTotal = intakeSeries.reduce((a, b) => a + b, 0);
  const automationRate = pct(s.autoTotal, s.total);
  const overrideRate = pct(s.manualTotal, s.total);
  const autoRejectShare = pct(s.autoRejected, s.total);
  const autoApproveShare = pct(s.autoApproved, s.total);
  const perDay = daily.length > 0 ? Math.round((resolvedTotal / daily.length) * 10) / 10 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Topbar */}
      <div className="flex items-center gap-3.5 border-b border-border px-6 py-3.5">
        <h1 className="text-[18px] font-semibold tracking-tight">Overview</h1>
        <span className="text-[12px] text-je-ink-2">
          {s.total.toLocaleString()} decisions · {automationRate}% automated
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-[30px] items-center border border-border text-[12px]">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`flex h-full items-center border-l border-border px-3 first:border-l-0 ${
                  rangeKey === r.key ? "bg-je-ink font-medium text-background" : "text-je-ink-2"
                }`}
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-[30px] gap-1.5 rounded-none"
            onClick={handleExport}
            disabled={!exportData || exportData.length === 0}
          >
            <Download className="size-3.5" /> Export
          </Button>
        </div>
      </div>

      {/* Attention banner */}
      {overSla.length > 0 && (
        <div className="flex items-center gap-2.5 border-b border-border border-t-2 border-t-je-warning-raw bg-je-warning-bg px-6 py-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-je-warning">
            <TriangleAlert className="size-3.5" /> SLA
          </span>
          <span>
            <strong>{overSla.length}</strong> listing{overSla.length === 1 ? "" : "s"} past the {SLA_HOURS}h review SLA —
            oldest waiting {formatAge(oldest)}.
          </span>
          <Link to="/queue" className="ml-auto font-medium text-je-teal hover:underline">
            View in Queue →
          </Link>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        {/* Queue health */}
        <div>
          <SectionLabel className="mb-2">Queue health</SectionLabel>
          <div className="flex flex-col gap-3 sm:flex-row">
            <StatCard
              label="In queue now"
              value={(queueStats?.manual ?? (pending || []).length).toLocaleString()}
              sub="awaiting human review"
              spark={queueSeries}
            />
            <StatCard
              label="Oldest wait"
              value={pending && pending.length ? formatAge(oldest) : "—"}
              sub={`SLA ${SLA_HOURS}h · ${overSla.length} over`}
              alert={overSla.length > 0}
              color="var(--je-error)"
              spark={queueSeries}
            />
            <StatCard
              label={`Resolved · ${range.label}`}
              value={resolvedTotal.toLocaleString()}
              sub={`vs ${intakeTotal.toLocaleString()} intake`}
              color="var(--je-success)"
              spark={resolvedSeries}
            />
            <StatCard label="Decisions / day" value={`${perDay}`} sub={`over ${daily.length} day${daily.length === 1 ? "" : "s"}`} spark={resolvedSeries} />
          </div>
        </div>

        {/* Automation quality */}
        <div>
          <SectionLabel className="mb-2">Automation quality</SectionLabel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
            <div className="flex flex-col gap-3">
              <StatCard label="Automation rate" value={`${automationRate}%`} sub={`${s.autoTotal} of ${s.total} automated`} color="var(--je-teal)" spark={autoSeries} />
              <StatCard label="Override rate" value={`${overrideRate}%`} sub={`${s.manualTotal} human overrides`} color="var(--je-success)" spark={overrideSeries} />
            </div>
            <div className="flex flex-col gap-3">
              <StatCard label="Auto-reject share" value={`${autoRejectShare}%`} sub={`${s.autoRejected} auto rejections`} />
              <StatCard label="Auto-approve share" value={`${autoApproveShare}%`} sub={`${s.autoApproved} auto approvals`} color="var(--je-success)" />
            </div>
            <div className="border border-border px-4 py-3.5">
              <div className="flex items-baseline justify-between">
                <SectionLabel>Top rules · {range.label}</SectionLabel>
                <Link to="/rules" className="text-[11.5px] font-medium text-je-teal hover:underline">
                  All rules →
                </Link>
              </div>
              {topRules.length === 0 ? (
                <p className="mt-3 text-[12px] text-je-ink-3">No rule matches in range.</p>
              ) : (
                <table className="mt-2 w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-je-ink text-[10px] uppercase tracking-[0.09em] text-je-ink-2">
                      <th className="py-1.5 pr-3 text-left font-semibold">Rule</th>
                      <th className="py-1.5 text-right font-semibold">Matches</th>
                      <th className="py-1.5 pl-3 text-left font-semibold">Precision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRules.map((r: any) => (
                      <tr key={r._id} className="border-b border-border last:border-0">
                        <td className="max-w-[180px] truncate py-1.5 pr-3">
                          <Link to={`/rules?highlight=${encodeURIComponent(r.name)}`} className="hover:underline">
                            {r.displayName || r.name}
                          </Link>
                        </td>
                        <td className="num py-1.5 text-right font-medium">{r.matchCount}</td>
                        <td className="py-1.5 pl-3">
                          <PrecisionBar pct={rulePrecision(r)} width={56} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-2 text-[11.5px] text-je-ink-2">Precision = 1 − override rate. Low-precision rules are shadow-review candidates.</div>
            </div>
          </div>
        </div>

        {/* Needs attention */}
        <div>
          <SectionLabel className="mb-2">Needs attention</SectionLabel>
          <div className="border border-border">
            {overSla.length === 0 && disabledStale.length === 0 ? (
              <div className="px-4 py-3 text-[12.5px] text-je-ink-2">Nothing needs attention — queue is within SLA.</div>
            ) : (
              <>
                {overSla.length > 0 && (
                  <AttentionRow
                    dot="error"
                    head={`${overSla.length} listing${overSla.length === 1 ? "" : "s"} over ${SLA_HOURS}h SLA`}
                    detail={`oldest waiting ${formatAge(oldest)}`}
                    cta="Open in Queue →"
                    to="/queue"
                  />
                )}
                {disabledStale.length > 0 && (
                  <AttentionRow
                    dot="warn"
                    head={`${disabledStale.length} rule${disabledStale.length === 1 ? "" : "s"} disabled 30+ days`}
                    detail={disabledStale
                      .slice(0, 3)
                      .map((r: any) => r.name)
                      .join(", ")}
                    cta="Review in Rules →"
                    to="/rules"
                    last
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AttentionRow({
  dot,
  head,
  detail,
  cta,
  to,
  last,
}: {
  dot: "error" | "warn";
  head: string;
  detail: string;
  cta: string;
  to: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] ${last ? "" : "border-b border-border"}`}>
      <span className={`size-[5px] shrink-0 rounded-full ${dot === "error" ? "bg-je-error" : "bg-je-warning-raw"}`} />
      <span className="font-medium">{head}</span>
      <span className="text-je-ink-2">{detail}</span>
      <Link to={to} className="ml-auto shrink-0 font-medium text-je-teal hover:underline">
        {cta}
      </Link>
    </div>
  );
}
