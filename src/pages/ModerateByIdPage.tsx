import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Loader2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Eye,
  Sparkles,
  Database,
  Globe,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  ScanLine,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { REFUSE_REASON_TYPES } from "@/lib/refuseReasons";

interface RuleMatchDetail {
  ruleName: string;
  ruleCategory: string;
  action: string;
  tier: string;
  message?: string;
  details?: string;
}

interface AiScanFlag {
  code: string;
  severity: string;
  message: string;
  field?: string;
  expected?: string;
  actual?: string;
}

interface AiScanResult {
  verdict: string;
  flagCount: number;
  summary: string;
  confidence: number;
  flags: AiScanFlag[];
}

interface ModerationResult {
  jeId: string;
  input: string;
  listingId?: string;
  title?: string;
  outcome?: string;
  ruleMatches?: number;
  ruleMatchDetails?: RuleMatchDetail[];
  llmTriggered?: boolean;
  visionAnalyzed?: boolean;
  error?: string;
  status: string;
  dataSource?: string;
  aiScan?: AiScanResult;
}

interface ModerationResponse {
  success: boolean;
  count: number;
  successCount: number;
  errorCount: number;
  results: ModerationResult[];
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  switch (outcome) {
    case "approved":
      return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"><CheckCircle className="size-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="size-3 mr-1" />Rejected</Badge>;
    case "notice":
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"><AlertTriangle className="size-3 mr-1" />Notice</Badge>;
    case "manual":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Eye className="size-3 mr-1" />Manual Review</Badge>;
    default:
      return <Badge variant="outline">{outcome || "unknown"}</Badge>;
  }
}

function DataSourceBadge({ source }: { source?: string }) {
  switch (source) {
    case "mobile_api":
      return <Badge variant="outline" className="text-xs text-green-600"><Database className="size-3 mr-1" />JE API</Badge>;
    case "je_page":
    case "html_scrape":
      return <Badge variant="outline" className="text-xs"><Globe className="size-3 mr-1" />JE Page</Badge>;
    case "api":
      return <Badge variant="outline" className="text-xs"><Database className="size-3 mr-1" />API</Badge>;
    case "minimal":
      return <Badge variant="outline" className="text-xs text-amber-600"><AlertTriangle className="size-3 mr-1" />Minimal Data</Badge>;
    default:
      return null;
  }
}

function RuleCategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    simple_code: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    hybrid_vision: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    auto_ai: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    former_manual: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    internal: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <Badge className={`text-[10px] px-1.5 py-0 ${colors[category] || "bg-zinc-100 text-zinc-600"}`}>
      {category.replace(/_/g, " ")}
    </Badge>
  );
}

function ActionBadge({ action }: { action: string }) {
  switch (action) {
    case "reject":
      return <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">reject</Badge>;
    case "notice":
      return <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">notice</Badge>;
    case "flag":
      return <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">flag</Badge>;
    case "approve":
      return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">approve</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{action}</Badge>;
  }
}

const aiVerdictConfig: Record<string, { bg: string; text: string; label: string }> = {
  reject: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Reject" },
  review: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", label: "Review" },
  ok: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "OK" },
};

