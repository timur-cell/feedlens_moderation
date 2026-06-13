import { jeImageUrl } from "@/components/JeImage";
import {
  ShieldCheck,
  ShieldAlert,
  Regex,
  Bot,
  Building,
  Loader2,
  Image,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  List,
  Plus,
  Sparkles,
  Wrench,
  Search,
  ChevronLeft,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusChip, PrecisionBar, SectionLabel } from "@/components/ops";
import { rulePrecision, formatAge } from "@/lib/queueFormat";
import { toast } from "sonner";

// ─── Config maps ─────────────────────────────────────────────────

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  simple_code: { label: "Simple Code", icon: ShieldCheck, color: "text-emerald-600" },
  hybrid_vision: { label: "Hybrid Vision", icon: Bot, color: "text-purple-600" },
  auto_ai: { label: "Auto AI", icon: Regex, color: "text-blue-600" },
  former_manual: { label: "Former Manual", icon: ShieldAlert, color: "text-orange-600" },
  internal: { label: "Internal", icon: Building, color: "text-zinc-500" },
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

// ─── Date formatter ──────────────────────────────────────────────

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

function ItemsMatchedByRule({ ruleName, limit = 20 }: { ruleName: string; limit?: number }) {
  const { data: matchedData } = useApiQuery(apiClient.moderation.byRule, {
    ruleName,
    limit,
  });

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
                  <Link key={i} to={`/rules?rule=${encodeURIComponent(m.ruleName)}`} title={`Open rule ${m.ruleName}`}>
                    <Badge variant={m.ruleName === ruleName ? "default" : "outline"} className={`text-[9px] truncate max-w-[65px] cursor-pointer ${m.ruleName === ruleName ? "bg-blue-500 hover:bg-blue-600" : "hover:border-je-teal hover:text-je-teal"}`}>
                      {m.ruleName.split("_").slice(0, 2).join("_")}
                    </Badge>
                  </Link>
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

// ─── Rule detail drawer ─────────────────────────────────────────

function actionKind(action: string): "rejected" | "notice" | "manual" {
  return action === "reject" ? "rejected" : action === "notice" ? "notice" : "manual";
}

function RuleDetailView({
  rule,
  onBack,
  onEdit,
  onDelete,
  onToggle,
}: {
  rule: any;
  onBack: () => void;
  onEdit: (r: any) => void;
  onDelete: (r: any) => void;
  onToggle: (r: any) => void;
}) {
  const [updateRule] = useApiMutation(apiClient.rules.update);

  const setShadow = (shadow: boolean) => {
    updateRule({ id: rule._id, shadow })
      .then(() => toast.success(shadow ? "Moved to shadow" : "Promoted to live"))
      .catch(() => toast.error("Failed to update rule"));
  };

  const precision = rulePrecision(rule);
  const listRefs = [
    ["match", rule.config?.listRef],
    ["+match", rule.config?.additionalListRef],
    ["exclude", rule.config?.excludeListRef],
    ["exclude title", rule.config?.excludeTitleListRef],
    ["watermark", rule.config?.watermarkListRef],
  ].filter(([, v]) => v) as [string, string][];
  const lowPrecision = precision != null && precision < 60 && rule.enabled;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-6 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-[30px] gap-1 rounded-none px-2 text-je-ink-2"
          onClick={onBack}
        >
          <ChevronLeft className="size-4" /> Rules
        </Button>
        <h1 className="text-[18px] font-semibold tracking-tight">{rule.displayName}</h1>
        {rule.shadow && <StatusChip kind="shadow" label="Shadow" />}
        {!rule.shadow && lowPrecision && <StatusChip kind="shadow" label="Shadow candidate" />}
        {!rule.enabled && <StatusChip kind="off" label="Disabled" />}
        <div className="ml-auto flex items-center gap-2">
          <label className="mr-1 flex items-center gap-2 text-[12px] text-je-ink-2">
            <Switch
              checked={rule.enabled}
              onCheckedChange={() => onToggle(rule)}
              className="data-[state=checked]:bg-je-success"
            />
            {rule.enabled ? "Live" : "Off"}
          </label>
          {rule.shadow ? (
            <Button size="sm" className="rounded-none" onClick={() => setShadow(false)}>
              Promote to live
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="rounded-none" onClick={() => setShadow(true)}>
              Move to shadow
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => onEdit(rule)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none text-je-error hover:text-je-error"
            onClick={() => onDelete(rule)}
          >
            Retire…
          </Button>
        </div>
      </div>

      {/* Meta line */}
      <div className="border-b border-border px-6 py-2 text-[12px] text-je-ink-2">
        {(categoryConfig[rule.category]?.label || rule.category)} ·{" "}
        {rule.listingCategory === "cars" ? "cars" : "real estate"} ·{" "}
        {actionConfig[rule.action]?.label?.toLowerCase() || rule.action}s to {rule.tier} tier ·{" "}
        priority {rule.priority}
      </div>

      {/* Body: rule info (left) + matched properties (right) */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(340px,400px)_1fr] lg:divide-x lg:divide-border">
        {/* Left: rule details */}
        <div className="flex flex-col gap-4 overflow-y-auto p-6">
          {rule.description && <p className="text-[13px] text-je-ink-2">{rule.description}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <StatusChip kind={actionKind(rule.action)} label={actionConfig[rule.action]?.label || rule.action} />
            {rule.listingCategory && (
              <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
                {rule.listingCategory === "cars" ? "Cars" : "Real estate"}
              </span>
            )}
            <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
              priority {rule.priority}
            </span>
          </div>

          {/* Condition */}
          <div>
            <SectionLabel className="mb-1.5">Condition</SectionLabel>
            <pre className="max-h-64 overflow-auto bg-je-surface px-2.5 py-2 font-mono text-[11.5px]">
              {JSON.stringify(rule.config, null, 2)}
            </pre>
          </div>

          {/* Performance / precision */}
          <div>
            <SectionLabel className="mb-1.5">Performance</SectionLabel>
            <div className="border border-je-teal-border bg-je-teal-bg px-3 py-2.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="num font-medium">{(rule.matchCount || 0).toLocaleString()} matches</span>
                <PrecisionBar pct={precision} width={64} />
              </div>
              <div className="mt-1.5 text-je-ink-2">
                {precision == null
                  ? "Never matched — nothing to judge yet."
                  : `${rule.falsePositiveCount || 0} overridden by moderators · last match ${rule.lastMatchedAt ? formatAge(rule.lastMatchedAt) + " ago" : "—"}.`}
                {lowPrecision && " Precision below 60% — consider shadow review."}
              </div>
              {rule.shadow && (
                <div className="mt-1.5 border-t border-je-teal-border pt-1.5 text-je-teal">
                  Shadow mode: would have matched{" "}
                  <strong className="num">{(rule.shadowMatchCount || 0).toLocaleString()}</strong> listing
                  {rule.shadowMatchCount === 1 ? "" : "s"} without acting.
                </div>
              )}
            </div>
          </div>

          {/* Linked */}
          {(listRefs.length > 0 || rule.sellerMessage) && (
            <div>
              <SectionLabel className="mb-1.5">Linked</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {listRefs.map(([kind, ref]) => (
                  <span
                    key={kind}
                    className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border bg-background px-1.5 text-[11px]"
                  >
                    <span className="text-je-ink-3">{kind}:</span>
                    <span className="font-mono">{ref}</span>
                  </span>
                ))}
                {rule.sellerMessage && (
                  <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-background px-1.5 text-[11px]">
                    template
                  </span>
                )}
              </div>
              {rule.sellerMessage && (
                <p className="mt-2 bg-je-surface px-2.5 py-1.5 text-[12px] text-je-ink-2">{rule.sellerMessage}</p>
              )}
            </div>
          )}

          {/* History */}
          <div>
            <SectionLabel className="mb-1.5">History</SectionLabel>
            <div className="border-b border-border py-1.5 text-[12px]">
              <div className="text-je-ink-2">{formatDateTime(rule.lastModifiedAt)} · {rule.lastModifiedBy || "system"}</div>
              <div>Last modified</div>
            </div>
            <div className="py-1.5 text-[12px]">
              <div className="text-je-ink-2">{formatDateTime(rule.createdAt || rule._creationTime)}</div>
              <div>Created</div>
            </div>
          </div>
        </div>

        {/* Right: matched properties */}
        <div className="min-h-0 overflow-y-auto p-6">
          <SectionLabel className="mb-1.5">Matched properties</SectionLabel>
          <ItemsMatchedByRule ruleName={rule.name} limit={50} />
        </div>
      </div>
    </div>
  );
}

// ─── Rule Editor Dialog ─────────────────────────────────────────

function RuleEditorDialog({ rule, open, onClose }: { rule: any; open: boolean; onClose: () => void }) {
  const [updateRule] = useApiMutation(apiClient.rules.update);
  const { user: currentUser } = useAuth();
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
  const [createRule] = useApiMutation(apiClient.rules.create);
  const [suggestRule] = useApiMutation(apiClient.rules.suggest);
  const { user: currentUser } = useAuth();
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

// ─── Toolbar facet ──────────────────────────────────────────────

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

// ─── Main Page: analytics table + drawer ────────────────────────

export default function RulesPage() {
  const { data: rules } = useApiQuery(apiClient.rules.list);
  const [toggleEnabled] = useApiMutation(apiClient.rules.toggle);
  const [removeRule] = useApiMutation(apiClient.rules.remove);

  const [editingRule, setEditingRule] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("matches");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  // A rule is opened full-screen via ?rule=<name>. We also honour the older
  // ?highlight=<name> deep-links (Lists/Dashboard) so they open the same view.
  const selectedRuleName = searchParams.get("rule") || searchParams.get("highlight");

  const filtered = useMemo(() => {
    if (!rules) return [];
    let arr = rules.filter((r: any) => {
      const catMatch = categoryFilter === "all" || r.category === categoryFilter;
      const scopeMatch = scopeFilter === "all" || r.listingCategory === scopeFilter;
      const actionMatch = actionFilter === "all" || r.action === actionFilter;
      const statusMatch =
        statusFilter === "all"
          ? true
          : statusFilter === "shadow"
            ? r.shadow
            : statusFilter === "live"
              ? r.enabled && !r.shadow
              : !r.enabled;
      const q = searchQuery.toLowerCase();
      const searchMatch =
        !q ||
        r.displayName.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q);
      return catMatch && scopeMatch && actionMatch && statusMatch && searchMatch;
    });
    arr = arr.slice().sort((a: any, b: any) => {
      if (sort === "matches") return (b.matchCount || 0) - (a.matchCount || 0);
      if (sort === "precision") return (rulePrecision(a) ?? 101) - (rulePrecision(b) ?? 101);
      if (sort === "name") return a.displayName.localeCompare(b.displayName);
      return a.priority - b.priority;
    });
    return arr;
  }, [rules, categoryFilter, scopeFilter, actionFilter, statusFilter, sort, searchQuery]);

  if (!rules) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="size-7 animate-spin text-je-ink-3" />
      </div>
    );
  }

  const enabledCount = rules.filter((r: any) => r.enabled).length;
  const offCount = rules.length - enabledCount;
  const selectedRule = selectedRuleName
    ? rules.find((r: any) => r.name === selectedRuleName) ?? null
    : null;

  const handleToggle = (rule: any) => {
    toggleEnabled({ id: rule._id }).catch(() => toast.error(`Failed to toggle "${rule.displayName}"`));
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await removeRule({ id: deleteConfirm._id });
      toast.success(`Rule "${deleteConfirm.displayName}" deleted`);
      setDeleteConfirm(null);
      setSearchParams({});
    } catch {
      toast.error("Failed to delete rule");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedRule ? (
        <RuleDetailView
          rule={selectedRule}
          onBack={() => setSearchParams({})}
          onEdit={(r) => setEditingRule(r)}
          onDelete={(r) => setDeleteConfirm(r)}
          onToggle={handleToggle}
        />
      ) : (
        <>
      {/* Topbar */}
      <div className="flex items-center gap-3.5 border-b border-border px-6 py-3.5">
        <h1 className="text-[18px] font-semibold tracking-tight">Rules</h1>
        <span className="text-[12px] text-je-ink-2">
          {enabledCount} live · {offCount} off
        </span>
        <Button size="sm" className="ml-auto h-[30px] gap-1.5 rounded-none" onClick={() => setShowCreateDialog(true)}>
          <Plus className="size-3.5" /> New rule
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex h-[30px] min-w-[220px] items-center gap-2 border border-border px-2.5">
          <Search className="size-3.5 text-je-ink-3" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, behavior, list…"
            className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-je-ink-3"
          />
        </div>
        <Facet
          label="Scope"
          value={scopeFilter}
          active={scopeFilter !== "all"}
          options={[
            { value: "all", label: "All types" },
            { value: "real_estate", label: "Real estate" },
            { value: "cars", label: "Cars" },
          ]}
          onChange={setScopeFilter}
        />
        <Facet
          label="Type"
          value={categoryFilter}
          active={categoryFilter !== "all"}
          options={[
            { value: "all", label: "Any" },
            ...Object.entries(categoryConfig).map(([k, c]) => ({ value: k, label: c.label })),
          ]}
          onChange={setCategoryFilter}
        />
        <Facet
          label="Action"
          value={actionFilter}
          active={actionFilter !== "all"}
          options={[
            { value: "all", label: "Any" },
            { value: "reject", label: "Reject" },
            { value: "notice", label: "Notice" },
            { value: "flag", label: "Flag" },
          ]}
          onChange={setActionFilter}
        />
        <Facet
          label="Status"
          value={statusFilter}
          active={statusFilter !== "all"}
          options={[
            { value: "all", label: "All" },
            { value: "live", label: "Live" },
            { value: "shadow", label: "Shadow" },
            { value: "off", label: "Disabled" },
          ]}
          onChange={setStatusFilter}
        />
        <Facet
          label="Sort"
          value={sort}
          options={[
            { value: "matches", label: "Matches 7d" },
            { value: "precision", label: "Precision" },
            { value: "name", label: "Name" },
            { value: "priority", label: "Priority" },
          ]}
          onChange={setSort}
        />
        <span className="ml-auto text-[12px] text-je-ink-3">{filtered.length} shown</span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto px-6">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-je-ink text-[10px] uppercase tracking-[0.09em] text-je-ink-2">
              <th className="w-[44px] py-2 pr-3 text-left font-semibold" />
              <th className="py-2 pr-3 text-left font-semibold">Rule</th>
              <th className="w-[90px] py-2 pr-3 text-left font-semibold">Scope</th>
              <th className="w-[90px] py-2 pr-3 text-left font-semibold">Action</th>
              <th className="w-[80px] py-2 pr-3 text-right font-semibold">Matches</th>
              <th className="w-[120px] py-2 pr-3 text-left font-semibold">Precision</th>
              <th className="w-[100px] py-2 pr-3 text-left font-semibold">Last match</th>
              <th className="w-[140px] py-2 text-left font-semibold">Modified by</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-je-ink-2">
                  No rules match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((rule: any) => {
                const precision = rulePrecision(rule);
                const lowPrecision = precision != null && precision < 60 && rule.enabled;
                return (
                  <tr
                    key={rule._id}
                    onClick={() => setSearchParams({ rule: rule.name })}
                    className={`cursor-pointer border-b border-border align-middle hover:bg-je-surface ${
                      !rule.enabled ? "opacity-60" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule)}
                        className="data-[state=checked]:bg-je-success"
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.displayName}</span>
                        {rule.shadow && <StatusChip kind="shadow" label="Shadow" />}
                        {!rule.shadow && lowPrecision && <StatusChip kind="shadow" label="Shadow?" />}
                      </div>
                      {rule.description && (
                        <div className="max-w-[420px] truncate text-[11.5px] text-je-ink-2">{rule.description}</div>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex h-5 items-center rounded-[4px] border border-border bg-je-surface px-1.5 text-[10px] text-je-ink-2">
                        {rule.listingCategory === "cars" ? "Cars" : "RE"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusChip kind={actionKind(rule.action)} label={actionConfig[rule.action]?.label || rule.action} />
                    </td>
                    <td className="num py-2.5 pr-3 text-right font-semibold">{rule.matchCount || 0}</td>
                    <td className="py-2.5 pr-3">
                      <PrecisionBar pct={precision} width={48} />
                    </td>
                    <td className="py-2.5 pr-3 text-je-ink-2">
                      {rule.lastMatchedAt ? `${formatAge(rule.lastMatchedAt)} ago` : "—"}
                    </td>
                    <td className="py-2.5 text-je-ink-2">{truncateEmail(rule.lastModifiedBy)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Edit dialog */}
      {editingRule && <RuleEditorDialog rule={editingRule} open={!!editingRule} onClose={() => setEditingRule(null)} />}

      {/* Create dialog */}
      <CreateRuleDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        existingRuleNames={rules.map((r: any) => r.name)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Retire rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteConfirm?.displayName}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
