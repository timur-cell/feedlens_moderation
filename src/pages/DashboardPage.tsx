import { jeImageUrl } from "@/components/JeImage";
import {
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Loader2,
  AlertTriangle,
  Download,
  Calendar,
  Bot,
  ExternalLink,
  Eye,
  Image as ImageIcon,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Date Range Presets ─────────────────────────────────────────

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 14 days", days: 14 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: -1 },
];

function getDateRange(days: number): { start?: number; end?: number; label: string } {
  if (days === -1) return { label: "All time" };
  const end = Date.now();
  const start = days === 0
    ? new Date().setHours(0, 0, 0, 0)
    : end - days * 24 * 60 * 60 * 1000;
  return { start, end, label: days === 0 ? "Today" : `Last ${days} days` };
}

// ─── Stat Card with Auto/Manual Split ───────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  autoCount,
  manualCount,
  showRate,
  rateValue,
  href,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  autoCount?: number;
  manualCount?: number;
  showRate?: boolean;
  rateValue?: string;
  href?: string;
}) {
  const autoPercent = value > 0 && autoCount !== undefined
    ? ((autoCount / value) * 100).toFixed(1)
    : null;
  const manualPercent = value > 0 && manualCount !== undefined
    ? ((manualCount / value) * 100).toFixed(1)
    : null;

  const content = (
    <Card className={`${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""} relative overflow-hidden`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {showRate && rateValue && (
            <span className={`text-lg font-bold ${color}`}>{rateValue}</span>
          )}
          <Icon className={`size-5 ${color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value.toLocaleString()}</div>
        {/* Auto vs Manual split */}
        {autoCount !== undefined && manualCount !== undefined && value > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Bot className="size-3" />Automation
              </span>
              <span className="font-medium tabular-nums">
                {autoCount.toLocaleString()}
                <span className="text-muted-foreground ml-1.5">{autoPercent}%</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Manual</span>
              <span className="font-medium tabular-nums">
                {manualCount.toLocaleString()}
                <span className="text-muted-foreground ml-1.5">{manualPercent}%</span>
              </span>
            </div>
            {/* Mini progress bar */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
              {autoCount > 0 && (
                <div
                  className="h-full bg-emerald-500 rounded-l-full transition-all"
                  style={{ width: `${autoPercent}%` }}
                />
              )}
              {manualCount > 0 && (
                <div
                  className="h-full bg-amber-500 rounded-r-full transition-all"
                  style={{ width: `${manualPercent}%` }}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) return <Link to={href}>{content}</Link>;
  return content;
}

function RecentActivity() {
  const { data: results } = useApiQuery(apiClient.moderation.recent, {
    limit: 10,
  });
  const { data: listings } = useApiQuery(apiClient.listings.recent, {
    limit: 50,
  });
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (!results || !listings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Decisions</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Decisions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="size-8 mx-auto mb-2 opacity-50" />
            <p>No moderation activity yet.</p>
            <p className="text-sm mt-1">Send listings via the API to start moderating.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const listingMap = new Map(listings.map((l: any) => [l._id, l]));

  const outcomeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
    approved: { label: "Approved", variant: "default", color: "bg-emerald-500" },
    rejected: { label: "Rejected", variant: "destructive", color: "bg-red-500" },
    notice: { label: "Notice", variant: "secondary", color: "bg-sky-500" },
    manual: { label: "Manual", variant: "outline", color: "bg-amber-500" },
  };

  const previewResult = previewId ? results.find((r: any) => r._id === previewId) : null;
  const previewListing = previewResult ? listingMap.get(previewResult.listingId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Recent Decisions</CardTitle>
        <Link to="/moderation-log">
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
            View all <ExternalLink className="size-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="space-y-0">
          {results.map((r: any) => {
            const listing = listingMap.get(r.listingId);
            const config = outcomeConfig[r.outcome] || outcomeConfig.manual;
            const timeAgo = getTimeAgo(r.processedAt);
            const isPreview = previewId === r._id;
            const thumbUrl = listing?.imageUrls?.[0];

            return (
              <div key={r._id}>
                <div
                  className={`flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg cursor-pointer transition-colors border-b last:border-0 ${
                    isPreview ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setPreviewId(isPreview ? null : r._id)}
                >
                  {/* Thumbnail */}
                  <div className="size-9 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                    {thumbUrl ? (
                      <img
                        src={jeImageUrl(thumbUrl)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <ImageIcon className="size-3.5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {listing?.title || `Listing ${r.jeId}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {listing?.country && `${listing.city ? listing.city + ", " : ""}${listing.country}`}
                      {listing?.priceUsd && ` · $${listing.priceUsd.toLocaleString()}`}
                      {r.llmTriggered && " · 🤖 LLM"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={config.variant} className="text-xs">
                      {config.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo}</span>
                  </div>
                </div>

                {/* Inline preview panel */}
                {isPreview && previewListing && (
                  <div className="mx-1 mb-2 p-3 bg-muted/30 border rounded-lg space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Image gallery */}
                    {previewListing.imageUrls?.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {previewListing.imageUrls.slice(0, 6).map((url: string, i: number) => (
                          <img
                            key={i}
                            src={jeImageUrl(url)}
                            alt=""
                            className="h-16 w-24 rounded object-cover shrink-0 border"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ))}
                        {previewListing.imageUrls.length > 6 && (
                          <div className="h-16 w-24 rounded bg-muted flex items-center justify-center shrink-0 border text-xs text-muted-foreground">
                            +{previewListing.imageUrls.length - 6}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Key data points */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">JE ID</span>
                        <a
                          href={`https://www.jamesedition.com/admin/listings/${previewListing.jeId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-mono"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {previewListing.jeId}
                        </a>
                      </div>
                      {previewListing.category && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Category</span>
                          <span>{previewListing.category}</span>
                        </div>
                      )}
                      {previewListing.realEstateType && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type</span>
                          <span>{previewListing.realEstateType}</span>
                        </div>
                      )}
                      {previewListing.office && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Office</span>
                          <span className="truncate ml-2">{previewListing.office}</span>
                        </div>
                      )}
                      {previewListing.lqi != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">LQI</span>
                          <span>{previewListing.lqi.toFixed(0)}%</span>
                        </div>
                      )}
                      {previewListing.imageCount != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Images</span>
                          <span>{previewListing.imageCount}</span>
                        </div>
                      )}
                    </div>

                    {/* Rule matches */}
                    {previewResult?.ruleMatches?.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Rules matched</p>
                        <div className="flex flex-wrap gap-1">
                          {previewResult.ruleMatches.map((m: any, i: number) => (
                            <Link
                              key={i}
                              to={`/rules?highlight=${encodeURIComponent(m.ruleName)}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Badge
                                variant={m.action === "reject" ? "destructive" : "secondary"}
                                className="text-[10px] cursor-pointer hover:opacity-80"
                              >
                                {m.ruleName}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Link
                        to="/moderation-log"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full text-xs gap-1 h-7">
                          <Eye className="size-3" />
                          View in Log
                        </Button>
                      </Link>
                      {previewResult?.outcome === "manual" && (
                        <Link
                          to="/queue"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1"
                        >
                          <Button variant="default" size="sm" className="w-full text-xs gap-1 h-7">
                            Review in Queue
                          </Button>
                        </Link>
                      )}
                      {previewListing.listingUrl && (
                        <a
                          href={previewListing.listingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7">
                            <ExternalLink className="size-3" />
                            JE
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function getTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ─── Rule Performance ───────────────────────────────────────────

function RulePerformance() {
  const { data: rules } = useApiQuery(apiClient.rules.list);

  if (!rules) return null;

  const activeRules = rules
    .filter((r: any) => r.enabled && (r.matchCount || 0) > 0)
    .sort((a: any, b: any) => (b.matchCount || 0) - (a.matchCount || 0))
    .slice(0, 8);

  if (activeRules.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Rules by Matches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="size-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No rule matches yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Rules by Matches</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeRules.map((rule: any) => {
            const fpRate = rule.falsePositiveCount && rule.matchCount
              ? Math.round((rule.falsePositiveCount / rule.matchCount) * 100)
              : 0;
            return (
              <Link
                key={rule._id}
                to={`/rules?highlight=${encodeURIComponent(rule.name)}`}
                className="flex items-center gap-3 hover:bg-muted/50 rounded p-1 -mx-1 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{rule.displayName}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{rule.matchCount} matches</span>
                    {fpRate > 0 && (
                      <span className="text-amber-600">{fpRate}% FP</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {rule.tier}
                </Badge>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV Export Helper ──────────────────────────────────────────

function downloadCSV(data: any[]) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = String(row[h] ?? "").replace(/"/g, '""');
          return `"${val}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `feedlens-export-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Dashboard ─────────────────────────────────────────────

export default function DashboardPage() {
  const [selectedPreset, setSelectedPreset] = useState(5); // "All time" index
  const range = useMemo(() => getDateRange(DATE_PRESETS[selectedPreset].days), [selectedPreset]);

  const { data: dashData, error: dashError, refetch: refetchDash } = useApiQuery(apiClient.dashboard.stats, {
    startDate: range.start,
    endDate: range.end,
  });

  const { data: exportData } = useApiQuery(apiClient.dashboard.exportCsv, {
    startDate: range.start,
    endDate: range.end,
  });

  const handleExport = useCallback(() => {
    if (exportData) downloadCSV(exportData);
  }, [exportData]);

  if (dashError && !dashData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <p className="text-sm">Failed to load dashboard stats: {dashError.message}</p>
        <Button variant="outline" size="sm" onClick={() => refetchDash()}>Retry</Button>
      </div>
    );
  }

  if (!dashData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { stats } = dashData;
  const approvalRate = stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : "0";
  const refusalRate = stats.total > 0 ? ((stats.rejected / stats.total) * 100).toFixed(1) : "0";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header with date picker + export */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Moderation Statistics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {stats.total > 0
              ? `${approvalRate}% approval rate · ${stats.autoTotal.toLocaleString()} automated decisions`
              : "No moderation data yet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Calendar className="size-4" />
                {range.label}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              {DATE_PRESETS.map((preset, idx) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                    selectedPreset === idx
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedPreset(idx)}
                >
                  {preset.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Export button */}
          <Button
            variant="default"
            size="sm"
            className="gap-2 bg-red-500 hover:bg-red-600 text-white"
            onClick={handleExport}
            disabled={!exportData || exportData.length === 0}
          >
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Stat cards with auto/manual split */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="TOTAL MODERATED"
          value={stats.total}
          icon={TrendingUp}
          color="text-slate-500"
          autoCount={stats.autoTotal}
          manualCount={stats.manualTotal}
        />
        <StatCard
          title="APPROVED"
          value={stats.approved}
          icon={CheckCircle2}
          color="text-emerald-500"
          autoCount={stats.autoApproved}
          manualCount={stats.manualApproved}
          showRate
          rateValue={`${approvalRate}%`}
        />
        <StatCard
          title="REFUSED"
          value={stats.rejected}
          icon={XCircle}
          color="text-red-500"
          autoCount={stats.autoRejected}
          manualCount={stats.manualRejected}
          showRate
          rateValue={`${refusalRate}%`}
        />
        <StatCard
          title="MANUAL QUEUE"
          value={stats.manual}
          icon={Clock}
          color="text-amber-500"
          href="/queue"
        />
      </div>

      {/* Bottom section: Recent + Rule Performance */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <div>
          <RulePerformance />
        </div>
      </div>
    </div>
  );
}