function ResultCard({ result }: { result: ModerationResult }) {
  const [expanded, setExpanded] = useState(false);
  const [scanExpanded, setScanExpanded] = useState(false);
  const [actionDialog, setActionDialog] = useState<"reject" | "notice" | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [refuseReasonType, setRefuseReasonType] = useState("other");
  const [actionLoading, setActionLoading] = useState(false);
  const [overrideOutcome, setOverrideOutcome] = useState<string | null>(null);
  const hasRuleDetails = (result.ruleMatchDetails?.length ?? 0) > 0;
  const hasScan = !!result.aiScan;

  // Query the moderation result from DB to get the result ID for overrides
  const { data: dbResult } = useApiQuery(
    apiClient.moderation.latestByJeId,
    { jeId: result.jeId },
    { enabled: !!result.jeId && result.status === "success" },
  );
  const [overrideWithImplio] = useApiMutation(
    apiClient.moderation.overrideWithImplio,
  );
  const { data: templates } = useApiQuery(apiClient.messages.list);

  // The effective outcome (override takes priority)
  const effectiveOutcome = overrideOutcome || result.outcome;

  // Reset dialog inputs on close — otherwise a canceled Reject leaves the
  // refusal text in `message`, and a subsequent Approve would send it to the
  // seller as sellerMessage.
  const closeActionDialog = () => {
    setActionDialog(null);
    setMessage("");
    setReason("");
    setRefuseReasonType("other");
  };

  const handleAction = async (action: "approved" | "rejected" | "notice") => {
    if (!dbResult?._id) {
      toast.error("Moderation result not found — cannot override");
      return;
    }
    setActionLoading(true);
    try {
      // The override is attributed to the session moderator on the Rails side.
      await overrideWithImplio({
        resultId: dbResult._id,
        newOutcome: action,
        reason: reason || undefined,
        sellerMessage: action === "approved" ? undefined : message || undefined,
        refuseReasonType: action === "rejected" ? refuseReasonType : undefined,
      });
      setOverrideOutcome(action);
      toast.success(`Listing ${action === "approved" ? "approved" : action === "rejected" ? "rejected" : "noticed"} — synced to Implio`);
      closeActionDialog();
    } catch (err) {
      console.error("Override failed:", err);
      toast.error("Failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  };

  if (result.status === "error") {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
        <XCircle className="size-5 text-red-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-medium">#{result.jeId}</div>
          <div className="text-sm text-red-600 dark:text-red-400 mt-1">{result.error}</div>
        </div>
      </div>
    );
  }

  // Determine if we should show action buttons:
  // Show when there's no rule match (outcome = approved/notice) so the moderator can override
  // Also show for manual review items
  const showActionButtons = result.status === "success" && !!dbResult && !overrideOutcome;

  return (
    <>
      <div className="rounded-lg border bg-card">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 shrink-0">
            {effectiveOutcome === "approved" ? (
              <CheckCircle className="size-5 text-emerald-500" />
            ) : effectiveOutcome === "rejected" ? (
              <XCircle className="size-5 text-red-500" />
            ) : effectiveOutcome === "manual" ? (
              <Eye className="size-5 text-blue-500" />
            ) : (
              <AlertTriangle className="size-5 text-amber-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium">#{result.jeId}</span>
              <OutcomeBadge outcome={effectiveOutcome} />
              {overrideOutcome && (
                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px]">
                  Manually overridden
                </Badge>
              )}
              <DataSourceBadge source={result.dataSource} />
            </div>
            <div className="text-sm mt-1 truncate">{result.title}</div>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {hasRuleDetails ? (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
                >
                  <ShieldAlert className="size-3" />
                  {result.ruleMatches} rule{result.ruleMatches === 1 ? '' : 's'} matched
                  {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              ) : (result.ruleMatches ?? 0) > 0 ? (
                <span>{result.ruleMatches} rule{result.ruleMatches === 1 ? '' : 's'} matched</span>
              ) : null}
              {result.llmTriggered && (
                <span className="flex items-center gap-1"><Sparkles className="size-3" />LLM triggered</span>
              )}
              {result.visionAnalyzed && (
                <span className="flex items-center gap-1"><Eye className="size-3" />Vision analyzed</span>
              )}
              {result.input.startsWith('http') && (
                <a
                  href={result.input}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="size-3" />JE page
                </a>
              )}
            </div>
          </div>
          <Link
            to="/moderation-log"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Rule match details panel */}
        {expanded && hasRuleDetails && (
          <div className="border-t px-4 pb-4 pt-3 bg-muted/20">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Matched Rules</h4>
            <div className="space-y-2">
              {result.ruleMatchDetails!.map((rm, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">
                      {rm.ruleName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                    <RuleCategoryBadge category={rm.ruleCategory} />
                    <ActionBadge action={rm.action} />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {rm.tier}
                    </Badge>
                  </div>
                  {rm.details && (
                    <p className="text-xs text-muted-foreground mt-0.5">{rm.details}</p>
                  )}
                  {rm.message && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 italic">
                      Seller message: {rm.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Parameter Scan panel */}
        {hasScan && (
          <div className="border-t px-4 pb-4 pt-3 bg-muted/10">
            <button
              onClick={() => setScanExpanded(!scanExpanded)}
              className="flex items-center gap-2 w-full text-left"
            >
              <ScanLine className="size-4 text-violet-500" />
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Parameter Scan</h4>
              <Badge className={`text-[10px] px-1.5 py-0 ${aiVerdictConfig[result.aiScan!.verdict]?.bg || ""} ${aiVerdictConfig[result.aiScan!.verdict]?.text || ""}`}>
                {aiVerdictConfig[result.aiScan!.verdict]?.label || result.aiScan!.verdict}
              </Badge>
              {result.aiScan!.flagCount > 0 && (
                <span className="text-xs text-muted-foreground">{result.aiScan!.flagCount} flag{result.aiScan!.flagCount === 1 ? '' : 's'}</span>
              )}
              <span className="ml-auto">
                {scanExpanded ? <ChevronUp className="size-3 text-muted-foreground" /> : <ChevronDown className="size-3 text-muted-foreground" />}
              </span>
            </button>

            {scanExpanded && (() => {
              const severityIcon: Record<string, string> = { high: "🚨", medium: "🟨", low: "⬇️" };
              const shortLabel: Record<string, string> = {
                PRICE_SUSPICIOUS: "Suspicious price",
                PRICE_PER_SQM_ANOMALY: "Price/sqm anomaly",
                AREA_MISMATCH: "Area mismatch",
                LOCATION_SUSPICIOUS: "Location issue",
                CATEGORY_MISMATCH: "Category mismatch",
                MISSING_CRITICAL_DATA: "Missing key data",
                PRICE_AREA_CONFLICT: "Price vs area",
                DATA_ENTRY_ERROR: "Data entry error",
              };
              // Sort flags: high → medium → low
              const allFlags = [...result.aiScan!.flags].sort((a, b) => {
                const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
              });
              return (
                <div className="mt-2 space-y-1.5">
                  {allFlags.map((flag, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs">
                      <span className="shrink-0 mt-0.5">{severityIcon[flag.severity] || "•"}</span>
                      <div className="min-w-0">
                        <span className="font-medium">{shortLabel[flag.code] || flag.code?.replace(/_/g, " ").toLowerCase() || "Flag"}</span>
                        {flag.actual && <span className="text-muted-foreground"> · {flag.actual}</span>}
                        {flag.expected && <span className="text-muted-foreground"> (expected: {flag.expected})</span>}
                      </div>
                    </div>
                  ))}
                  {allFlags.length === 0 && (
                    <p className="text-xs text-muted-foreground">No flags</p>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ─── Manual Action Buttons ──────────────────────────────── */}
        {showActionButtons && (
          <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/5">
            <span className="text-xs text-muted-foreground">Manual override:</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-sky-600 border-sky-200 hover:bg-sky-50 h-7 text-xs"
                disabled={actionLoading}
                onClick={() => {
                  setMessage("");
                  setActionDialog("notice");
                }}
              >
                <MessageSquare className="size-3 mr-1" />
                Notice
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={actionLoading}
                onClick={() => {
                  // Auto-detect refuse reason from rule details
                  const ruleDetails = result.ruleMatchDetails || [];
                  const hasImageRule = ruleDetails.some((m) => /image|watermark|photo|picture|resolution/i.test(m.ruleName));
                  const hasDuplicateRule = ruleDetails.some((m) => /duplicate/i.test(m.ruleName));
                  const hasIllegalRule = ruleDetails.some((m) => /illegal|prohibited|weapon|drug/i.test(m.ruleName));
                  const detectedReason = hasImageRule ? "images" : hasDuplicateRule ? "duplicate" : hasIllegalRule ? "illegal" : "other";
                  setRefuseReasonType(detectedReason);
                  const reasonType = REFUSE_REASON_TYPES.find((t) => t.value === detectedReason);
                  setMessage(reasonType?.defaultMessage || "");
                  setActionDialog("reject");
                }}
              >
                <XCircle className="size-3 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                disabled={actionLoading}
                onClick={() => handleAction("approved")}
              >
                {actionLoading ? <Loader2 className="size-3 mr-1 animate-spin" /> : <CheckCircle2 className="size-3 mr-1" />}
                Approve
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Reject / Notice Dialog ───────────────────────────────── */}
      <Dialog open={!!actionDialog} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog === "reject" ? "Reject Listing" : "Send Notice"}
            </DialogTitle>
            <DialogDescription>
              {actionDialog === "reject"
                ? "This listing will be refused. The seller will receive a message explaining why."
                : "The listing stays live, but the seller gets a message about the issue."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog === "reject" && (
              <div>
                <label className="text-sm font-medium">Refuse Reason</label>
                <Select value={refuseReasonType} onValueChange={(val) => {
                  setRefuseReasonType(val);
                  const reasonType = REFUSE_REASON_TYPES.find((t) => t.value === val);
                  if (reasonType?.defaultMessage) setMessage(reasonType.defaultMessage);
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFUSE_REASON_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <div className={`size-2 rounded-full ${type.color}`} />
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {REFUSE_REASON_TYPES.find((t) => t.value === refuseReasonType)?.description}
                </p>
              </div>
            )}

            {templates && templates.length > 0 && (
              <div>
                <label className="text-sm font-medium">Template</label>
                <Select
                  onValueChange={(val) => {
                    const t = templates.find((t: any) => t._id === val);
                    if (t) setMessage((t as any).body);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t: any) => t.category === (actionDialog === "reject" ? "reject" : "notice"))
                      .map((t: any) => (
                        <SelectItem key={t._id} value={t._id}>{t.displayName}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Seller Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message to seller..."
                rows={4}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Internal Note (optional)</label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this decision..."
                rows={2}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeActionDialog}>
              Cancel
            </Button>
            <Button
              variant={actionDialog === "reject" ? "destructive" : "default"}
              onClick={() => handleAction(actionDialog === "reject" ? "rejected" : "notice")}
              disabled={(actionDialog === "reject" && !message) || actionLoading}
            >
              {actionLoading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              {actionDialog === "reject"
                ? `Reject — ${REFUSE_REASON_TYPES.find((t) => t.value === refuseReasonType)?.label || "Other"}`
                : "Send Notice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ModerateByIdPage() {
  const [fetchAndModerate] = useApiMutation(apiClient.moderateById.run);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ModerationResponse | null>(null);
  const [processedCount, setProcessedCount] = useState(0);

  const handleModerate = useCallback(async () => {
    // Parse input: split by newlines, commas, spaces, or pipes
    const rawInputs = inputText
      .split(/[\n,|]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawInputs.length === 0) return;

    setIsProcessing(true);
    setResults(null);
    setProcessedCount(0);

    try {
      const response = await fetchAndModerate({ inputs: rawInputs }) as ModerationResponse;
      setResults(response);
      setProcessedCount(response.count);
    } catch (e) {
      setResults({
        success: false,
        count: 0,
        successCount: 0,
        errorCount: 1,
        results: [{ jeId: "error", input: "", error: String(e), status: "error" }],
      });
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, fetchAndModerate]);

  const exampleUrls = "https://www.jamesedition.com/real_estate/.../listing-title-17403824\nhttps://www.jamesedition.com/yachts/.../listing-title-17400061";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Moderate by URL</h1>
        <p className="text-muted-foreground mt-1">
          Paste JamesEdition listing URLs to fetch and moderate them instantly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="size-5" />
            Listing Input
          </CardTitle>
          <CardDescription>
            Enter one listing URL per line. Paste full JamesEdition listing URLs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder={`Paste listing URLs, one per line:\n\n${exampleUrls}`}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={6}
            className="font-mono text-sm"
            disabled={isProcessing}
          />
          <div className="flex items-center gap-3">
            <Button
              onClick={handleModerate}
              disabled={isProcessing || !inputText.trim()}
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Processing{processedCount > 0 ? ` (${processedCount})` : '...'}
                </>
              ) : (
                <>
                  <Search className="size-4 mr-2" />
                  Moderate Listings
                </>
              )}
            </Button>
            {inputText.trim() && !isProcessing && (
              <span className="text-sm text-muted-foreground">
                {inputText.split(/[\n,|]+/).filter((s) => s.trim()).length} listing(s)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      {!results && !isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>Paste full JamesEdition listing URLs</li>
              <li>FeedLens fetches listing data via JE API (price, images, description, office, etc.)</li>
              <li>AI vision analyzes the listing images (if available)</li>
              <li>The moderation engine runs all active rules against the listing</li>
              <li>You see the outcome: approved, rejected, notice, or manual review</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-4">
              <strong>Tip:</strong> Paste the full listing URL from jamesedition.com for best results.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Results
              <Badge variant="outline">
                {results.successCount} processed
                {results.errorCount > 0 && `, ${results.errorCount} errors`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.results.map((result, i) => (
              <ResultCard key={i} result={result} />
            ))}

            {results.successCount > 0 && (
              <div className="pt-3 border-t">
                <Link to="/moderation-log">
                  <Button variant="outline" size="sm">
                    <Eye className="size-4 mr-2" />
                    View in Moderation Log
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
