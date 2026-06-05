import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useMemo } from "react";
import {
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Loader2,
  ChevronRight,
  ExternalLink,
  Zap,
  FileText,
  ArrowRight,
  BarChart3,
  Sparkles,
  Building2,
  Globe,
  Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ─── Error Type Display Names ────────────────────────────────────

const ERROR_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  bedroom_anomaly: { label: "Bedroom Anomaly", icon: "🛏️", color: "text-orange-600" },
  bathroom_anomaly: { label: "Bathroom Anomaly", icon: "🚿", color: "text-orange-600" },
  area_conversion: { label: "Area Conversion", icon: "📐", color: "text-red-600" },
  area_swap: { label: "Area Swap", icon: "🔄", color: "text-red-600" },
  price_anomaly: { label: "Price Anomaly", icon: "💰", color: "text-red-600" },
  price_missing_zeros: { label: "Missing Zeros", icon: "0️⃣", color: "text-red-600" },
  year_anomaly: { label: "Year Anomaly", icon: "📅", color: "text-orange-600" },
  description_too_short: { label: "Description Too Short", icon: "📝", color: "text-yellow-600" },
  description_all_caps: { label: "All Caps Description", icon: "🔠", color: "text-yellow-600" },
  description_placeholder: { label: "Placeholder Text", icon: "⚠️", color: "text-red-600" },
  description_auto_translate: { label: "Auto-Translate Artifacts", icon: "🌐", color: "text-orange-600" },
  description_missing_details: { label: "Missing Details", icon: "📋", color: "text-yellow-600" },
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  low: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
};

// ─── Stat Card ───────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={`size-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mini Trend Chart ────────────────────────────────────────────

