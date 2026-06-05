import { useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { jeImageUrl } from "@/components/JeImage";
import { api } from "../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Eye,
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Link2,
  ExternalLink,
  MapPin,
  Building2,
  Home,
  Camera,
  Shield,
  Droplets,
  Star,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

// ─── Helper Components ──────────────────────────────────────────

function imageTypeBadge(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("render") || t.includes("3d") || t.includes("cgi"))
    return <Badge variant="outline" className="border-purple-500 text-purple-700 bg-purple-50">Render 3D/CGI</Badge>;
  if (t.includes("ai"))
    return <Badge variant="destructive">AI-Generated</Badge>;
  if (t.includes("real"))
    return <Badge className="bg-green-600">Real Photo</Badge>;
  return <Badge variant="secondary">{type || "Unknown"}</Badge>;
}

function qualityBadge(q: string) {
  const ql = (q || "").toLowerCase();
  if (ql === "professional") return <Badge className="bg-green-600">Professional</Badge>;
  if (ql === "high") return <Badge className="bg-blue-600">High</Badge>;
  if (ql === "moderate") return <Badge variant="secondary">Moderate</Badge>;
  if (ql === "visualization") return <Badge variant="outline" className="border-purple-500 text-purple-700 bg-purple-50">Visualization</Badge>;
  if (ql === "low") return <Badge variant="outline" className="border-orange-500 text-orange-700">Low</Badge>;
  if (ql === "poor") return <Badge variant="destructive">Poor</Badge>;
  return <Badge variant="secondary">{q || "N/A"}</Badge>;
}

function conditionBar(score: number, max: number = 6) {
  const pct = (score / max) * 100;
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : pct >= 25 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium">{score.toFixed(1)}</span>
    </div>
  );
}

function conditionBarLarge(score: number | null, max: number = 6, label: string = "") {
  if (score === null) return <span className="text-muted-foreground text-sm">—</span>;
  const pct = (score / max) * 100;
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : pct >= 25 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      {label && <div className="text-xs text-muted-foreground">{label}</div>}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums w-8">{score.toFixed(1)}</span>
      </div>
    </div>
  );
}

