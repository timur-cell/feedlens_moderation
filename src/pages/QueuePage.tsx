import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  RefreshCw,
  Keyboard,
  Maximize2,
  Copy,
  ExternalLink,
  StickyNote,
  History as HistoryIcon,
  Inbox,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Ban,
  MessageSquare,
  SkipForward,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { jeImageUrl } from "@/components/JeImage";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { useQueueKeyboard } from "@/hooks/useQueueKeyboard";
import {
  AgeChip,
  Kbd,
  OpsThumb,
  RuleChip,
  SectionLabel,
  StatusChip,
} from "@/components/ops";
import {
  actionLabel,
  formatLocation,
  formatLocationOffice,
  formatPrice,
} from "@/lib/queueFormat";
import { REFUSE_REASON_TYPES } from "@/lib/refuseReasons";
import { WhyFlagged, ListingFacts, evidenceFromResult } from "@/components/queue/EvidencePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModerationNotes } from "@/components/queue/ModerationNotes";

type Listing = any;
type Result = any;

// Override-feedback loop: every human override records *why* it disagreed with
// automation. These roll up (server-side) into per-rule precision.
const OVERRIDE_REASONS = [
  { value: "false_positive", label: "False positive" },
  { value: "policy_changed", label: "Policy changed" },
  { value: "edge_case", label: "Edge case" },
  { value: "other", label: "Other" },
];

const DENSITY_KEY = "feedlens.queue.density";

/* ─── Toolbar facet (label · value ▾) ───────────────────────────── */
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