function TrendChart({
  data,
}: {
  data: Array<{ date: string; scanned: number; withErrors: number }>;
}) {
  const maxVal = Math.max(...data.map((d) => d.scanned), 1);

  return (
    <div className="flex items-end gap-1 h-20">
      {data.map((day) => {
        const totalHeight = (day.scanned / maxVal) * 100;
        const errorHeight = day.scanned > 0
          ? (day.withErrors / day.scanned) * totalHeight
          : 0;
        const okHeight = totalHeight - errorHeight;
        const dateLabel = day.date.slice(5); // MM-DD

        return (
          <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full flex flex-col justify-end rounded-sm overflow-hidden"
              style={{ height: "64px" }}
              title={`${dateLabel}: ${day.scanned} scanned, ${day.withErrors} with errors`}
            >
              <div
                className="w-full bg-red-400/70 dark:bg-red-500/50 rounded-t-sm"
                style={{ height: `${errorHeight}%` }}
              />
              <div
                className="w-full bg-emerald-400/70 dark:bg-emerald-500/50"
                style={{ height: `${okHeight}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {dateLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Error Type Breakdown ────────────────────────────────────────

function ErrorTypeBreakdown({
  errorTypeCounts,
}: {
  errorTypeCounts: Array<{ type: string; count: number }>;
}) {
  const sorted = [...errorTypeCounts].sort((a, b) => b.count - a.count);
  const maxCount = sorted.length > 0 ? sorted[0].count : 1;

  if (sorted.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No errors detected yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map(({ type, count }) => {
        const meta = ERROR_TYPE_LABELS[type] || {
          label: type,
          icon: "❓",
          color: "text-gray-600",
        };
        return (
          <div key={type} className="flex items-center gap-3">
            <span className="text-lg w-7 text-center">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium truncate">
                  {meta.label}
                </span>
                <span className="text-sm font-bold ml-2">{count}</span>
              </div>
              <Progress
                value={(count / maxCount) * 100}
                className="h-2"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Feed Source Table ────────────────────────────────────────────

function FeedSourceTable({
  feedSourceCounts,
}: {
  feedSourceCounts: Array<{ name: string; total: number; withErrors: number }>;
}) {
  const sorted = feedSourceCounts
    .map((entry) => ({
      source: entry.name,
      total: entry.total,
      withErrors: entry.withErrors,
      errorRate: entry.total > 0
        ? Math.round((entry.withErrors / entry.total) * 100)
        : 0,
    }))
    .sort((a, b) => b.withErrors - a.withErrors);

  if (sorted.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No data yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Feed Source</TableHead>
          <TableHead className="text-right">Scanned</TableHead>
          <TableHead className="text-right">With Errors</TableHead>
          <TableHead className="text-right">Error Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.slice(0, 15).map((row) => (
          <TableRow key={row.source}>
            <TableCell className="font-medium">{row.source}</TableCell>
            <TableCell className="text-right">{row.total}</TableCell>
            <TableCell className="text-right">
              {row.withErrors > 0 ? (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {row.withErrors}
                </span>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Badge
                variant="outline"
                className={
                  row.errorRate > 50
                    ? "border-red-300 text-red-700 dark:text-red-400"
                    : row.errorRate > 20
                      ? "border-orange-300 text-orange-700 dark:text-orange-400"
                      : ""
                }
              >
                {row.errorRate}%
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Seller/Office Table ──────────────────────────────────────────

function OfficeTable({
  officeCounts,
}: {
  officeCounts: Array<{ name: string; total: number; withErrors: number; errorCount: number }>;
}) {
  const sorted = officeCounts
    .map((entry) => ({
      office: entry.name,
      total: entry.total,
      withErrors: entry.withErrors,
      errorCount: entry.errorCount,
      errorRate: entry.total > 0
        ? Math.round((entry.withErrors / entry.total) * 100)
        : 0,
    }))
    .sort((a, b) => b.errorCount - a.errorCount);

  if (sorted.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        No data yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Seller / Office</TableHead>
          <TableHead className="text-right">Scanned</TableHead>
          <TableHead className="text-right">Errors</TableHead>
          <TableHead className="text-right">Total Issues</TableHead>
          <TableHead className="text-right">Error Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.slice(0, 15).map((row) => (
          <TableRow key={row.office}>
            <TableCell className="font-medium max-w-[200px] truncate">
              {row.office}
            </TableCell>
            <TableCell className="text-right">{row.total}</TableCell>
            <TableCell className="text-right">
              {row.withErrors > 0 ? (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {row.withErrors}
                </span>
              ) : (
                "0"
              )}
            </TableCell>
            <TableCell className="text-right font-medium">
              {row.errorCount}
            </TableCell>
            <TableCell className="text-right">
              <Badge
                variant="outline"
                className={
                  row.errorRate > 50
                    ? "border-red-300 text-red-700 dark:text-red-400"
                    : row.errorRate > 20
                      ? "border-orange-300 text-orange-700 dark:text-orange-400"
                      : ""
                }
              >
                {row.errorRate}%
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Listing Detail Dialog ───────────────────────────────────────

function ListingDetailDialog({
  result,
  open,
  onClose,
}: {
  result: any;
  open: boolean;
  onClose: () => void;
}) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-5 text-purple-600" />
            Remediation Analysis
          </DialogTitle>
        </DialogHeader>

        {/* Listing Info */}
        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-sm line-clamp-2">
                {result.listing?.title || result.jeId}
              </p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {result.listing?.country && (
                  <span className="flex items-center gap-1">
                    <Globe className="size-3" />
                    {result.listing.country}
                    {result.listing.city ? `, ${result.listing.city}` : ""}
                  </span>
                )}
                {result.listing?.price && (
                  <span>
                    {result.listing.currency || "$"}
                    {result.listing.price.toLocaleString()}
                  </span>
                )}
                {result.feedSource && (
                  <Badge variant="outline" className="text-[10px]">
                    {result.feedSource}
                  </Badge>
                )}
              </div>
            </div>
            {result.listing?.listingUrl && (
              <a
                href={result.listing.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge
            className={
              result.hasFixableErrors
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
            }
          >
            {result.hasFixableErrors
              ? `${result.errorCount} fixable error${result.errorCount > 1 ? "s" : ""}`
              : "No errors found"}
          </Badge>
          {result.totalConfidence > 0 && (
            <Badge variant="outline">
              Avg. confidence: {Math.round(result.totalConfidence * 100)}%
            </Badge>
          )}
          {result.descriptionScore && (
            <Badge variant="outline">
              Description: {result.descriptionScore.overall}/100
            </Badge>
          )}
        </div>

        {/* Suggestions */}
        {result.suggestions && result.suggestions.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Fix Suggestions
            </h3>
            {result.suggestions.map((s: any, i: number) => {
              const meta = ERROR_TYPE_LABELS[s.errorType] || {
                label: s.errorType,
                icon: "❓",
                color: "text-gray-600",
              };
              return (
                <div
                  key={i}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{meta.icon}</span>
                      <span className="font-medium text-sm">
                        {meta.label}
                      </span>
                      <Badge
                        className={SEVERITY_COLORS[s.severity] || ""}
                        variant="outline"
                      >
                        {s.severity}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(s.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.explanation}
                  </p>
                  <div className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                    <code className="text-red-600 dark:text-red-400 line-through">
                      {s.field}: {s.currentValue}
                    </code>
                    <ArrowRight className="size-4 text-muted-foreground flex-shrink-0" />
                    <code className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {s.field}: {s.suggestedFix}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Description Score */}
        {result.descriptionScore && (
          <div className="space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="size-4 text-blue-500" />
              Description Quality
            </h3>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Overall Score</span>
                <div className="flex items-center gap-2">
                  <Progress
                    value={result.descriptionScore.overall}
                    className="w-24 h-2"
                  />
                  <span className="text-sm font-bold">
                    {result.descriptionScore.overall}/100
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap text-xs">
                <Badge variant="outline">
                  Length: {result.descriptionScore.length}
                </Badge>
                {result.descriptionScore.hasPlaceholder && (
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                    Has placeholder
                  </Badge>
                )}
                {result.descriptionScore.hasAllCaps && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                    All caps
                  </Badge>
                )}
                {result.descriptionScore.hasAutoTranslateArtifacts && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                    Auto-translate issues
                  </Badge>
                )}
              </div>
              {result.descriptionScore.missingKeyDetails &&
                result.descriptionScore.missingKeyDetails.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Missing:{" "}
                    {result.descriptionScore.missingKeyDetails.join(", ")}
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Actions (future) */}
        {result.hasFixableErrors && (
          <div className="flex items-center gap-2 pt-3 border-t">
            <button
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              title="Coming soon — auto-correct with seller notification"
            >
              ✏️ Correct & Notify Seller
            </button>
            <span className="text-xs text-muted-foreground italic">Coming soon</span>
          </div>
        )}

        {/* Meta */}
        <div className="text-xs text-muted-foreground flex items-center gap-4 pt-2 border-t">
          <span>Model: {result.model}</span>
          {result.tokensUsed && <span>Tokens: {result.tokensUsed}</span>}
          <span>
            Scanned: {new Date(result.scannedAt).toLocaleString()}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Results Table ───────────────────────────────────────────────

function ResultsTable({
  results,
  onSelect,
}: {
  results: any[];
  onSelect: (r: any) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <FlaskConical className="size-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No results yet</p>
        <p className="text-sm mt-1">
          Run a batch scan to analyze listings for fixable errors
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Listing</TableHead>
          <TableHead>Feed</TableHead>
          <TableHead>Country</TableHead>
          <TableHead className="text-center">Errors</TableHead>
          <TableHead className="text-center">Confidence</TableHead>
          <TableHead className="text-center">Desc. Score</TableHead>
          <TableHead className="text-right">Scanned</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => (
          <TableRow
            key={r._id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onSelect(r)}
          >
            <TableCell className="max-w-[250px]">
              <div className="font-medium text-sm truncate">
                {r.listing?.title || r.jeId}
              </div>
              <div className="text-xs text-muted-foreground">{r.jeId}</div>
            </TableCell>
            <TableCell>
              {r.feedSource ? (
                <Badge variant="outline" className="text-xs">
                  {r.feedSource}
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="text-sm">
              {r.country || "—"}
            </TableCell>
            <TableCell className="text-center">
              {r.hasFixableErrors ? (
                <Badge
                  className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                >
                  {r.errorCount}
                </Badge>
              ) : (
                <Badge
                  className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                >
                  ✓
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-center text-sm">
              {r.totalConfidence > 0
                ? `${Math.round(r.totalConfidence * 100)}%`
                : "—"}
            </TableCell>
            <TableCell className="text-center">
              {r.descriptionScore ? (
                <span
                  className={`text-sm font-medium ${
                    r.descriptionScore.overall >= 70
                      ? "text-emerald-600"
                      : r.descriptionScore.overall >= 40
                        ? "text-orange-600"
                        : "text-red-600"
                  }`}
                >
                  {r.descriptionScore.overall}
                </span>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              {new Date(r.scannedAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <ChevronRight className="size-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Main Lab Page ───────────────────────────────────────────────

export default function LabPage() {
  const stats = useQuery(api.remediation.getStats);
  const recentResults = useQuery(api.remediation.getRecent, {
    limit: 100,
    errorsOnly: false,
  });
  const errorResults = useQuery(api.remediation.getRecent, {
    limit: 100,
    errorsOnly: true,
  });

  const batchScan = useAction(api.remediation.batchScan);
  const [scanning, setScanning] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const handleBatchScan = async () => {
    setScanning(true);
    try {
      const result = await batchScan({ limit: 10 });
      toast.success(
        `Scanned ${result.scanned} listings — ${result.withIssues} with fixable errors`
      );
    } catch (e: any) {
      toast.error(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const isLoading = stats === undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="size-6 text-purple-600" />
            Remediation Lab
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Shadow-mode error detection & fix suggestions — nothing is changed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-purple-300 text-purple-700 dark:text-purple-400"
          >
            <Sparkles className="size-3 mr-1" />
            Shadow Mode
          </Badge>
          <Button
            onClick={handleBatchScan}
            disabled={scanning}
            size="sm"
          >
            {scanning ? (
              <Loader2 className="size-4 animate-spin mr-1" />
            ) : (
              <Play className="size-4 mr-1" />
            )}
            {scanning ? "Scanning..." : "Run Batch Scan"}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Listings Scanned"
            value={stats?.totalScanned || 0}
            subtitle="Total analyzed"
            icon={BarChart3}
            color="text-blue-600"
          />
          <StatCard
            title="With Fixable Errors"
            value={stats?.withErrors || 0}
            subtitle={`${stats?.errorRate || 0}% error rate`}
            icon={AlertTriangle}
            color="text-red-600"
          />
          <StatCard
            title="Fix Suggestions"
            value={stats?.totalSuggestions || 0}
            subtitle="Generated suggestions"
            icon={Zap}
            color="text-amber-500"
          />
          <StatCard
            title="Avg. Desc. Score"
            value={stats?.avgDescScore || 0}
            subtitle="Out of 100"
            icon={FileText}
            color="text-purple-600"
          />
        </div>
      )}

      {/* Severity Summary */}
      {stats && stats.totalSuggestions > 0 && (
        <div className="flex gap-3">
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            {stats.severityCounts.high} High
          </Badge>
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            {stats.severityCounts.medium} Medium
          </Badge>
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            {stats.severityCounts.low} Low
          </Badge>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="errors">
            Errors Only
            {errorResults && errorResults.length > 0 && (
              <Badge className="ml-1.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5">
                {errorResults.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="feeds">By Feed</TabsTrigger>
          <TabsTrigger value="sellers">By Seller</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Error Type Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-4 text-orange-500" />
                  Error Type Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats ? (
                  <ErrorTypeBreakdown
                    errorTypeCounts={stats.errorTypeCounts}
                  />
                ) : (
                  <Skeleton className="h-40" />
                )}
              </CardContent>
            </Card>

            {/* Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="size-4 text-blue-500" />
                  14-Day Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats?.dailyTrend ? (
                  <div>
                    <TrendChart data={stats.dailyTrend} />
                    <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-emerald-400/70" />
                        Clean
                      </span>
                      <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-red-400/70" />
                        With Errors
                      </span>
                    </div>
                  </div>
                ) : (
                  <Skeleton className="h-24" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Results */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Recent Scans
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentResults ? (
                <ResultsTable
                  results={recentResults}
                  onSelect={setSelectedResult}
                />
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Only Tab */}
        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-500" />
                Listings With Fixable Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {errorResults ? (
                <ResultsTable
                  results={errorResults}
                  onSelect={setSelectedResult}
                />
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Feed Tab */}
        <TabsContent value="feeds">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="size-4 text-blue-500" />
                Error Rates by Feed Source
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <FeedSourceTable
                  feedSourceCounts={stats.feedSourceCounts}
                />
              ) : (
                <Skeleton className="h-40" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Seller Tab */}
        <TabsContent value="sellers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="size-4 text-indigo-500" />
                Error Patterns by Seller / Office
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <OfficeTable officeCounts={stats.officeCounts} />
              ) : (
                <Skeleton className="h-40" />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <ListingDetailDialog
        result={selectedResult}
        open={!!selectedResult}
        onClose={() => setSelectedResult(null)}
      />
    </div>
  );
}
