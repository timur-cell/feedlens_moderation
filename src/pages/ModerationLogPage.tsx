import { useQuery } from "convex/react";
import { jeImageUrl } from "@/components/JeImage";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  Bot,
  Search,
  Loader2,
  Filter,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Image,
  MapPin,
  ExternalLink,
  Eye,
  Scan,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const outcomeConfig: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline"; color: string; bg: string }> = {
  approved: { label: "Approved", icon: CheckCircle2, variant: "default", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
  rejected: { label: "Rejected", icon: XCircle, variant: "destructive", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
  notice: { label: "Notice", icon: MessageSquare, variant: "secondary", color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950" },
  manual: { label: "Manual", icon: Clock, variant: "outline", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950" },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const aiVerdictConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
  reject: { label: "Should Reject", icon: ShieldAlert, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/50", border: "border-red-200 dark:border-red-800" },
  review: { label: "To Review", icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-200 dark:border-amber-800" },
  ok: { label: "Looks OK", icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200 dark:border-emerald-800" },
};

const flagSeverityColor: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/50 dark:border-red-800",
  medium: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:border-amber-800",
  low: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800",
};

function formatPrice(listing: any): string {
  if (listing?.priceOnRequest) return "POR";
  if (listing?.priceUsd) return `$${listing.priceUsd.toLocaleString()}`;
  if (listing?.price) return `${listing.price.toLocaleString()} ${listing.currency || ""}`;
  return "—";
}

/* ─── AI Param Scan Badge (inline in row) ─── */
const flagSeverityIcon: Record<string, string> = { high: "🚨", medium: "🟨", low: "⬇️" };
const flagShortLabel: Record<string, string> = {
  PRICE_SUSPICIOUS: "Suspicious price",
  PRICE_PER_SQM_ANOMALY: "Price/sqm anomaly",
  AREA_MISMATCH: "Area mismatch",
  LOCATION_SUSPICIOUS: "Location issue",
  CATEGORY_MISMATCH: "Category mismatch",
  MISSING_CRITICAL_DATA: "Missing key data",
  PRICE_AREA_CONFLICT: "Price vs area",
  DATA_ENTRY_ERROR: "Data entry error",
};
function shortFlag(f: any): string {
  return flagShortLabel[f.code] || f.code?.replace(/_/g, " ").toLowerCase() || f.message?.split(".")[0]?.slice(0, 30) || "Flag";
}
function AiScanBadge({ scan }: { scan: any }) {
  if (!scan) return null;
  const config = aiVerdictConfig[scan.verdict] || aiVerdictConfig.ok;
  const Icon = config.icon;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bg} ${config.color} border ${config.border}`}>
            <Icon className="size-3" />
            {scan.flagCount > 0 && <span>{scan.flagCount}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium">{config.label}</p>
          {scan.flags?.length > 0 && (
            <ul className="text-xs mt-1 space-y-0.5">
              {scan.flags.slice(0, 5).map((f: any, i: number) => (
                <li key={i}>{flagSeverityIcon[f.severity] || "•"} {shortFlag(f)}</li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─── AI Param Scan Expanded Detail ─── */
function AiScanDetail({ scan }: { scan: any }) {
  if (!scan || scan.flagCount === 0) return null;
  const config = aiVerdictConfig[scan.verdict] || aiVerdictConfig.ok;
  // Sort flags: high → medium → low
  const allFlags = [...(scan.flags || [])].sort((a: any, b: any) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });
  return (
    <div className={`mt-2 p-2 ${config.bg} border ${config.border} rounded text-xs`}>
      <div className="flex items-center gap-1.5 font-medium mb-1.5">
        <Scan className="size-3.5" />
        <span className={config.color}>AI Scan — {config.label}</span>
        <span className="opacity-60 ml-auto">{scan.flagCount} flag{scan.flagCount === 1 ? '' : 's'}</span>
      </div>
      {allFlags.length > 0 && (
        <div className="space-y-1">
          {allFlags.map((flag: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span className="shrink-0">{flagSeverityIcon[flag.severity] || "•"}</span>
              <span>{shortFlag(flag)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Single result row (card-based for better image display) ─── */
function ResultRow({ result, listing, scan }: { result: any; listing: any; scan?: any }) {
  const [expanded, setExpanded] = useState(false);
  const config = outcomeConfig[result.outcome] || outcomeConfig.manual;
  const Icon = config.icon;
  const isOverridden = !!result.overriddenBy;
  const thumbUrl = listing?.imageUrls?.[0];
  const location = [listing?.city, listing?.country].filter(Boolean).join(", ");

  return (
    <div className={`border-b last:border-b-0 ${isOverridden ? "bg-muted/20" : ""}`}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Thumbnail */}
        <div className="w-14 h-10 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
          {thumbUrl ? (
            <img src={jeImageUrl(thumbUrl)} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <Image className="size-4 text-muted-foreground/40" />
          )}
        </div>

        {/* Title + location */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{listing?.title || result.jeId}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {location && (
              <span className="flex items-center gap-0.5">
                <MapPin className="size-2.5" />{location}
              </span>
            )}
            <span>{formatPrice(listing)}</span>
            {listing?.imageCount != null && (
              <span className="flex items-center gap-0.5">
                <Image className="size-2.5" />{listing.imageCount}
              </span>
            )}
            {listing?.lqi != null && <span>LQI:{listing.lqi}</span>}
          </div>
        </div>

        {/* Quick links */}
        <div className="shrink-0 flex items-center gap-0.5">
          <a href={`https://www.jamesedition.com/admin/listings/${result.jeId}/edit`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted transition-colors" title="Open in JE Admin">Admin</a>
          {listing?.listingUrl && (
            <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-muted transition-colors inline-flex items-center gap-0.5" title="View on JamesEdition.com"><ExternalLink className="size-2.5" />Live</a>
          )}
        </div>

        {/* Outcome */}
        <div className="shrink-0 flex items-center gap-1.5">
          <Icon className={`size-4 ${config.color}`} />
          <Badge variant={config.variant} className="text-xs">{config.label}</Badge>
          {isOverridden && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger><RotateCcw className="size-3 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent>Overridden from "{result.originalOutcome}" by {result.overriddenBy}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Rules preview — clickable tags */}
        <div className="shrink-0 flex flex-wrap gap-1 max-w-[200px]">
          {result.ruleMatches?.slice(0, 2).map((m: any, i: number) => (
            <Link
              key={i}
              to={`/rules?highlight=${encodeURIComponent(m.ruleName)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex"
            >
              <Badge
                variant={m.action === "reject" ? "destructive" : "secondary"}
                className="text-[10px] truncate max-w-[90px] cursor-pointer hover:opacity-80 transition-opacity"
              >
                {m.ruleName}
              </Badge>
            </Link>
          ))}
          {(result.ruleMatches?.length || 0) > 2 && (
            <Badge variant="outline" className="text-[10px]">+{result.ruleMatches.length - 2}</Badge>
          )}
        </div>

        {/* AI indicators */}
        <div className="shrink-0 w-20 flex gap-1 items-center">
          <AiScanBadge scan={scan} />
          {result.visionResult && !result.visionResult?.error && (
            <Eye className="size-4 text-blue-500" title="AI Vision analyzed" />
          )}
          {result.llmTriggered ? <Bot className="size-4 text-violet-500" title="LLM triggered" /> : null}
        </div>

        {/* Time */}
        <div className="shrink-0 text-xs text-muted-foreground w-[90px] text-right">
          {formatDate(result.processedAt)}
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 w-5">
          {expanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className={`px-4 pb-4 pt-1 ${config.bg} border-t`}>
          <div className="flex gap-4">
            {/* Image strip */}
            {listing?.imageUrls && listing.imageUrls.length > 0 && (
              <div className="flex gap-1.5 shrink-0">
                {listing.imageUrls.slice(0, 6).map((url: string, i: number) => (
                  <div key={i} className="w-20 h-14 rounded overflow-hidden bg-muted">
                    <img src={jeImageUrl(url)} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {listing.imageUrls.length > 6 && (
                  <div className="w-20 h-14 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    +{listing.imageUrls.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parameters — categorized for easy navigation */}
          <div className="mt-3 text-xs space-y-3">
            {/* Basic Info */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Basic Info</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">JE ID:</span> <a href={`https://www.jamesedition.com/admin/listings/${result.jeId}/edit`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{result.jeId}</a></div>
                <div><span className="text-muted-foreground">Category:</span> {listing?.category ? listing.category.replace("RealEstate", "Real Estate") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Type:</span> {listing?.realEstateType || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Price (USD):</span> {listing?.priceUsd != null ? `$${listing.priceUsd.toLocaleString()}` : listing?.price != null ? `${listing.price.toLocaleString()} ${listing.currency || ""}` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">POR:</span> {listing?.priceOnRequest != null ? (listing.priceOnRequest ? "true" : "false") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Rental:</span> {listing?.rental != null ? (listing.rental ? "true" : "false") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Pre-owned:</span> {listing?.preOwned != null ? (listing.preOwned ? "true" : "false") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Outdated:</span> {listing?.outdated != null ? (listing.outdated ? "true" : "false") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Location</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">Country:</span> {listing?.country || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">City:</span> {listing?.city || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">State:</span> {listing?.state || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
              </div>
            </div>

            {/* Seller */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Seller</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">Office:</span> {listing?.office ? <a href={`https://www.jamesedition.com/admin/listings?search_term=${listing.office}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{listing.office}</a> : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Office Group:</span> {listing?.officeGroupName || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Plan:</span> {listing?.officeSubscription || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Feed:</span> {listing?.feedSource || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
              </div>
            </div>

            {/* Property Details */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Property</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">Beds:</span> {listing?.bedrooms != null ? listing.bedrooms : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Baths:</span> {listing?.bathrooms != null ? listing.bathrooms : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Living:</span> {listing?.livingArea != null ? `${listing.livingArea.toLocaleString()} m²` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Land:</span> {listing?.landArea != null ? `${listing.landArea.toLocaleString()} m²` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Price/sqm:</span> {listing?.pricePerSqm != null ? <span className={listing.pricePerSqm <= 150 ? "text-red-600 font-semibold" : listing.pricePerSqm <= 1000 ? "text-amber-600 font-medium" : ""}>{`$${listing.pricePerSqm.toLocaleString()}`}</span> : (listing?.price && listing?.livingArea ? <span className="text-amber-600 font-medium">{`~$${Math.round(listing.price / listing.livingArea).toLocaleString()}`}</span> : <span className="font-mono text-[10px] text-gray-400 italic">null</span>)}</div>
              </div>
            </div>

            {/* Content Quality */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Content Quality</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">Images:</span> {listing?.imageCount != null ? listing.imageCount : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Avg Img:</span> {listing?.avgImageWidth != null && listing?.avgImageHeight != null ? `${listing.avgImageWidth}×${listing.avgImageHeight}px` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">LQI:</span> {listing?.lqi != null ? `${listing.lqi}%` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">Desc length:</span> {listing?.descriptionLength != null ? `${listing.descriptionLength} chars` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
              </div>
            </div>

            {/* AI Analysis */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">AI Analysis</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div><span className="text-muted-foreground">AI Conclusion:</span> {listing?.chatGptConclusion != null ? <span className="font-medium">{listing.chatGptConclusion}</span> : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">AI Condition:</span> {listing?.chatGptPropertyCondition != null ? <span className="font-medium">{listing.chatGptPropertyCondition}/6</span> : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">AI Img Type:</span> {listing?.chatGptImageType || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">AI Img Quality:</span> {listing?.chatGptImageQuality || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">AI Watermark:</span> {listing?.chatGptWatermarkShare != null ? `${listing.chatGptWatermarkShare}/10` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                <div><span className="text-muted-foreground">AI Watermark Text:</span> {listing?.chatGptWatermarkText || <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
              </div>
            </div>

            {/* Links */}
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Links</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5">
                <div>
                  <a href={`https://www.jamesedition.com/admin/listings/${result.jeId}/edit`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    Admin ↗
                  </a>
                </div>
                {listing?.listingUrl && (
                  <div>
                    <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      <ExternalLink className="size-3" /> Live page
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Rule details */}
          {result.ruleMatches?.length > 0 && (
            <div className="mt-3 pt-2 border-t border-black/5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Rule Details</div>
              <div className="space-y-1">
                {result.ruleMatches.map((m: any, i: number) => (
                  <div key={i} className="text-xs flex items-start gap-2">
                    <Link
                      to={`/rules?highlight=${encodeURIComponent(m.ruleName)}`}
                      className="inline-flex shrink-0 mt-0.5"
                    >
                      <Badge
                        variant={m.action === "reject" ? "destructive" : "secondary"}
                        className="text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        {m.ruleName}
                      </Badge>
                    </Link>
                    <span className="text-muted-foreground">{m.details}</span>
                    {m.message && <span className="text-amber-600 italic ml-auto shrink-0">→ msg</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LLM response */}
          {result.llmTriggered && result.llmResponse && (
            <div className="mt-2 p-2 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 rounded text-xs">
              <div className="flex items-center gap-1 font-medium text-violet-700 dark:text-violet-300">
                <Bot className="size-3" />
                LLM: {result.llmResponse.recommendation}
                {result.llmResponse.confidence && (
                  <span className="opacity-70 ml-1">({Math.round(result.llmResponse.confidence * 100)}%)</span>
                )}
              </div>
              {result.llmResponse.assessment && (
                <p className="text-violet-600/80 dark:text-violet-400/80 mt-1">{result.llmResponse.assessment}</p>
              )}
            </div>
          )}

          {/* AI Vision analysis */}
          {result.visionResult && !result.visionResult.error && (
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded text-xs">
              <div className="flex items-center gap-1.5 font-medium text-blue-700 dark:text-blue-300 mb-1.5">
                <Eye className="size-3" />
                AI Vision ({result.visionModel || "claude"})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-blue-600/80 dark:text-blue-400/80">
                <div>Condition: <span className="font-medium">{result.visionResult.property_condition ?? "—"}/6</span></div>
                <div>Conclusion: <span className="font-medium">{result.visionResult.conclusion ?? "—"}/6</span></div>
                <div>Quality: <span className="font-medium">{result.visionResult.image_quality || "—"}</span></div>
                <div>Type: <span className={`font-medium ${
                  result.visionResult.image_type?.toLowerCase().includes("render") || result.visionResult.image_type?.toLowerCase().includes("ai")
                    ? "text-orange-600 dark:text-orange-400" : ""
                }`}>{result.visionResult.image_type || "—"}</span></div>
                {result.visionResult.watermark_text && (
                  <div className="col-span-2">Watermark: <span className="font-medium text-red-600">{result.visionResult.watermark_text}</span> ({result.visionResult.watermark_share}/10)</div>
                )}
                {result.visionResult.image_type_confidence && (
                  <div>Type confidence: <span className="font-medium">{result.visionResult.image_type_confidence}%</span></div>
                )}
              </div>
            </div>
          )}

          {/* AI Parameter Scan */}
          <AiScanDetail scan={scan} />

          {/* Override info */}
          {isOverridden && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
              ↩ Overridden from <Badge variant="outline" className="text-[10px] mx-1">{result.originalOutcome}</Badge>
              by {result.overriddenBy}
              {result.overrideReason && <span> — {result.overrideReason}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModerationLogPage() {
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiScanFilter, setAiScanFilter] = useState<string>("all"); // "all", "flagged", "reject", "review", "ok"

  const allResults = useQuery(api.moderation.getRecentResults, { limit: 200 });
  const filteredResults = useQuery(api.moderation.getResultsByOutcome,
    outcomeFilter !== "all" ? { outcome: outcomeFilter, limit: 100 } : "skip"
  );
  const results = outcomeFilter !== "all" ? filteredResults : allResults;
  const allListings = useQuery(api.listings.listRecent, { limit: 200 });
  const allScans = useQuery(api.aiParamScan.getRecentScans, { limit: 300 });

  const listingMap = new Map((allListings || []).map((l: any) => [l._id, l]));
  const scanMap = new Map((allScans || []).map((s: any) => [s.listingId, s]));

  // Filter by search + AI scan filter
  const filtered = (results || []).filter((r: any) => {
    // AI Scan filter
    if (aiScanFilter !== "all") {
      const scan = scanMap.get(r.listingId);
      if (aiScanFilter === "flagged") {
        if (!scan || scan.flagCount === 0) return false;
      } else {
        if (!scan || scan.verdict !== aiScanFilter) return false;
      }
    }

    if (!searchQuery) return true;
    const listing = listingMap.get(r.listingId);
    const q = searchQuery.toLowerCase();
    return (
      r.jeId?.toLowerCase().includes(q) ||
      listing?.title?.toLowerCase().includes(q) ||
      listing?.country?.toLowerCase().includes(q) ||
      listing?.city?.toLowerCase().includes(q) ||
      listing?.office?.toLowerCase().includes(q) ||
      r.ruleMatches?.some((m: any) => m.ruleName.toLowerCase().includes(q))
    );
  });

  // Stats
  const stats = {
    approved: filtered.filter((r: any) => r.outcome === "approved").length,
    rejected: filtered.filter((r: any) => r.outcome === "rejected").length,
    notice: filtered.filter((r: any) => r.outcome === "notice").length,
    manual: filtered.filter((r: any) => r.outcome === "manual").length,
  };

  // AI Scan stats (from all results, not just filtered)
  const aiScanStats = {
    flagged: (results || []).filter((r: any) => { const s = scanMap.get(r.listingId); return s && s.flagCount > 0; }).length,
    reject: (results || []).filter((r: any) => { const s = scanMap.get(r.listingId); return s?.verdict === "reject"; }).length,
    review: (results || []).filter((r: any) => { const s = scanMap.get(r.listingId); return s?.verdict === "review"; }).length,
    ok: (results || []).filter((r: any) => { const s = scanMap.get(r.listingId); return s?.verdict === "ok"; }).length,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Moderation Log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Complete history of all moderation decisions
        </p>
      </div>

      {/* Quick stats */}
      <div className="flex gap-3">
        {Object.entries(stats).map(([key, count]) => {
          const c = outcomeConfig[key];
          return (
            <button
              key={key}
              type="button"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                outcomeFilter === key ? `${c.bg} ring-2 ring-offset-1 ring-current ${c.color}` : "bg-muted hover:bg-muted/80"
              }`}
              onClick={() => setOutcomeFilter(outcomeFilter === key ? "all" : key)}
            >
              <c.icon className={`size-3.5 ${c.color}`} />
              {c.label}: {count}
            </button>
          );
        })}
      </div>

      {/* AI Parameter Scan Filter */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Scan className="size-3.5" />
          AI Param Scan:
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              aiScanFilter === "flagged"
                ? "bg-orange-50 dark:bg-orange-950 ring-2 ring-offset-1 ring-orange-400 text-orange-700 dark:text-orange-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
            onClick={() => setAiScanFilter(aiScanFilter === "flagged" ? "all" : "flagged")}
          >
            <AlertTriangle className="size-3 text-orange-500" />
            AI Flagged: {aiScanStats.flagged}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              aiScanFilter === "reject"
                ? "bg-red-50 dark:bg-red-950 ring-2 ring-offset-1 ring-red-400 text-red-700 dark:text-red-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
            onClick={() => setAiScanFilter(aiScanFilter === "reject" ? "all" : "reject")}
          >
            <ShieldAlert className="size-3 text-red-500" />
            Reject: {aiScanStats.reject}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              aiScanFilter === "review"
                ? "bg-amber-50 dark:bg-amber-950 ring-2 ring-offset-1 ring-amber-400 text-amber-700 dark:text-amber-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
            onClick={() => setAiScanFilter(aiScanFilter === "review" ? "all" : "review")}
          >
            <AlertTriangle className="size-3 text-amber-500" />
            Review: {aiScanStats.review}
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              aiScanFilter === "ok"
                ? "bg-emerald-50 dark:bg-emerald-950 ring-2 ring-offset-1 ring-emerald-400 text-emerald-700 dark:text-emerald-300"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
            onClick={() => setAiScanFilter(aiScanFilter === "ok" ? "all" : "ok")}
          >
            <ShieldCheck className="size-3 text-emerald-500" />
            OK: {aiScanStats.ok}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, JE ID, country, rule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {(searchQuery || outcomeFilter !== "all" || aiScanFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearchQuery(""); setOutcomeFilter("all"); setAiScanFilter("all"); }}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Reset filters
          </Button>
        )}
      </div>

      {/* Results list */}
      {!results ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <p>No moderation results found.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <TooltipProvider>
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
                <div className="w-14 shrink-0" />
                <div className="flex-1">Listing</div>
                <div className="shrink-0 w-[100px]">Outcome</div>
                <div className="shrink-0 w-[200px]">Rules</div>
                <div className="shrink-0 w-20 text-center">AI</div>
                <div className="shrink-0 w-[90px] text-right">Time</div>
                <div className="shrink-0 w-5" />
              </div>
              {/* Rows */}
              {filtered.map((r: any) => (
                <ResultRow
                  key={r._id}
                  result={r}
                  listing={listingMap.get(r.listingId)}
                  scan={scanMap.get(r.listingId)}
                />
              ))}
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {results?.length || 0} results
      </p>
    </div>
  );
}
