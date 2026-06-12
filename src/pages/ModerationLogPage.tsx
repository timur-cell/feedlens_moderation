import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Download,
  ChevronRight,
  ChevronDown,
  Loader2,
  X,
  RotateCcw,
  ExternalLink,
  Star,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { jeImageUrl } from "@/components/JeImage";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { OpsThumb, SectionLabel, StatusChip } from "@/components/ops";
import { actionLabel, formatLocation, formatPrice, outcomeKind } from "@/lib/queueFormat";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VIEWS_KEY = "feedlens.decisions.views";

interface SavedView {
  id: string;
  name: string;
  query: string;
}

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) || "[]");
  } catch {
    return [];
  }
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Facet({
  label,
  value,
  active,
  options,
  onChange,
}: {
  label: string;
  value: string;
  active?: boolean;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className={`h-[30px]! w-auto gap-1.5 rounded-none border-border px-2.5 text-[12px] ${
          active ? "border-je-teal bg-je-teal-bg text-je-teal" : ""
        }`}
      >
        <span className="text-je-ink-2">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="rounded-none">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="rounded-none text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function decidedBy(r: any): { auto: boolean; rule?: string; actor?: string } {
  if (r.overriddenBy) return { auto: false, actor: r.overriddenBy };
  const rule = r.ruleMatches?.[0]?.ruleName;
  return { auto: true, rule };
}

function evidenceSummary(r: any, listing: any): string {
  if (r.overrideReason) return `override: ${r.overrideReason}`;
  const matches = r.ruleMatches || [];
  if (matches.length === 0) {
    const lqi = listing?.lqi != null ? ` · LQI ${listing.lqi}` : "";
    const img = listing?.imageCount != null ? ` · ${listing.imageCount} img` : "";
    return `0 rules${lqi}${img}`;
  }
  const first = matches[0];
  const extra = matches.length > 1 ? ` +${matches.length - 1}` : "";
  return `${first.ruleName}${first.details ? ` · ${first.details}` : ""}${extra}`;
}

function DecisionRow({
  r,
  listing,
  expanded,
  onToggle,
  onRevert,
  onRerun,
}: {
  r: any;
  listing: any;
  expanded: boolean;
  onToggle: () => void;
  onRevert: () => void;
  onRerun: () => void;
}) {
  const by = decidedBy(r);
  const firstMatch = r.ruleMatches?.[0];
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-b border-border align-middle hover:bg-je-surface ${expanded ? "bg-je-teal-bg" : ""}`}
      >
        <td className="py-1.5 pl-3 pr-2">
          <OpsThumb src={jeImageUrl((listing?.imageUrls || [])[0])} size={26} />
        </td>
        <td className="py-1.5 pr-3">
          <span className="text-[12.5px] font-medium">{listing?.title || r.jeId}</span>
          <span className="ml-2 text-[11.5px] text-je-ink-2">
            {[formatLocation(listing), formatPrice(listing)].filter((x) => x && x !== "—").join(" · ")}
          </span>
        </td>
        <td className="py-1.5 pr-3">
          <StatusChip kind={outcomeKind(r.outcome)} label={r.outcome} />
        </td>
        <td className="py-1.5 pr-3 text-[12px]">
          {by.auto ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
                Auto
              </span>
              {by.rule && <span className="font-mono text-je-ink-2">{by.rule}</span>}
            </span>
          ) : (
            <span>{by.actor}</span>
          )}
        </td>
        <td className="max-w-[260px] truncate py-1.5 pr-3 text-[12px] text-je-ink-2">{evidenceSummary(r, listing)}</td>
        <td className="num py-1.5 pr-3 text-right text-[12px]">
          {r.confidence ? `${Math.round(r.confidence * 100)}%` : "—"}
        </td>
        <td className="num py-1.5 pr-3 text-right text-[12px] text-je-ink-2">{timeLabel(r.processedAt)}</td>
        <td className="py-1.5 pr-3 text-je-ink-3">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-je-teal-bg">
          <td />
          <td colSpan={7} className="px-3 pb-3.5 pt-1">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_1fr_200px]">
              <div className="border border-border bg-background px-3 py-2 text-[12px]">
                <SectionLabel className="mb-1">Rule fired</SectionLabel>
                {firstMatch ? (
                  <span>
                    <strong>{firstMatch.ruleName}</strong> · {actionLabel(firstMatch.action)}
                    {firstMatch.details ? ` · ${firstMatch.details}` : ""}
                    {r.llmTriggered && r.llmResponse && (
                      <span className="mt-1 flex items-center gap-1 text-je-ink-2">
                        <Bot className="size-3" /> {r.llmResponse.recommendation}
                        {r.llmResponse.confidence ? ` · ${Math.round(r.llmResponse.confidence * 100)}%` : ""}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-je-ink-2">No rule fired — clean automated pass.</span>
                )}
              </div>
              <div className="border border-border bg-background px-3 py-2 text-[12px]">
                <SectionLabel className="mb-1">Override</SectionLabel>
                {r.overriddenBy ? (
                  <span>
                    {r.overriddenBy} → <strong>{r.outcome}</strong>
                    {r.overrideReason ? ` · reason: ${r.overrideReason}` : ""}. Original outcome:{" "}
                    {r.originalOutcome || "—"}.
                  </span>
                ) : (
                  <span className="text-je-ink-2">Automated decision — not overridden.</span>
                )}
              </div>
              <div className="flex flex-col justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="sm" className="rounded-none" asChild>
                  <a
                    href={`https://www.jamesedition.com/admin/listings/${r.jeId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" /> Open listing
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="rounded-none" onClick={onRerun}>
                  <RotateCcw className="size-3.5" /> Re-run rules
                </Button>
                {r.outcome !== "manual" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none text-je-error hover:text-je-error"
                    onClick={onRevert}
                  >
                    Revert to manual
                  </Button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ModerationLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [outcome, setOutcome] = useState(() => searchParams.get("outcome") || "all");
  const [source, setSource] = useState(() => searchParams.get("source") || "all");
  const [ruleFilter, setRuleFilter] = useState(() => searchParams.get("rule") || "any");
  const [country, setCountry] = useState(() => searchParams.get("country") || "any");
  const [dateRange, setDateRange] = useState(() => searchParams.get("date") || "7d");
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: results, error, refetch } = useApiQuery(apiClient.moderation.recent, { limit: 300 });
  const [override] = useApiMutation(apiClient.moderation.override);
  const [rerun] = useApiMutation(apiClient.moderateById.run);

  // Keep the URL in sync (shareable filtered view).
  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (outcome !== "all") next.set("outcome", outcome);
    if (source !== "all") next.set("source", source);
    if (ruleFilter !== "any") next.set("rule", ruleFilter);
    if (country !== "any") next.set("country", country);
    if (dateRange !== "7d") next.set("date", dateRange);
    setSearchParams(next, { replace: true });
  }, [search, outcome, source, ruleFilter, country, dateRange, setSearchParams]);

  const ruleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of results || []) for (const m of r.ruleMatches || []) set.add(m.ruleName);
    return [{ value: "any", label: "Any rule" }, ...[...set].sort().map((r) => ({ value: r, label: r }))];
  }, [results]);
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of results || []) if (r.listing?.country) set.add(r.listing.country);
    return [{ value: "any", label: "Any country" }, ...[...set].sort().map((c) => ({ value: c, label: c }))];
  }, [results]);

  const filtered = useMemo(() => {
    const cutoff =
      dateRange === "24h"
        ? Date.now() - 86_400_000
        : dateRange === "7d"
          ? Date.now() - 7 * 86_400_000
          : dateRange === "30d"
            ? Date.now() - 30 * 86_400_000
            : 0;
    const q = search.trim().toLowerCase();
    return (results || []).filter((r: any) => {
      if (r.processedAt < cutoff) return false;
      if (outcome !== "all" && r.outcome !== outcome) return false;
      if (source === "auto" && r.overriddenBy) return false;
      if (source === "manual" && !r.overriddenBy) return false;
      if (source === "override" && !r.overriddenBy) return false;
      if (ruleFilter !== "any" && !(r.ruleMatches || []).some((m: any) => m.ruleName === ruleFilter)) return false;
      if (country !== "any" && r.listing?.country !== country) return false;
      if (q) {
        const hit =
          r.jeId?.toLowerCase().includes(q) ||
          r.listing?.title?.toLowerCase().includes(q) ||
          r.listing?.office?.toLowerCase().includes(q) ||
          (r.ruleMatches || []).some((m: any) => m.ruleName.toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
  }, [results, dateRange, outcome, source, ruleFilter, country, search]);

  const approvedPct = filtered.length
    ? Math.round((filtered.filter((r: any) => r.outcome === "approved").length / filtered.length) * 100)
    : 0;

  const resetFilters = useCallback(() => {
    setSearch("");
    setOutcome("all");
    setSource("all");
    setRuleFilter("any");
    setCountry("any");
    setDateRange("7d");
  }, []);

  const applyView = useCallback((v: SavedView) => {
    const p = new URLSearchParams(v.query);
    setSearch(p.get("q") || "");
    setOutcome(p.get("outcome") || "all");
    setSource(p.get("source") || "all");
    setRuleFilter(p.get("rule") || "any");
    setCountry(p.get("country") || "any");
    setDateRange(p.get("date") || "7d");
  }, []);

  const saveCurrentView = useCallback(() => {
    const name = window.prompt("Name this view");
    if (!name) return;
    const v: SavedView = { id: String(Date.now()), name, query: searchParams.toString() };
    const next = [...views, v];
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    toast.success(`Saved view “${name}”`);
  }, [views, searchParams]);

  const deleteView = useCallback(
    (id: string) => {
      const next = views.filter((v) => v.id !== id);
      setViews(next);
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    },
    [views],
  );

  const exportCsv = useCallback(() => {
    if (filtered.length === 0) return;
    const rows = filtered.map((r: any) => ({
      jeId: r.jeId,
      title: r.listing?.title || "",
      outcome: r.outcome,
      country: r.listing?.country || "",
      decidedBy: r.overriddenBy || (r.ruleMatches?.[0]?.ruleName ? `auto:${r.ruleMatches[0].ruleName}` : "auto"),
      rules: (r.ruleMatches || []).map((m: any) => m.ruleName).join("; "),
      confidence: r.confidence ? Math.round(r.confidence * 100) : "",
      overrideReason: r.overrideReason || "",
      processedAt: new Date(r.processedAt).toISOString(),
    }));
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => `"${String((row as any)[h] ?? "").replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedlens-decisions-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const handleRevert = useCallback(
    async (r: any) => {
      try {
        await override({ resultId: r._id, newOutcome: "manual" });
        toast.success("Reverted to manual");
      } catch {
        toast.error("Revert failed");
      }
    },
    [override],
  );

  const handleRerun = useCallback(
    async (r: any) => {
      try {
        await rerun({ inputs: [r.jeId] });
        toast.success("Re-running rules…");
      } catch {
        toast.error("Re-run failed");
      }
    },
    [rerun],
  );

  const filtersActive =
    !!search || outcome !== "all" || source !== "all" || ruleFilter !== "any" || country !== "any" || dateRange !== "7d";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Topbar */}
      <div className="flex items-center gap-3.5 border-b border-border px-6 py-3.5">
        <h1 className="text-[18px] font-semibold tracking-tight">Decisions</h1>
        <span className="text-[12px] text-je-ink-2">
          {filtered.length} in range · {approvedPct}% approved
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-[30px] gap-1.5 rounded-none"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>

      {/* Facet bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex h-[30px] min-w-[220px] items-center gap-2 border border-border px-2.5">
          <Search className="size-3.5 text-je-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, JE ID, office, rule…"
            className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-je-ink-3"
          />
        </div>
        <Facet
          label="Outcome"
          value={outcome}
          active={outcome !== "all"}
          options={[
            { value: "all", label: "All" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "notice", label: "Notice" },
            { value: "manual", label: "Manual" },
          ]}
          onChange={setOutcome}
        />
        <Facet
          label="Source"
          value={source}
          active={source !== "all"}
          options={[
            { value: "all", label: "Auto + Manual" },
            { value: "auto", label: "Automated" },
            { value: "override", label: "Overrides" },
          ]}
          onChange={setSource}
        />
        <Facet label="Rule" value={ruleFilter} active={ruleFilter !== "any"} options={ruleOptions} onChange={setRuleFilter} />
        <Facet label="Country" value={country} active={country !== "any"} options={countryOptions} onChange={setCountry} />
        <Facet
          label="Date"
          value={dateRange}
          active={dateRange !== "7d"}
          options={[
            { value: "24h", label: "Last 24h" },
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "all", label: "All time" },
          ]}
          onChange={setDateRange}
        />
        {filtersActive && (
          <Button variant="ghost" size="sm" className="h-[30px] rounded-none text-je-ink-2" onClick={resetFilters}>
            <X className="size-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Saved views */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2">
        <SectionLabel className="mr-1">Saved views</SectionLabel>
        {views.map((v) => (
          <span
            key={v.id}
            className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border bg-background px-1.5 text-[11px]"
          >
            <button type="button" onClick={() => applyView(v)} className="hover:text-je-teal">
              {v.name}
            </button>
            <button type="button" onClick={() => deleteView(v.id)} className="text-je-ink-3 hover:text-je-error">
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={saveCurrentView}
          className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border bg-je-surface px-1.5 text-[11px] text-je-ink-2 hover:text-je-teal"
        >
          <Star className="size-3" /> Save current
        </button>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto px-6">
        {error && !results ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-je-ink-2">Failed to load decisions: {error.message}</p>
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !results ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-7 animate-spin text-je-ink-3" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-je-ink-2">No decisions match the current view.</div>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-je-ink text-[10px] uppercase tracking-[0.09em] text-je-ink-2">
                <th className="w-[34px] py-2" />
                <th className="py-2 pr-3 text-left font-semibold">Listing</th>
                <th className="w-[110px] py-2 pr-3 text-left font-semibold">Outcome</th>
                <th className="w-[200px] py-2 pr-3 text-left font-semibold">Decided by</th>
                <th className="py-2 pr-3 text-left font-semibold">Evidence</th>
                <th className="w-[60px] py-2 pr-3 text-right font-semibold">Conf</th>
                <th className="w-[70px] py-2 pr-3 text-right font-semibold">Time</th>
                <th className="w-[30px] py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <DecisionRow
                  key={r._id}
                  r={r}
                  listing={r.listing}
                  expanded={expandedId === r._id}
                  onToggle={() => setExpandedId(expandedId === r._id ? null : r._id)}
                  onRevert={() => handleRevert(r)}
                  onRerun={() => handleRerun(r)}
                />
              ))}
            </tbody>
          </table>
        )}
        {results && filtered.length > 0 && (
          <div className="flex justify-between py-2.5 text-[11.5px] text-je-ink-3">
            <span>
              {filtered.length} of {results.length} decisions
            </span>
            <span>Filters are URL-encoded — copy the address to share this view.</span>
          </div>
        )}
      </div>
    </div>
  );
}