/* ─── Media strip ───────────────────────────────────────────────── */
function MediaStrip({ images, onFocus }: { images: string[]; onFocus: () => void }) {
  const shown = images.slice(0, 8);
  const remaining = images.length - shown.length;
  return (
    <div>
      <SectionLabel className="mb-1.5">
        Media · {images.length} image{images.length === 1 ? "" : "s"}
        <span className="ml-1 font-normal normal-case tracking-normal text-je-ink-3">
          · open focus mode <Kbd>F</Kbd>
        </span>
      </SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((url, i) => (
          <button type="button" key={i} onClick={onFocus} title="Open focus mode">
            <OpsThumb src={jeImageUrl(url)} width={76} height={57} />
          </button>
        ))}
        {remaining > 0 && (
          <button
            type="button"
            onClick={onFocus}
            className="flex h-[57px] w-[76px] items-center justify-center border border-border bg-je-surface text-[12px] text-je-ink-2"
          >
            +{remaining}
          </button>
        )}
        {images.length === 0 && (
          <div className="flex h-[57px] w-full items-center justify-center border border-dashed border-border text-[12px] text-je-ink-3">
            No images
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Decision bar ──────────────────────────────────────────────── */
function DecisionBar({
  templates,
  templateId,
  onTemplate,
  reasonType,
  onReason,
  onDecide,
  onSkip,
  busy,
  compact,
}: {
  templates: any[];
  templateId: string;
  onTemplate: (v: string) => void;
  reasonType: string;
  onReason: (v: string) => void;
  onDecide: (o: "approved" | "rejected" | "notice", opts?: { permanent?: boolean }) => void;
  onSkip: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const templateOptions = [
    { value: "none", label: "No template" },
    ...templates.map((t) => ({ value: t._id, label: t.displayName || t.name })),
  ];
  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 border-t-2 border-t-je-ink bg-background ${compact ? "px-5 py-2.5" : "px-6 py-3"}`}
    >
      <Button
        className="h-[38px] gap-2 rounded-none bg-je-success px-5 text-background hover:bg-je-success/90"
        disabled={busy}
        onClick={() => onDecide("approved")}
      >
        <Check className="size-4" /> Approve <Kbd className="border-white/40 bg-transparent text-white/90">A</Kbd>
      </Button>
      <Button
        variant="outline"
        className="h-[38px] gap-2 rounded-none border-je-success px-4 text-je-success hover:bg-je-success-bg"
        disabled={busy}
        title="Approve and lock — feed re-imports and automated re-moderation will never change this decision until a moderator unlocks it"
        onClick={() => onDecide("approved", { permanent: true })}
      >
        <Lock className="size-3.5" /> Approve forever <Kbd>⇧A</Kbd>
      </Button>
      <Button
        className="h-[38px] gap-2 rounded-none bg-je-error px-5 text-white hover:bg-je-error/90"
        disabled={busy}
        onClick={() => onDecide("rejected")}
      >
        <Ban className="size-4" /> Reject <Kbd className="border-white/40 bg-transparent text-white/90">R</Kbd>
      </Button>
      <Button
        variant="outline"
        className="h-[38px] gap-2 rounded-none border-je-warning-raw px-5 text-je-warning hover:bg-je-warning-bg"
        disabled={busy}
        onClick={() => onDecide("notice")}
      >
        <MessageSquare className="size-4" /> Notice <Kbd>N</Kbd>
      </Button>
      <Button
        variant="ghost"
        className="h-[38px] gap-2 rounded-none px-4 text-je-ink-2"
        disabled={busy}
        onClick={onSkip}
      >
        <SkipForward className="size-4" /> Skip <Kbd>S</Kbd>
      </Button>

      <div className="flex items-center gap-2">
        <Select value={templateId} onValueChange={onTemplate}>
          <SelectTrigger size="sm" className="h-[30px]! w-auto gap-1.5 rounded-none border-border px-2.5 text-[12px]">
            <span className="text-je-ink-2">Template</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {templateOptions.map((o) => (
              <SelectItem key={o.value} value={o.value} className="rounded-none text-[12px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={reasonType} onValueChange={onReason}>
          <SelectTrigger size="sm" className="h-[30px]! w-auto gap-1.5 rounded-none border-border px-2.5 text-[12px]">
            <span className="text-je-ink-2">Reason</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            {OVERRIDE_REASONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="rounded-none text-[12px]">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {busy && <Loader2 className="size-4 animate-spin text-je-ink-2" />}
    </div>
  );
}

/* ─── Focus mode overlay ────────────────────────────────────────── */
function FocusMode({
  listing,
  result,
  scan,
  index,
  total,
  imgIdx,
  setImgIdx,
  zoom,
  setZoom,
  onExit,
  decisionBar,
}: {
  listing: Listing;
  result?: Result;
  scan?: any;
  index: number;
  total: number;
  imgIdx: number;
  setImgIdx: (n: number) => void;
  zoom: boolean;
  setZoom: (b: boolean) => void;
  onExit: () => void;
  decisionBar: React.ReactNode;
}) {
  const images: string[] = listing.imageUrls || [];
  const hero = images[imgIdx];
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* top strip */}
      <div className="flex items-center gap-3.5 border-b border-border px-5 py-2.5">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-none" onClick={onExit}>
          ‹ Exit focus <Kbd>Esc</Kbd>
        </Button>
        <span className="text-[13px] font-semibold">{listing.title}</span>
        <span className="num text-[13px] font-medium">{formatPrice(listing)}</span>
        <span className="text-[12px] text-je-ink-2">
          {formatLocation(listing)} · JE <span className="font-mono">{listing.jeId}</span>
        </span>
        <AgeChip sinceMs={listing.importedAt} />
        <span className="num ml-auto text-[12px] text-je-ink-2">
          {index + 1} of {total}
        </span>
        <span className="inline-block h-[3px] w-[120px] bg-je-surface">
          <span className="block h-full bg-je-teal" style={{ width: `${progress}%` }} />
        </span>
        <span className="text-[12px] text-je-ink-2">
          <Kbd>J</Kbd> next · <Kbd>K</Kbd> prev
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px]">
        {/* gallery */}
        <div className="flex min-w-0 flex-col gap-2 p-4">
          <div
            className="relative min-h-0 flex-1 cursor-zoom-in overflow-hidden border border-border bg-je-surface-warm"
            onClick={() => setZoom(!zoom)}
          >
            {hero ? (
              <img src={jeImageUrl(hero)} alt={listing.title} className="size-full object-contain" />
            ) : (
              <div className="flex size-full items-center justify-center text-je-ink-3">No images</div>
            )}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 p-1.5 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgIdx((imgIdx - 1 + images.length) % images.length);
                  }}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 p-1.5 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setImgIdx((imgIdx + 1) % images.length);
                  }}
                >
                  <ChevronRight className="size-5" />
                </button>
                <span className="num absolute bottom-2 right-2 bg-black/60 px-2 py-0.5 text-[11px] text-white">
                  {imgIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {images.slice(0, 12).map((url, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setImgIdx(i)}
                className={`shrink-0 border-2 ${i === imgIdx ? "border-je-teal" : "border-transparent"}`}
              >
                <OpsThumb src={jeImageUrl(url)} width={72} height={54} />
              </button>
            ))}
          </div>
          <div className="flex gap-4 text-[11.5px] text-je-ink-3">
            <span>
              <Kbd>←</Kbd> <Kbd>→</Kbd> browse images
            </span>
            <span>
              <Kbd>Z</Kbd> zoom
            </span>
            {listing.imageCount != null && <span>{listing.imageCount} images</span>}
          </div>
        </div>

        {/* evidence rail */}
        <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto border-l border-border p-4">
          <div>
            <SectionLabel className="mb-1.5">Why flagged</SectionLabel>
            <WhyFlagged {...evidenceFromResult(result)} scan={scan} dense />
          </div>
          <div>
            <SectionLabel className="mb-1.5">Facts</SectionLabel>
            <ListingFacts listing={listing} />
          </div>
        </div>
      </div>

      {decisionBar}
    </div>
  );
}

/* ─── Shortcuts dialog ──────────────────────────────────────────── */
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const rows: [string, string][] = [
    ["J / ↓", "Next listing"],
    ["K / ↑", "Previous listing"],
    ["A", "Approve"],
    ["⇧A", "Approve forever (lock)"],
    ["R", "Reject"],
    ["N", "Notice"],
    ["S", "Skip"],
    ["F", "Open focus mode"],
    ["← / →", "Browse images (focus mode)"],
    ["Z", "Zoom image (focus mode)"],
    ["Esc", "Exit focus mode"],
    ["⌘K", "Inspect / jump"],
    ["?", "This sheet"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-y-1.5">
          {rows.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between border-b border-border py-1 text-[13px]">
              <span className="text-je-ink-2">{label}</span>
              <Kbd>{k}</Kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function QueuePage() {
  const { data: pendingData, error, refetch } = useApiQuery(apiClient.listings.pending, undefined, {
    pollMs: 10000,
  });
  const { data: recentResults } = useApiQuery(apiClient.moderation.recent, { limit: 300 });
  const { data: templates } = useApiQuery(apiClient.messages.list);
  const { data: scans } = useApiQuery(apiClient.paramScans.recent, { limit: 300 });
  const [override] = useApiMutation(apiClient.moderation.override);

  const resultByListing = useMemo(() => {
    const m = new Map<string, Result>();
    for (const r of recentResults || []) {
      // recent is processedAt desc → first seen per listing is the latest
      if (!m.has(r.listingId)) m.set(r.listingId, r);
    }
    return m;
  }, [recentResults]);
  const scanMap = useMemo(
    () => new Map((scans || []).map((s: any) => [s.listingId, s])),
    [scans],
  );

  // Working queue (polling guard — never reflow on a background refetch).
  const [queue, setQueue] = useState<Listing[] | null>(null);
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [grouping, setGrouping] = useState<"list" | "byRule">("list");
  const [density, setDensity] = useState<"comfortable" | "compact">(
    () => (localStorage.getItem(DENSITY_KEY) as "comfortable" | "compact") || "comfortable",
  );
  const [sort, setSort] = useState("oldest");
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("any");
  const [ruleFilter, setRuleFilter] = useState("any");

  const [focusMode, setFocusMode] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const [templateId, setTemplateId] = useState("none");
  const [reasonType, setReasonType] = useState("other");
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState<Set<string>>(new Set());

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  // Seed the working queue from the first successful load.
  useEffect(() => {
    if (pendingData && queue === null) {
      setQueue(pendingData);
      setSelectedId((prev) => prev ?? pendingData[0]?._id ?? null);
    }
  }, [pendingData, queue]);

  // Prefer the recent-feed result, but fall back to the result embedded in the
  // pending payload (`latestResult`). Manual items older than the recent-300
  // window aren't in resultByListing, and without this fallback their decisions
  // silently no-op ("No moderation result for this listing yet").
  const resultFor = useCallback(
    (l: Listing | undefined): Result | undefined =>
      l ? (resultByListing.get(l._id) ?? (l as Listing & { latestResult?: Result }).latestResult ?? undefined) : undefined,
    [resultByListing],
  );
  const topRule = useCallback(
    (l: Listing) => resultFor(l)?.ruleMatches?.[0]?.ruleName ?? null,
    [resultFor],
  );

  const live = useMemo(() => (queue || []).filter((l) => !decided.has(l._id)), [queue, decided]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of live) if (l.country) set.add(l.country);
    return [{ value: "any", label: "Any country" }, ...[...set].sort().map((c) => ({ value: c, label: c }))];
  }, [live]);
  const ruleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of live) {
      const r = topRule(l);
      if (r) set.add(r);
    }
    return [{ value: "any", label: "Any rule" }, ...[...set].sort().map((r) => ({ value: r, label: r }))];
  }, [live, topRule]);

  const display = useMemo(() => {
    let arr = live.slice();
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (l) =>
          l.title?.toLowerCase().includes(q) ||
          l.jeId?.toLowerCase().includes(q) ||
          l.office?.toLowerCase().includes(q) ||
          l.officeGroupName?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          (topRule(l) || "").toLowerCase().includes(q),
      );
    }
    if (countryFilter !== "any") arr = arr.filter((l) => l.country === countryFilter);
    if (ruleFilter !== "any") arr = arr.filter((l) => topRule(l) === ruleFilter);
    arr.sort((a, b) => {
      if (sort === "newest") return (b.importedAt || 0) - (a.importedAt || 0);
      if (sort === "price") return (b.priceUsd || b.price || 0) - (a.priceUsd || a.price || 0);
      return (a.importedAt || 0) - (b.importedAt || 0); // oldest first (default)
    });
    return arr;
  }, [live, search, countryFilter, ruleFilter, sort, topRule]);

  // Keep selection valid.
  useEffect(() => {
    if (display.length === 0) return;
    if (!selectedId || !display.some((l) => l._id === selectedId)) {
      setSelectedId(display[0]._id);
    }
  }, [display, selectedId]);

  const selectedIndex = display.findIndex((l) => l._id === selectedId);
  const selected = selectedIndex >= 0 ? display[selectedIndex] : undefined;
  const selectedResult = resultFor(selected);

  useEffect(() => {
    setImgIdx(0);
    setZoom(false);
    setShowNotes(false);
  }, [selectedId]);

  // Buffered new arrivals (surface, don't reflow).
  const queueIds = useMemo(() => new Set((queue || []).map((l) => l._id)), [queue]);
  const buffered = useMemo(
    () => (pendingData || []).filter((l: Listing) => !queueIds.has(l._id) && !decided.has(l._id)),
    [pendingData, queueIds, decided],
  );

  const applyRefresh = useCallback(() => {
    if (!pendingData) return;
    setQueue(pendingData.filter((l: Listing) => !decided.has(l._id)));
    void refetch();
  }, [pendingData, decided, refetch]);

  const selectByOffset = useCallback(
    (delta: number) => {
      if (display.length === 0) return;
      const i = display.findIndex((l) => l._id === selectedId);
      const next = Math.max(0, Math.min(display.length - 1, (i < 0 ? 0 : i) + delta));
      setSelectedId(display[next]._id);
    },
    [display, selectedId],
  );

  const undoDecision = useCallback(
    async (listing: Listing, result: Result) => {
      try {
        await override({ resultId: result._id, newOutcome: "manual" });
        setDecided((prev) => {
          const n = new Set(prev);
          n.delete(listing._id);
          return n;
        });
        setSelectedId(listing._id);
        toast.success("Reverted to queue");
      } catch {
        toast.error("Undo failed");
      }
    },
    [override],
  );

  const decide = useCallback(
    async (
      outcome: "approved" | "rejected" | "notice",
      opts?: { permanent?: boolean; listing?: Listing },
    ) => {
      const listing = opts?.listing || selected;
      if (!listing) return;
      const result = resultFor(listing);
      if (!result?._id) {
        toast.error("No moderation result for this listing yet");
        return;
      }

      // Advance selection *before* the optimistic removal so place is kept.
      const idx = display.findIndex((l) => l._id === listing._id);
      const nextListing = display[idx + 1] || display[idx - 1] || null;

      // Build seller message for reject / notice.
      let sellerMessage: string | undefined;
      let refuse: string | undefined;
      if (outcome === "rejected" || outcome === "notice") {
        const tpl = (templates || []).find((t: any) => t._id === templateId);
        const matchMsg = result.ruleMatches?.find((m: any) => m.message)?.message;
        sellerMessage =
          tpl?.body ||
          matchMsg ||
          REFUSE_REASON_TYPES.find((r) => r.value === (outcome === "rejected" ? "other" : "other"))?.defaultMessage;
        if (outcome === "rejected") refuse = "other";
      }

      setBusy(true);
      setDecided((prev) => new Set(prev).add(listing._id));
      setSelectedId(nextListing?._id ?? null);
      const permanent = opts?.permanent ?? false;
      try {
        await override({
          resultId: result._id,
          newOutcome: outcome,
          reason: reasonType !== "other" ? reasonType : undefined,
          sellerMessage,
          refuseReasonType: refuse,
          permanent: permanent || undefined,
        });
        const verb = outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : "noticed";
        toast(`${listing.title} — ${verb}${permanent ? " · locked" : ""}`, {
          duration: 8000,
          action: { label: "Undo", onClick: () => undoDecision(listing, result) },
        });
      } catch (e) {
        setDecided((prev) => {
          const n = new Set(prev);
          n.delete(listing._id);
          return n;
        });
        setSelectedId(listing._id);
        toast.error("Decision failed: " + (e instanceof Error ? e.message : "unknown"));
      } finally {
        setBusy(false);
      }
    },
    [selected, resultFor, display, templates, templateId, reasonType, override, undoDecision],
  );

  const skip = useCallback(() => selectByOffset(1), [selectByOffset]);

  // Bulk decide (By rule grouping).
  const bulkDecide = useCallback(
    async (outcome: "approved" | "rejected" | "notice") => {
      const ids = [...bulk];
      if (ids.length === 0) return;
      setBusy(true);
      let ok = 0;
      for (const id of ids) {
        const listing = live.find((l) => l._id === id);
        const result = resultFor(listing);
        if (!result?._id) continue;
        try {
          const tpl = (templates || []).find((t: any) => t._id === templateId);
          await override({
            resultId: result._id,
            newOutcome: outcome,
            reason: reasonType !== "other" ? reasonType : undefined,
            sellerMessage: outcome !== "approved" ? tpl?.body : undefined,
            refuseReasonType: outcome === "rejected" ? "other" : undefined,
          });
          setDecided((prev) => new Set(prev).add(id));
          ok += 1;
        } catch {
          /* keep going */
        }
      }
      setBulk(new Set());
      setBusy(false);
      toast.success(`${ok} listing${ok === 1 ? "" : "s"} ${outcome}`);
    },
    [bulk, live, resultFor, templates, templateId, reasonType, override],
  );

  // Keyboard map.
  useQueueKeyboard(
    {
      next: () => selectByOffset(1),
      prev: () => selectByOffset(-1),
      approve: () => decide("approved"),
      approveForever: () => decide("approved", { permanent: true }),
      reject: () => decide("rejected"),
      notice: () => decide("notice"),
      skip,
      focus: () => selected && setFocusMode(true),
      escape: () => setFocusMode(false),
      help: () => setShortcutsOpen(true),
      prevImage: () => {
        if (focusMode && selected?.imageUrls?.length) {
          setImgIdx((i) => (i - 1 + selected.imageUrls.length) % selected.imageUrls.length);
        }
      },
      nextImage: () => {
        if (focusMode && selected?.imageUrls?.length) {
          setImgIdx((i) => (i + 1) % selected.imageUrls.length);
        }
      },
      zoom: () => focusMode && setZoom((z) => !z),
    },
    !shortcutsOpen,
  );

  const decisionBar = (
    <DecisionBar
      templates={templates || []}
      templateId={templateId}
      onTemplate={setTemplateId}
      reasonType={reasonType}
      onReason={setReasonType}
      onDecide={(o, opts) => decide(o, opts)}
      onSkip={skip}
      busy={busy}
      compact={focusMode}
    />
  );

  // ── Render states ──
  if (error && !queue) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm text-je-ink-2">Failed to load the queue: {error.message}</p>
        <Button variant="outline" size="sm" className="rounded-none" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (queue === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="size-7 animate-spin text-je-ink-3" />
      </div>
    );
  }

  const rowPadY = density === "compact" ? "py-[7px]" : "py-2.5";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Topbar */}
      <div className="flex items-center gap-3.5 border-b border-border px-6 py-3.5">
        <h1 className="text-[18px] font-semibold tracking-tight">Queue</h1>
        <span className="text-[12px] text-je-ink-2">
          {live.length} awaiting{display.length !== live.length ? ` · ${display.length} shown` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-[30px] items-center border border-border text-[12px]">
            <button
              type="button"
              className={`flex h-full items-center px-3 ${grouping === "list" ? "bg-je-ink font-medium text-background" : "text-je-ink-2"}`}
              onClick={() => setGrouping("list")}
            >
              List
            </button>
            <button
              type="button"
              className={`flex h-full items-center border-l border-border px-3 ${grouping === "byRule" ? "bg-je-ink font-medium text-background" : "text-je-ink-2"}`}
              onClick={() => setGrouping("byRule")}
            >
              By rule
            </button>
          </div>
          <Select value={density} onValueChange={(v) => setDensity(v as any)}>
            <SelectTrigger size="sm" className="h-[30px]! w-auto gap-1.5 rounded-none border-border px-2.5 text-[12px]">
              <span className="text-je-ink-2">Density</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="comfortable" className="rounded-none text-[12px]">
                Comfortable
              </SelectItem>
              <SelectItem value="compact" className="rounded-none text-[12px]">
                Compact
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-[30px] gap-1.5 rounded-none"
            onClick={() => setShortcutsOpen(true)}
          >
            <Keyboard className="size-3.5" /> Shortcuts <Kbd>?</Kbd>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex h-[30px] min-w-[220px] flex-1 items-center gap-2 border border-border px-2.5 sm:flex-none">
          <Search className="size-3.5 text-je-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, JE ID, office…"
            className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-je-ink-3"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="text-je-ink-3">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Facet
          label="Rule"
          value={ruleFilter}
          active={ruleFilter !== "any"}
          options={ruleOptions}
          onChange={setRuleFilter}
        />
        <Facet
          label="Country"
          value={countryFilter}
          active={countryFilter !== "any"}
          options={countryOptions}
          onChange={setCountryFilter}
        />
        <Facet
          label="Sort"
          value={sort}
          options={[
            { value: "oldest", label: "Oldest first" },
            { value: "newest", label: "Newest first" },
            { value: "price", label: "Highest price" },
          ]}
          onChange={setSort}
        />
        <div className="ml-auto text-[12px] text-je-ink-2">
          {buffered.length > 0 ? (
            <button type="button" className="inline-flex items-center gap-1.5" onClick={applyRefresh}>
              {buffered.length} new since you opened ·{" "}
              <span className="inline-flex items-center gap-1 font-medium text-je-teal">
                <RefreshCw className="size-3" /> refresh
              </span>
            </button>
          ) : (
            <button type="button" className="inline-flex items-center gap-1 text-je-ink-3" onClick={applyRefresh}>
              <RefreshCw className="size-3" /> up to date
            </button>
          )}
        </div>
      </div>

      {/* Split */}
      {display.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-16 text-center">
          <Inbox className="size-10 text-je-ink-3" />
          <p className="text-[15px] font-medium">{live.length === 0 ? "Queue is empty" : "No matches"}</p>
          <p className="text-[13px] text-je-ink-2">
            {live.length === 0 ? "All listings have been reviewed. Nice work." : "Adjust the filters above."}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[400px_1fr] lg:grid-rows-1">
          {/* List pane — stacked above the detail (capped height) on narrow screens,
              fixed-width side rail on lg+. (Was hidden below lg, leaving the queue
              un-navigable on laptops/tablets.) */}
          <div className="min-h-0 max-h-[45vh] overflow-y-auto border-b border-border lg:max-h-none lg:border-b-0 lg:border-r lg:border-border">
            {grouping === "byRule" && bulk.size > 0 && (
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-je-ink bg-je-teal-bg px-3 py-2 text-[12px]">
                <span className="font-medium">{bulk.size} selected</span>
                <Button size="sm" className="ml-auto h-7 rounded-none bg-je-success px-2.5 text-background" disabled={busy} onClick={() => bulkDecide("approved")}>
                  Approve all
                </Button>
                <Button size="sm" className="h-7 rounded-none bg-je-error px-2.5 text-white" disabled={busy} onClick={() => bulkDecide("rejected")}>
                  Reject all
                </Button>
                <button type="button" aria-label="Clear selection" className="text-je-ink-3" onClick={() => setBulk(new Set())}>
                  <X className="size-4" />
                </button>
              </div>
            )}
            <QueueList
              display={display}
              grouping={grouping}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpenFocus={() => setFocusMode(true)}
              topRule={topRule}
              now={now}
              rowPadY={rowPadY}
              bulk={bulk}
              setBulk={setBulk}
            />
          </div>

          {/* Detail pane */}
          <div className="flex min-h-0 flex-col">
            {selected ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5">
                  {/* header */}
                  <div className="flex items-start gap-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[17px] font-semibold">{selected.title}</span>
                        <span className="num text-[15px] font-medium">{formatPrice(selected)}</span>
                        <AgeChip sinceMs={selected.importedAt} prefix="in queue" now={now} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-je-ink-2">
                        <span>{formatLocation(selected) || "—"}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          JE <span className="font-mono">{selected.jeId}</span>
                          <button
                            type="button"
                            title="Copy JE ID"
                            aria-label="Copy JE ID"
                            className="text-je-ink-3 hover:text-je-ink"
                            onClick={() => {
                              navigator.clipboard?.writeText(selected.jeId);
                              toast.success("JE ID copied");
                            }}
                          >
                            <Copy className="size-3" />
                          </button>
                        </span>
                        <span>·</span>
                        <a
                          href={`https://www.jamesedition.com/admin/listings/${selected.jeId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-je-teal hover:underline"
                        >
                          Admin ↗
                        </a>
                        {selected.listingUrl && (
                          <a
                            href={selected.listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-je-teal hover:underline"
                          >
                            <ExternalLink className="size-3" /> Live ↗
                          </a>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-7 gap-1.5 rounded-none ${showNotes ? "border-je-teal text-je-teal" : ""}`}
                      onClick={() => setShowNotes((v) => !v)}
                    >
                      <StickyNote className="size-3.5" /> Notes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 rounded-none"
                      onClick={() => setFocusMode(true)}
                    >
                      <Maximize2 className="size-3.5" /> Focus <Kbd>F</Kbd>
                    </Button>
                  </div>

                  {/* why flagged */}
                  <SectionLabel className="mb-1.5 mt-4">Why flagged</SectionLabel>
                  <WhyFlagged {...evidenceFromResult(selectedResult)} scan={scanMap.get(selected._id)} />

                  {/* notes */}
                  {showNotes && (
                    <div className="mt-3">
                      <ModerationNotes listingId={selected._id} />
                    </div>
                  )}

                  {/* facts */}
                  <SectionLabel className="mb-1.5 mt-4">Listing facts</SectionLabel>
                  <ListingFacts listing={selected} />

                  {/* media */}
                  <div className="mb-5 mt-4">
                    <MediaStrip images={selected.imageUrls || []} onFocus={() => setFocusMode(true)} />
                  </div>
                </div>

                {decisionBar}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-je-ink-3">Select a listing</div>
            )}
          </div>
        </div>
      )}

      {focusMode && selected && (
        <FocusMode
          listing={selected}
          result={selectedResult}
          scan={scanMap.get(selected._id)}
          index={selectedIndex}
          total={display.length}
          imgIdx={imgIdx}
          setImgIdx={setImgIdx}
          zoom={zoom}
          setZoom={setZoom}
          onExit={() => setFocusMode(false)}
          decisionBar={decisionBar}
        />
      )}

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}

/* ─── List pane rows (incl. By-rule grouping) ───────────────────── */
function QueueList({
  display,
  grouping,
  selectedId,
  onSelect,
  onOpenFocus,
  topRule,
  now,
  rowPadY,
  bulk,
  setBulk,
}: {
  display: Listing[];
  grouping: "list" | "byRule";
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenFocus: () => void;
  topRule: (l: Listing) => string | null;
  now: number;
  rowPadY: string;
  bulk: Set<string>;
  setBulk: (s: Set<string>) => void;
}) {
  const Row = ({ l }: { l: Listing }) => {
    const sel = l._id === selectedId;
    const rule = topRule(l);
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(l._id)}
        onDoubleClick={onOpenFocus}
        className={`flex items-center gap-2.5 border-b border-border px-3.5 pl-4 ${rowPadY} ${
          sel ? "bg-je-teal-bg shadow-[inset_2px_0_0_var(--je-teal)]" : "hover:bg-je-surface"
        }`}
      >
        {grouping === "byRule" && (
          <Checkbox
            checked={bulk.has(l._id)}
            onCheckedChange={(c) => {
              const n = new Set(bulk);
              if (c) n.add(l._id);
              else n.delete(l._id);
              setBulk(n);
            }}
            onClick={(e) => e.stopPropagation()}
            className="rounded-none"
          />
        )}
        <OpsThumb src={jeImageUrl((l.imageUrls || [])[0])} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium">{l.title}</span>
            <span className="num shrink-0 text-[12.5px] font-medium">{formatPrice(l)}</span>
          </div>
          <div className="mb-1 mt-0.5 truncate text-[11.5px] text-je-ink-2">{formatLocationOffice(l)}</div>
          <div className="flex items-center gap-1.5">
            {rule && <RuleChip name={rule} to={`/rules?rule=${encodeURIComponent(rule)}`} />}
            <AgeChip sinceMs={l.importedAt} now={now} />
          </div>
        </div>
      </div>
    );
  };

  if (grouping === "list") {
    return (
      <>
        {display.map((l) => (
          <Row key={l._id} l={l} />
        ))}
      </>
    );
  }

  // By rule — group rows under the fired rule.
  const groups = new Map<string, Listing[]>();
  for (const l of display) {
    const r = topRule(l) || "no rule fired";
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(l);
  }
  return (
    <>
      {[...groups.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([rule, items]) => (
          <div key={rule}>
            <div className="flex items-center justify-between bg-je-surface px-4 py-1.5">
              <span className="font-mono text-[11px] text-je-ink-2">{rule}</span>
              <span className="num text-[11px] text-je-ink-3">{items.length}</span>
            </div>
            {items.map((l) => (
              <Row key={l._id} l={l} />
            ))}
          </div>
        ))}
    </>
  );
}
