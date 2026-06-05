import { useAction, useMutation, useQuery } from "convex/react";
import { jeImageUrl } from "@/components/JeImage";
import {
  ShieldCheck,
  ShieldAlert,
  Regex,
  Bot,
  Building,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
  Image,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  List,
  Plus,
  Sparkles,
  Wrench,
  Trash2,
  Search,
  Eye,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

// ─── Config maps ─────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  simple_code: { label: "Simple Code", icon: ShieldCheck, color: "text-emerald-600" },
  hybrid_vision: { label: "Hybrid Vision", icon: Bot, color: "text-purple-600" },
  auto_ai: { label: "Auto AI", icon: Regex, color: "text-blue-600" },
  former_manual: { label: "Former Manual", icon: ShieldAlert, color: "text-orange-600" },
  internal: { label: "Internal", icon: Building, color: "text-zinc-500" },
};

const tierConfig: Record<string, { label: string; color: string }> = {
  auto: { label: "Auto", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
  verify: { label: "Verify", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  manual: { label: "Manual", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const actionConfig: Record<string, { label: string; color: string }> = {
  reject: { label: "Reject", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  notice: { label: "Notice", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  flag: { label: "Flag", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
};

const outcomeIcons: Record<string, { icon: any; color: string; label: string }> = {
  approved: { icon: CheckCircle2, color: "text-emerald-600", label: "Approved" },
  rejected: { icon: XCircle, color: "text-red-600", label: "Rejected" },
  notice: { icon: MessageSquare, color: "text-sky-600", label: "Notice" },
  manual: { icon: Clock, color: "text-amber-600", label: "Manual" },
};

const listingCategoryConfig: Record<string, { label: string; color: string }> = {
  real_estate: { label: "Real Estate", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
  cars: { label: "Cars", color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800" },
};

// ─── Date formatters ─────────────────────────────────────────────

function formatDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateEmail(str?: string): string {
  if (!str) return "—";
  if (str.length <= 20) return str;
  // Truncate email-like strings
  const atIdx = str.indexOf("@");
  if (atIdx > 0) {
    const local = str.substring(0, atIdx);
    const domain = str.substring(atIdx);
    if (local.length > 10) {
      return local.substring(0, 10) + "…" + domain.substring(0, 8) + (domain.length > 8 ? "…" : "");
    }
    return local + domain.substring(0, 12) + (domain.length > 12 ? "…" : "");
  }
  return str.substring(0, 20) + "…";
}

// ─── Items Matched Preview ───────────────────────────────────────

function ItemsMatchedByRule({ ruleName }: { ruleName: string }) {
  const matchedData = useQuery(api.moderation.getResultsByRule, { ruleName, limit: 20 });

  if (!matchedData) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (matchedData.total === 0) {
    return (
      <div className="text-center py-4 text-xs text-muted-foreground">
        No listings matched this rule yet.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <List className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Items matched by this rule</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {matchedData.total.toLocaleString()} items ({matchedData.percentage}% of all)
        </span>
      </div>
      <div className="space-y-0 border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b">
          <div className="w-10 shrink-0" />
          <div className="flex-1">Content</div>
          <div className="w-[80px] shrink-0">ID</div>
          <div className="w-[100px] shrink-0">Received at</div>
          <div className="w-[140px] shrink-0">Rules matched</div>
          <div className="w-[120px] shrink-0 text-right">Status</div>
        </div>
        {matchedData.items.map((item: any) => {
          const listing = item.listing;
          const oConfig = outcomeIcons[item.outcome] || outcomeIcons.manual;
          const OIcon = oConfig.icon;
          const thumbUrl = listing?.imageUrls?.[0];
          const imgCount = listing?.imageUrls?.length || listing?.imageCount || 0;
          return (
            <div key={item._id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/20 transition-colors">
              <div className="w-10 h-8 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center relative">
                {thumbUrl ? (
                  <img src={jeImageUrl(thumbUrl)} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <Image className="size-3 text-muted-foreground/40" />
                )}
                {imgCount > 1 && (
                  <span className="absolute bottom-0 left-0 bg-black/60 text-white text-[8px] px-0.5 rounded-tr">+{imgCount - 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{listing?.title || item.jeId}</p>
                <p className="text-[10px] text-muted-foreground truncate">{listing?.description?.substring(0, 80) || ""}</p>
              </div>
              <div className="w-[80px] shrink-0">
                <a href={`https://www.jamesedition.com/admin/listings/${item.jeId}/edit`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline font-mono">{item.jeId}</a>
              </div>
              <div className="w-[100px] shrink-0 text-[11px] text-muted-foreground">
                {new Date(item.processedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              <div className="w-[140px] shrink-0 flex flex-wrap gap-0.5">
                {item.ruleMatches?.slice(0, 2).map((m: any, i: number) => (
                  <Badge key={i} variant={m.ruleName === ruleName ? "default" : "outline"} className={`text-[9px] truncate max-w-[65px] ${m.ruleName === ruleName ? "bg-blue-500 hover:bg-blue-600" : ""}`}>
                    {m.ruleName.split("_").slice(0, 2).join("_")}
                  </Badge>
                ))}
                {(item.ruleMatches?.length || 0) > 2 && (
                  <Badge variant="outline" className="text-[9px]">+{item.ruleMatches.length - 2}</Badge>
                )}
              </div>
              <div className="w-[120px] shrink-0 flex items-center justify-end gap-1">
                <OIcon className={`size-3 ${oConfig.color}`} />
                <span className={`text-[11px] font-medium ${oConfig.color}`}>{oConfig.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      {matchedData.total > matchedData.items.length && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          Showing {matchedData.items.length} of {matchedData.total.toLocaleString()} matched items
        </p>
      )}
    </div>
  );
}

// ─── Rule Preview Dialog ────────────────────────────────────────

function RulePreviewDialog({ rule, open, onClose }: { rule: any; open: boolean; onClose: () => void }) {
  const [showMatched, setShowMatched] = useState(false);

  if (!rule) return null;

  const catConfig = categoryConfig[rule.category] || categoryConfig.simple_code;
  const CatIcon = catConfig.icon;
  const tConfig = tierConfig[rule.tier] || tierConfig.manual;
  const aConfig = actionConfig[rule.action] || actionConfig.flag;
  const fpRate = rule.falsePositiveCount && rule.matchCount
    ? Math.round((rule.falsePositiveCount / rule.matchCount) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CatIcon className={`size-5 ${catConfig.color}`} />
            {rule.displayName}
          </DialogTitle>
          <DialogDescription>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{rule.name}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {rule.description && (
            <p className="text-sm text-muted-foreground">{rule.description}</p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {rule.listingCategory && (
              <Badge variant="outline" className={listingCategoryConfig[rule.listingCategory]?.color || ""}>
                {listingCategoryConfig[rule.listingCategory]?.label || rule.listingCategory}
              </Badge>
            )}
            <Badge className={`${tConfig.color} border-0`}>{tConfig.label}</Badge>
            <Badge className={`${aConfig.color} border-0`}>{aConfig.label}</Badge>
            <Badge variant="outline">{catConfig.label}</Badge>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><TrendingUp className="size-3" /> {rule.matchCount || 0} matches</span>
            {fpRate > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="size-3" /> {fpRate}% FP</span>}
            {rule.lastMatchedAt && <span>Last: {formatDate(rule.lastMatchedAt)}</span>}
            <span>Priority: {rule.priority}</span>
          </div>

          {/* List references */}
          {(rule.config?.listRef || rule.config?.excludeListRef || rule.config?.additionalListRef || rule.config?.watermarkListRef || rule.config?.excludeTitleListRef) && (
            <div>
              <span className="text-xs font-medium">📋 Referenced Lists:</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {rule.config?.listRef && <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-[11px]">match: <code>{rule.config.listRef}</code></span>}
                {rule.config?.additionalListRef && <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-[11px]">+match: <code>{rule.config.additionalListRef}</code></span>}
                {rule.config?.excludeListRef && <span className="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded text-[11px]">exclude: <code>{rule.config.excludeListRef}</code></span>}
                {rule.config?.excludeTitleListRef && <span className="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded text-[11px]">exclude title: <code>{rule.config.excludeTitleListRef}</code></span>}
                {rule.config?.watermarkListRef && <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded text-[11px]">watermark: <code>{rule.config.watermarkListRef}</code></span>}
              </div>
            </div>
          )}

          {/* Config */}
          <div>
            <span className="text-xs font-medium">Config:</span>
            <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-x-auto max-h-60">
              {JSON.stringify(rule.config, null, 2)}
            </pre>
          </div>

          {rule.sellerMessage && (
            <div>
              <span className="text-xs font-medium">Seller message:</span>
              <p className="text-sm text-muted-foreground mt-1 bg-muted/50 p-2 rounded">{rule.sellerMessage}</p>
            </div>
          )}

          {/* Audit */}
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground border-t pt-3">
            <div><span className="font-medium text-foreground">Created:</span> {formatDateTime(rule.createdAt || rule._creationTime)}</div>
            <div><span className="font-medium text-foreground">Last modified:</span> {formatDateTime(rule.lastModifiedAt)}</div>
            <div><span className="font-medium text-foreground">Modified by:</span> {rule.lastModifiedBy || "—"}</div>
          </div>

          {/* Items matched */}
          <div className="border-t pt-3">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowMatched(!showMatched)}>
              <List className="size-3 mr-1" />
              {showMatched ? "Hide matched items" : "Show matched items"}
              {(rule.matchCount || 0) > 0 && (
                <Badge variant="secondary" className="text-[9px] ml-1 h-4 px-1">{rule.matchCount}</Badge>
              )}
            </Button>
            {showMatched && <ItemsMatchedByRule ruleName={rule.name} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rule Editor Dialog ─────────────────────────────────────────

function RuleEditorDialog({ rule, open, onClose }: { rule: any; open: boolean; onClose: () => void }) {
  const updateRule = useMutation(api.rules.update);
  const currentUser = useQuery(api.auth.currentUser);
  const [displayName, setDisplayName] = useState(rule?.displayName || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [tier, setTier] = useState(rule?.tier || "manual");
  const [action, setAction] = useState(rule?.action || "flag");
  const [priority, setPriority] = useState(String(rule?.priority || 50));
  const [listingCategory, setListingCategory] = useState(rule?.listingCategory === "all" ? "real_estate" : (rule?.listingCategory || "real_estate"));
  const [sellerMessage, setSellerMessage] = useState(rule?.sellerMessage || "");
  const [configJson, setConfigJson] = useState(JSON.stringify(rule?.config || {}, null, 2));

  const handleSave = async () => {
    try {
      let config;
      try { config = JSON.parse(configJson); } catch { toast.error("Invalid JSON in config"); return; }
      await updateRule({
        id: rule._id,
        displayName,
        description,
        listingCategory,
        tier,
        action,
        priority: parseInt(priority) || 50,
        sellerMessage,
        config,
        modifiedBy: currentUser?.email || currentUser?.name || "unknown",
      });
      toast.success("Rule updated");
      onClose();
    } catch (e) {
      toast.error("Failed to update rule");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Rule: {rule?.name}</DialogTitle>
          <DialogDescription>Modify rule configuration. Changes take effect immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Input value={priority} onChange={(e) => setPriority(e.target.value)} type="number" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Listing Type</label>
              <Select value={listingCategory} onValueChange={setListingCategory}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="real_estate">Real Estate</SelectItem>
                  <SelectItem value="cars">Cars</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tier</label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (high confidence)</SelectItem>
                  <SelectItem value="verify">Verify (LLM check)</SelectItem>
                  <SelectItem value="manual">Manual (human review)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Action</label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reject">Reject</SelectItem>
                  <SelectItem value="notice">Notice</SelectItem>
                  <SelectItem value="flag">Flag for review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Seller Message</label>
            <Textarea value={sellerMessage} onChange={(e) => setSellerMessage(e.target.value)} rows={3} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Config (JSON)</label>
            <Textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={8} className="mt-1 font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Rule Dialog ─────────────────────────────────────────

function CreateRuleDialog({ open, onClose, existingRuleNames }: { open: boolean; onClose: () => void; existingRuleNames: string[] }) {
  const createRule = useMutation(api.rules.create);
  const suggestRule = useAction(api.rulesAi.suggestRule);
  const currentUser = useQuery(api.auth.currentUser);
  const [mode, setMode] = useState<"manual" | "ai">("ai");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiSuggested, setAiSuggested] = useState(false);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("simple_code");
  const [listingCategory, setListingCategory] = useState("real_estate");
  const [tier, setTier] = useState("auto");
  const [action, setAction] = useState("reject");
  const [priority, setPriority] = useState("50");
  const [enabled, setEnabled] = useState(false);
  const [sellerMessage, setSellerMessage] = useState("");
  const [configJson, setConfigJson] = useState("{\n  \n}");

  const resetForm = () => {
    setName(""); setDisplayName(""); setDescription(""); setCategory("simple_code");
    setListingCategory("real_estate"); setTier("auto"); setAction("reject");
    setPriority("50"); setEnabled(false); setSellerMessage(""); setConfigJson("{\n  \n}");
    setAiDescription(""); setAiSuggested(false);
  };

  const handleAiSuggest = async () => {
    if (!aiDescription.trim()) { toast.error("Please describe the rule you want to create"); return; }
    setAiLoading(true);
    try {
      const suggestion = await suggestRule({ description: aiDescription });
      setName(suggestion.name || ""); setDisplayName(suggestion.displayName || "");
      setDescription(suggestion.description || ""); setCategory(suggestion.category || "simple_code");
      setListingCategory(suggestion.listingCategory || "real_estate"); setTier(suggestion.tier || "auto");
      setAction(suggestion.action || "reject"); setPriority(String(suggestion.priority || 50));
      setEnabled(suggestion.enabled ?? false); setSellerMessage(suggestion.sellerMessage || "");
      setConfigJson(JSON.stringify(suggestion.config || {}, null, 2)); setAiSuggested(true);
      toast.success("AI generated a rule suggestion — review and adjust before saving");
    } catch (e: any) {
      toast.error("AI suggestion failed: " + (e.message || "Unknown error"));
    } finally { setAiLoading(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Rule name is required"); return; }
    if (!displayName.trim()) { toast.error("Display name is required"); return; }
    if (existingRuleNames.includes(name.trim())) { toast.error("A rule with this name already exists"); return; }
    let config;
    try { config = JSON.parse(configJson); } catch { toast.error("Invalid JSON in config"); return; }
    try {
      await createRule({
        name: name.trim(), displayName: displayName.trim(),
        description: description.trim() || undefined, category, listingCategory,
        tier, action, priority: parseInt(priority) || 50, enabled, config,
        sellerMessage: sellerMessage.trim() || undefined,
        modifiedBy: currentUser?.email || currentUser?.name || "unknown",
      });
      toast.success("Rule created successfully"); resetForm(); onClose();
    } catch (e: any) {
      toast.error("Failed to create rule: " + (e.message || "Unknown error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Rule</DialogTitle>
          <DialogDescription>Create a moderation rule manually or let AI help you build one.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button onClick={() => setMode("ai")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "ai" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Sparkles className="size-3.5" /> AI Assisted
          </button>
          <button onClick={() => setMode("manual")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "manual" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Wrench className="size-3.5" /> Manual
          </button>
        </div>

        {mode === "ai" && !aiSuggested && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Describe your rule in plain text</label>
              <Textarea value={aiDescription} onChange={(e) => setAiDescription(e.target.value)} rows={4} className="mt-1" placeholder="e.g., Reject all real estate listings from Turkey with less than 5 images and LQI below 40." />
              <p className="text-xs text-muted-foreground mt-1.5">Be specific about: what to check, which countries/feeds/account types, what action to take.</p>
            </div>
            <Button onClick={handleAiSuggest} disabled={aiLoading || !aiDescription.trim()} className="w-full">
              {aiLoading ? <><Loader2 className="size-4 mr-2 animate-spin" />Generating rule...</> : <><Sparkles className="size-4 mr-2" />Generate Rule with AI</>}
            </Button>
          </div>
        )}

        {mode === "ai" && aiSuggested && (
          <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <Sparkles className="size-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-purple-700 dark:text-purple-300">AI-generated suggestion</p>
              <p className="text-purple-600 dark:text-purple-400 mt-0.5">Review and adjust the fields below before saving.</p>
              <button onClick={() => { setAiSuggested(false); resetForm(); }} className="text-purple-700 dark:text-purple-300 underline mt-1 hover:text-purple-900">← Start over</button>
            </div>
          </div>
        )}

        {(mode === "manual" || aiSuggested) && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Name (unique, snake_case)</label>
                <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} className="mt-1 font-mono" placeholder="my_new_rule" />
              </div>
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" placeholder="My New Rule" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" placeholder="What this rule checks..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Rule Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple_code">Simple Code</SelectItem>
                    <SelectItem value="auto_ai">Auto AI (regex/text)</SelectItem>
                    <SelectItem value="hybrid_vision">Hybrid Vision</SelectItem>
                    <SelectItem value="former_manual">Former Manual</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Listing Type</label>
                <Select value={listingCategory} onValueChange={setListingCategory}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="real_estate">Real Estate</SelectItem>
                    <SelectItem value="cars">Cars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Tier</label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (high confidence)</SelectItem>
                    <SelectItem value="verify">Verify (LLM check)</SelectItem>
                    <SelectItem value="manual">Manual (human review)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Action</label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reject">Reject</SelectItem>
                    <SelectItem value="notice">Notice</SelectItem>
                    <SelectItem value="flag">Flag for review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Priority</label>
                <Input value={priority} onChange={(e) => setPriority(e.target.value)} type="number" className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-3 py-1">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                <span>Enabled immediately</span>
              </label>
            </div>
            <div>
              <label className="text-sm font-medium">Seller Message</label>
              <Textarea value={sellerMessage} onChange={(e) => setSellerMessage(e.target.value)} rows={2} className="mt-1" placeholder="Message shown to the seller..." />
            </div>
            <div>
              <label className="text-sm font-medium">Config (JSON)</label>
              <Textarea value={configJson} onChange={(e) => setConfigJson(e.target.value)} rows={10} className="mt-1 font-mono text-xs" />
              <p className="text-xs text-muted-foreground mt-1">Conditions format: {`{"conditions": [{"field": "priceUsd", "operator": "<", "value": 490000}]}`}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }}>Cancel</Button>
          {(mode === "manual" || aiSuggested) && (
            <Button onClick={handleSave}><Plus className="size-4 mr-1" /> Create Rule</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page: Table Layout ────────────────────────────────────

export default function RulesPage() {
  const rules = useQuery(api.rules.list);
  const currentUser = useQuery(api.auth.currentUser);
  const toggleEnabled = useMutation(api.rules.toggleEnabled);
  const removeRule = useMutation(api.rules.remove);

  const [editingRule, setEditingRule] = useState<any>(null);
  const [previewRule, setPreviewRule] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [listingCategoryFilter, setListingCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams] = useSearchParams();
  const highlightedRule = searchParams.get("highlight");

  const filtered = useMemo(() => {
    if (!rules) return [];
    return rules.filter((r: any) => {
      const catMatch = categoryFilter === "all" || r.category === categoryFilter;
      const lcMatch = listingCategoryFilter === "all" || r.listingCategory === listingCategoryFilter;
      const searchMatch = !searchQuery || r.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || r.name.toLowerCase().includes(searchQuery.toLowerCase());
      return catMatch && lcMatch && searchMatch;
    });
  }, [rules, categoryFilter, listingCategoryFilter, searchQuery]);

  const sorted = useMemo(() => [...filtered].sort((a: any, b: any) => a.priority - b.priority), [filtered]);

  if (!rules) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledCount = rules.filter((r: any) => r.enabled).length;

  const handleToggle = (rule: any) => {
    toggleEnabled({
      id: rule._id,
      modifiedBy: currentUser?.email || currentUser?.name || "unknown",
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await removeRule({ id: deleteConfirm._id });
      toast.success(`Rule "${deleteConfirm.displayName}" deleted`);
      setDeleteConfirm(null);
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {enabledCount} of {rules.length} rules active
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="size-4 mr-1.5" /> Create Rule
        </Button>
      </div>

      {/* Filters & Search */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search rules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Listing Type</span>
          <div className="flex gap-1.5">
            <Button variant={listingCategoryFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setListingCategoryFilter("all")}>All ({rules.length})</Button>
            {(["real_estate", "cars"] as const).map((lc) => {
              const count = rules.filter((r: any) => r.listingCategory === lc).length;
              return (
                <Button key={lc} variant={listingCategoryFilter === lc ? "default" : "outline"} size="sm" onClick={() => setListingCategoryFilter(lc)}>
                  {lc === "real_estate" ? "Real Estate" : "Cars"} ({count})
                </Button>
              );
            })}
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">Rule Type</span>
          <div className="flex gap-1.5">
            <Button variant={categoryFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setCategoryFilter("all")}>All</Button>
            {Object.entries(categoryConfig).map(([key, config]) => {
              const count = rules.filter((r: any) => r.category === key).length;
              if (count === 0) return null;
              const Icon = config.icon;
              return (
                <Button key={key} variant={categoryFilter === key ? "default" : "outline"} size="sm" onClick={() => setCategoryFilter(key)}>
                  <Icon className="size-3.5 mr-1" /> {config.label} ({count})
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        {sorted.length === rules.length
          ? `${rules.length} rules`
          : `${sorted.length} of ${rules.length} rules`
        }
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[60px]">Status</TableHead>
                <TableHead className="min-w-[250px]">Name</TableHead>
                <TableHead className="w-[120px]">Created at</TableHead>
                <TableHead className="w-[140px]">Last modified at</TableHead>
                <TableHead className="w-[150px]">Last modified by</TableHead>
                <TableHead className="w-[120px]">Rule action</TableHead>
                <TableHead className="w-[100px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No rules match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((rule: any) => {
                  const catConfig2 = categoryConfig[rule.category] || categoryConfig.simple_code;
                  const CatIcon = catConfig2.icon;
                  const aConfig2 = actionConfig[rule.action] || actionConfig.flag;
                  const isHighlighted = highlightedRule === rule.name;

                  return (
                    <TableRow
                      key={rule._id}
                      className={`group transition-colors ${!rule.enabled ? "opacity-50" : ""} ${isHighlighted ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                    >
                      {/* Status toggle */}
                      <TableCell>
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => handleToggle(rule)}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CatIcon className={`size-4 ${catConfig2.color} shrink-0`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{rule.displayName}</span>
                              {rule.listingCategory && (
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${listingCategoryConfig[rule.listingCategory]?.color || ""}`}>
                                  {rule.listingCategory === "real_estate" ? "RE" : "Cars"}
                                </Badge>
                              )}
                            </div>
                            {rule.description && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[350px]">{rule.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Created at */}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(rule.createdAt || rule._creationTime)}
                      </TableCell>

                      {/* Last modified at */}
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(rule.lastModifiedAt)}
                      </TableCell>

                      {/* Last modified by */}
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground cursor-default">
                                {truncateEmail(rule.lastModifiedBy)}
                              </span>
                            </TooltipTrigger>
                            {rule.lastModifiedBy && rule.lastModifiedBy.length > 20 && (
                              <TooltipContent><p>{rule.lastModifiedBy}</p></TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      {/* Rule action */}
                      <TableCell>
                        <Badge className={`text-xs border-0 ${aConfig2.color}`}>
                          {aConfig2.label}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" onClick={() => setPreviewRule(rule)}>
                                  <Eye className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Preview rule</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditingRule(rule)}>
                                  <Pencil className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Edit rule</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(rule)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Delete rule</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Edit dialog */}
      {editingRule && <RuleEditorDialog rule={editingRule} open={!!editingRule} onClose={() => setEditingRule(null)} />}

      {/* Preview dialog */}
      <RulePreviewDialog rule={previewRule} open={!!previewRule} onClose={() => setPreviewRule(null)} />

      {/* Create dialog */}
      <CreateRuleDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} existingRuleNames={rules.map((r: any) => r.name)} />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.displayName}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