function formatPrice(price: number | undefined, currency: string | undefined) {
  if (!price) return null;
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${sym}${price.toLocaleString()}`;
}

// ─── Listing URL Analysis Section ───────────────────────────────

function ListingUrlAnalysis() {
  const analyzeByUrl = useAction(api.imageRecognitionActions.analyzeListingByUrl);
  const submitToImplio = useAction(api.imageRecognitionActions.submitListingToImplio);
  const listingAnalyses = useQuery(api.imageRecognition.listListingAnalyses) || [];
  const deleteAnalysis = useMutation(api.imageRecognition.deleteListingAnalysis);
  const clearAllAnalyses = useMutation(api.imageRecognition.clearAllListingAnalyses);

  const [urlInput, setUrlInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAllImages, setShowAllImages] = useState<Record<string, boolean>>({});
  const [submittingImplio, setSubmittingImplio] = useState<Record<string, string>>({});
  const [rejectReasonId, setRejectReasonId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const handleImplioSubmit = async (analysisId: string, action: "approve" | "reject", reason?: string) => {
    setSubmittingImplio(prev => ({ ...prev, [analysisId]: action }));
    try {
      await submitToImplio({ analysisId: analysisId as any, action, reason });
    } catch (e: any) {
      alert(`Failed to submit to Implio: ${e.message}`);
    } finally {
      setSubmittingImplio(prev => { const next = { ...prev }; delete next[analysisId]; return next; });
      setRejectReasonId(null);
      setRejectReason("");
    }
  };

  const handleAnalyze = async () => {
    if (!urlInput.trim()) {
      setError("Please enter a listing URL or ID");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      await analyzeByUrl({ input: urlInput.trim() });
      setUrlInput("");
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* URL Input Card */}
      <Card className="border-2 border-blue-200 dark:border-blue-900 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Link2 className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="font-semibold text-base">Analyze Listing by URL</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Enter a JamesEdition listing URL or ID to analyze all images individually with per-image scores and averages
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.jamesedition.com/real_estate/... or listing ID"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && !isAnalyzing && handleAnalyze()}
                  className="bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800"
                  disabled={isAnalyzing}
                />
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !urlInput.trim()}
                  className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
                >
                  {isAnalyzing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Analyze</>
                  )}
                </Button>
              </div>
              {error && (
                <div className="bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 p-2.5 rounded-lg text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
                </div>
              )}
              {isAnalyzing && (
                <div className="bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 p-2.5 rounded-lg text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  Fetching listing images and analyzing each one with Claude... This may take 15–30 seconds.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Listing Analysis Results */}
      {listingAnalyses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Listing Analyses</CardTitle>
                <CardDescription>{listingAnalyses.length} listing{listingAnalyses.length !== 1 ? "s" : ""} analyzed</CardDescription>
              </div>
              {listingAnalyses.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => { if (confirm("Clear all listing analyses?")) clearAllAnalyses(); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {listingAnalyses.map((analysis: any) => {
              const isExpanded = expandedId === analysis._id;
              const summary = analysis.summary || {};
              const perImage = analysis.perImageResults || [];
              const showAll = showAllImages[analysis._id] || false;
              const displayedImages = showAll ? perImage : perImage.slice(0, 8);

              return (
                <div key={analysis._id} className="border rounded-xl overflow-hidden bg-card">
                  {/* Listing Header Bar */}
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : analysis._id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Listing thumbnail */}
                        {perImage[0]?.imageUrl && (
                          <img
                            src={jeImageUrl(perImage[0].imageUrl)}
                            alt=""
                            className="h-14 w-20 rounded-lg object-cover flex-shrink-0 border"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm truncate">{analysis.title}</h4>
                            <Badge variant="outline" className="text-xs flex-shrink-0">#{analysis.jeId}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            {analysis.price && (
                              <span className="font-medium text-foreground">
                                {formatPrice(analysis.price, analysis.currency)}
                              </span>
                            )}
                            {analysis.country && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" />
                                {[analysis.city, analysis.country].filter(Boolean).join(", ")}
                              </span>
                            )}
                            {analysis.realEstateType && (
                              <span className="flex items-center gap-0.5">
                                <Home className="h-3 w-3" />
                                {analysis.realEstateType}
                              </span>
                            )}
                            {analysis.office && (
                              <span className="flex items-center gap-0.5">
                                <Building2 className="h-3 w-3" />
                                {analysis.office}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5">
                              <Camera className="h-3 w-3" />
                              {analysis.analyzedImages}/{analysis.totalImages} images
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick summary stats */}
                      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                        <div className="hidden sm:flex items-center gap-3">
                          {summary.avgCondition != null && (
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Condition</div>
                              <div className="text-sm font-bold">{summary.avgCondition.toFixed(1)}<span className="text-xs text-muted-foreground">/6</span></div>
                            </div>
                          )}
                          {summary.avgConclusion != null && (
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Conclusion</div>
                              <div className="text-sm font-bold">{summary.avgConclusion.toFixed(1)}<span className="text-xs text-muted-foreground">/6</span></div>
                            </div>
                          )}
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Type</div>
                            <div className="text-xs">{imageTypeBadge(summary.dominantImageType || '')}</div>
                          </div>
                          {summary.watermarkedCount > 0 && (
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Watermarks</div>
                              <div className="text-sm font-bold text-orange-600">{summary.watermarkedCount}</div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Implio status badge */}
                          {analysis.implioStatus === "approved" && (
                            <Badge className="bg-green-600 text-white text-xs">✓ Approved in Implio</Badge>
                          )}
                          {analysis.implioStatus === "rejected" && (
                            <Badge variant="destructive" className="text-xs">✗ Rejected in Implio</Badge>
                          )}

                          {/* Approve/Reject buttons (only if not yet submitted) */}
                          {!analysis.implioStatus && (
                            <>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 px-2.5 text-green-700 border-green-300 hover:bg-green-50 hover:border-green-500"
                                disabled={!!submittingImplio[analysis._id]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Approve listing #${analysis.jeId} in Implio?`)) {
                                    handleImplioSubmit(analysis._id, "approve");
                                  }
                                }}
                              >
                                {submittingImplio[analysis._id] === "approve" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</>
                                )}
                              </Button>
                              <Button
                                variant="outline" size="sm"
                                className="h-7 px-2.5 text-red-700 border-red-300 hover:bg-red-50 hover:border-red-500"
                                disabled={!!submittingImplio[analysis._id]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectReasonId(rejectReasonId === analysis._id ? null : analysis._id);
                                }}
                              >
                                {submittingImplio[analysis._id] === "reject" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <><X className="h-3.5 w-3.5 mr-1" /> Reject</>
                                )}
                              </Button>
                            </>
                          )}

                          {analysis.listingUrl && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); window.open(analysis.listingUrl, '_blank'); }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                            onClick={(e) => { e.stopPropagation(); deleteAnalysis({ id: analysis._id }); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Reject Reason Input */}
                  {rejectReasonId === analysis._id && (
                    <div className="px-4 py-3 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <Input
                        placeholder="Rejection reason (optional, sent to Implio)..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="flex-1 border-red-200 dark:border-red-800 bg-white dark:bg-gray-900"
                        onKeyDown={(e) => e.key === "Enter" && handleImplioSubmit(analysis._id, "reject", rejectReason || undefined)}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleImplioSubmit(analysis._id, "reject", rejectReason || undefined)}
                        disabled={!!submittingImplio[analysis._id]}
                      >
                        {submittingImplio[analysis._id] === "reject" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : null}
                        Confirm Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setRejectReasonId(null); setRejectReason(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {/* Expanded Detail View */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Summary Stats Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 p-4 bg-muted/20">
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">Images Analyzed</div>
                          <div className="text-xl font-bold">{analysis.analyzedImages}<span className="text-sm text-muted-foreground font-normal">/{analysis.totalImages}</span></div>
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">Avg Condition</div>
                          <div className="text-xl font-bold">
                            {summary.avgCondition != null ? <>{summary.avgCondition.toFixed(1)}<span className="text-sm text-muted-foreground font-normal">/6</span></> : '—'}
                          </div>
                          {summary.avgCondition != null && (
                            <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${summary.avgCondition >= 4.5 ? 'bg-green-500' : summary.avgCondition >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${(summary.avgCondition / 6) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">Avg Conclusion</div>
                          <div className="text-xl font-bold">
                            {summary.avgConclusion != null ? <>{summary.avgConclusion.toFixed(1)}<span className="text-sm text-muted-foreground font-normal">/6</span></> : '—'}
                          </div>
                          {summary.avgConclusion != null && (
                            <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${summary.avgConclusion >= 4.5 ? 'bg-green-500' : summary.avgConclusion >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${(summary.avgConclusion / 6) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">Real Photos</div>
                          <div className="text-xl font-bold text-green-600">{summary.realPhotoCount || 0}</div>
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">3D Renders</div>
                          <div className="text-xl font-bold text-purple-600">{summary.renderCount || 0}</div>
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">AI-Generated</div>
                          <div className="text-xl font-bold text-red-600">{summary.aiGeneratedCount || 0}</div>
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">With Watermarks</div>
                          <div className="text-xl font-bold text-orange-600">{summary.watermarkedCount || 0}</div>
                        </div>
                        <div className="bg-card rounded-lg p-3 border">
                          <div className="text-xs text-muted-foreground mb-1">Avg Confidence</div>
                          <div className="text-xl font-bold">
                            {summary.avgConfidence != null ? <>{summary.avgConfidence}<span className="text-sm text-muted-foreground font-normal">%</span></> : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Per-Image Grid */}
                      <div className="p-4">
                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          Per-Image Analysis
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {displayedImages.map((img: any, idx: number) => (
                            <div key={idx} className="border rounded-lg overflow-hidden bg-card hover:shadow-md transition-shadow">
                              {/* Image */}
                              <div className="relative">
                                <img
                                  src={jeImageUrl(img.imageUrl)}
                                  alt={`Image ${img.imageIndex + 1}`}
                                  className="w-full h-36 object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = '';
                                    (e.target as HTMLImageElement).className = 'w-full h-36 bg-muted flex items-center justify-center';
                                  }}
                                />
                                <div className="absolute top-2 left-2">
                                  <Badge variant="secondary" className="bg-black/60 text-white text-xs border-0">
                                    #{img.imageIndex + 1}
                                  </Badge>
                                </div>
                                {img.error && (
                                  <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
                                    <span className="text-white text-xs font-medium bg-red-600 px-2 py-1 rounded">Error</span>
                                  </div>
                                )}
                              </div>

                              {/* Scores */}
                              {!img.error ? (
                                <div className="p-2.5 space-y-2">
                                  <div className="flex items-center justify-between">
                                    {imageTypeBadge(img.image_type || '')}
                                    {qualityBadge(img.image_quality || '')}
                                  </div>
                                  <div className="space-y-1.5">
                                    {conditionBarLarge(img.property_condition, 6, "Condition")}
                                    {conditionBarLarge(img.conclusion, 6, "Conclusion")}
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">
                                      Confidence: <strong className={
                                        (img.image_type_confidence || 0) >= 80 ? "text-green-600" :
                                        (img.image_type_confidence || 0) >= 50 ? "text-yellow-600" : "text-red-600"
                                      }>
                                        {img.image_type_confidence || '—'}%
                                      </strong>
                                    </span>
                                    {(img.watermark_share || 0) > 0 ? (
                                      <Badge variant="outline" className="border-orange-400 text-orange-600 text-xs h-5 px-1.5">
                                        <Droplets className="h-2.5 w-2.5 mr-0.5" /> WM {img.watermark_share}/10
                                      </Badge>
                                    ) : (
                                      <span className="text-green-600">✓ Clean</span>
                                    )}
                                  </div>
                                  {img.watermark_text && (
                                    <div className="text-xs text-orange-600 truncate" title={img.watermark_text}>
                                      WM: {img.watermark_text}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-2.5">
                                  <div className="text-xs text-red-600 truncate">{img.error}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Show more/less */}
                        {perImage.length > 8 && (
                          <div className="mt-3 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAllImages(prev => ({ ...prev, [analysis._id]: !showAll }))}
                            >
                              {showAll ? (
                                <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Show Less</>
                              ) : (
                                <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Show All {perImage.length} Images</>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Footer with metadata */}
                      <div className="px-4 py-2 border-t bg-muted/10 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Analyzed {new Date(analysis.analyzedAt).toLocaleString()}</span>
                        <span>
                          {summary.totalInputTokens ? `${((summary.totalInputTokens + summary.totalOutputTokens) / 1000).toFixed(1)}K tokens` : ''}
                          {summary.successCount != null && ` · ${summary.successCount} success, ${summary.errorCount} errors`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Manual Image Analysis Section ──────────────────────────────

function ManualImageAnalysis() {
  const results = useQuery(api.imageRecognition.listResults) || [];
  const analyzeVision = useAction(api.imageRecognitionActions.analyzeWithClaude);
  const saveResult = useMutation(api.imageRecognition.saveResult);
  const deleteResult = useMutation(api.imageRecognition.deleteResult);
  const clearAll = useMutation(api.imageRecognition.clearAllResults);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [jeIdInput, setJeIdInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [urlsInput, setUrlsInput] = useState("");
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    const urls = urlsInput.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http"));
    if (urls.length === 0) {
      setError("Please enter at least one image URL");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    setPreviewResult(null);
    try {
      const result = await analyzeVision({
        imageUrls: urls,
        listingTitle: titleInput || `Listing ${jeIdInput}`,
        listingId: jeIdInput || "unknown",
      });
      setPreviewResult(result);
      await saveResult({
        jeId: jeIdInput || "manual",
        title: titleInput || `Listing ${jeIdInput}`,
        imageUrls: urls,
        llm: result.llm || "openai",
        result,
        analyzedAt: Date.now(),
      });
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Stats
  const total = results.length;
  const renders = results.filter((r: any) => {
    const t = (r.result?.image_type || "").toLowerCase();
    return t.includes("render") || t.includes("3d") || t.includes("cgi");
  }).length;
  const aiGen = results.filter((r: any) => (r.result?.image_type || "").toLowerCase().includes("ai")).length;
  const realPhotos = total - renders - aiGen;
  const avgCondition = total > 0 ? results.reduce((s: number, r: any) => s + (r.result?.property_condition || 0), 0) / total : 0;
  const withWatermarks = results.filter((r: any) => (r.result?.watermark_share || 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* Stats + Action Row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Manual Image Analysis</h3>
          <p className="text-sm text-muted-foreground">Batch analysis by pasting image URLs directly</p>
        </div>
        <div className="flex gap-2">
          {total > 0 && (
            <Button variant="outline" size="sm" onClick={() => { if (confirm("Clear all manual results?")) clearAll(); }}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" /> Analyze Images
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Analyze Listing Images</DialogTitle>
                <DialogDescription>
                  Enter image URLs to analyze with Claude using the JE ConditionRecognizer prompt.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>JE Listing ID</Label>
                    <Input placeholder="e.g. 16952008" value={jeIdInput} onChange={(e) => setJeIdInput(e.target.value)} />
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input placeholder="e.g. Villa Ibiza" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Image URLs (one per line, up to 10)</Label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm h-32 font-mono"
                    placeholder={"https://images.jamesedition.com/...\nhttps://images.jamesedition.com/..."}
                    value={urlsInput}
                    onChange={(e) => setUrlsInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste JE listing image URLs. Claude will analyze all images as a batch.
                  </p>
                </div>
                {error && (
                  <div className="bg-red-50 text-red-700 p-2 rounded text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> {error}
                  </div>
                )}
                {previewResult && !previewResult.error && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-green-700 font-medium">
                      <CheckCircle2 className="h-4 w-4" /> Analysis Complete
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Condition: <strong>{previewResult.property_condition}</strong>/6</div>
                      <div>Conclusion: <strong>{previewResult.conclusion}</strong>/6</div>
                      <div>Type: {imageTypeBadge(previewResult.image_type)}</div>
                      <div>Quality: {qualityBadge(previewResult.image_quality)}</div>
                      <div>Watermarks: <strong>{previewResult.watermark_share}</strong>/10</div>
                      <div>Confidence: <strong>{previewResult.image_type_confidence}%</strong></div>
                    </div>
                  </div>
                )}
                {previewResult?.error && (
                  <div className="bg-red-50 text-red-700 p-2 rounded text-sm">{previewResult.error}</div>
                )}
                <Button onClick={handleAnalyze} disabled={isAnalyzing} className="w-full">
                  {isAnalyzing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing with Claude...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Analyze with Claude</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      {total > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-bold">{total}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Real Photos</div>
            <div className="text-lg font-bold text-green-600">{realPhotos}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">3D Renders</div>
            <div className="text-lg font-bold text-purple-600">{renders}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">AI-Generated</div>
            <div className="text-lg font-bold text-red-600">{aiGen}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Avg Condition</div>
            <div className="text-lg font-bold">{avgCondition.toFixed(1)}<span className="text-xs text-muted-foreground">/6</span></div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Watermarks</div>
            <div className="text-lg font-bold text-orange-600">{withWatermarks}</div>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {total > 0 ? (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>JE ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Conclusion</TableHead>
                  <TableHead>Image Type</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Watermarks</TableHead>
                  <TableHead>Analyzed</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r: any) => {
                  const res = r.result || {};
                  const isExpanded = expandedId === r._id;
                  return (
                    <>
                      <TableRow
                        key={r._id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isExpanded ? null : r._id)}
                      >
                        <TableCell className="font-mono text-sm">{r.jeId}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.title}</TableCell>
                        <TableCell>{res.property_condition != null ? conditionBar(res.property_condition) : "—"}</TableCell>
                        <TableCell>{res.conclusion != null ? conditionBar(res.conclusion) : "—"}</TableCell>
                        <TableCell>{imageTypeBadge(res.image_type)}</TableCell>
                        <TableCell>
                          {res.image_type_confidence != null ? (
                            <span className={`text-sm font-medium ${res.image_type_confidence >= 80 ? "text-green-600" : res.image_type_confidence >= 50 ? "text-yellow-600" : "text-red-600"}`}>
                              {res.image_type_confidence}%
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{qualityBadge(res.image_quality)}</TableCell>
                        <TableCell>
                          {(res.watermark_share || 0) > 0 ? (
                            <Badge variant="outline" className="border-orange-400 text-orange-600">
                              {res.watermark_share}/10
                            </Badge>
                          ) : (
                            <span className="text-green-600 text-sm">Clean</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(r.analyzedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : r._id); }}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); deleteResult({ id: r._id }); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={r._id + "-detail"}>
                          <TableCell colSpan={10} className="bg-muted/30 p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-medium mb-2 text-sm">Analyzed Images ({r.imageUrls.length})</h4>
                                <div className="grid grid-cols-3 gap-2">
                                  {r.imageUrls.slice(0, 6).map((url: string, i: number) => (
                                    <img
                                      key={i}
                                      src={jeImageUrl(url)}
                                      alt={`Image ${i + 1}`}
                                      className="rounded border h-24 w-full object-cover"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="font-medium mb-2 text-sm">Full AI Response</h4>
                                <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto max-h-48 font-mono">
                                  {JSON.stringify(res, null, 2)}
                                </pre>
                                <div className="mt-2 text-xs text-muted-foreground flex gap-3">
                                  <span>Model: {res.model || r.llm}</span>
                                  {res.input_tokens && <span>Tokens: {res.input_tokens} in / {res.output_tokens} out</span>}
                                </div>
                                {res.watermark_text && (
                                  <div className="mt-2 text-sm">
                                    <strong>Watermark text:</strong> {res.watermark_text}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No manual analyses yet. Click "Analyze Images" to start.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function ImageRecognitionPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-purple-600" />
          AI Image Recognition
        </h1>
        <p className="text-muted-foreground mt-1">
          Claude Sonnet image analysis using JE's ConditionRecognizer prompt • Detects renders, watermarks, property condition
        </p>
      </div>

      {/* Info Box */}
      <Card className="border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-purple-900 dark:text-purple-300">Using JE's ConditionRecognizer Prompt with Claude Sonnet</p>
              <p className="text-purple-700 dark:text-purple-400 mt-1">
                This uses the same prompt from <code className="bg-purple-100 dark:bg-purple-900/50 px-1 rounded">app/src/je/listings/condition_recognizer.rb</code> that JE uses with GPT-4o,
                but routed through Claude Sonnet instead. Scale: property_condition 1–6, conclusion 1–6, watermark_share 0–10, image_type (Real photo / Render 3D / AI-generated).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Listing URL Analysis — Primary Feature */}
      <ListingUrlAnalysis />

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-3 text-xs text-muted-foreground uppercase tracking-wider">Manual Analysis</span>
        </div>
      </div>

      {/* Manual Image Analysis */}
      <ManualImageAnalysis />
    </div>
  );
}
