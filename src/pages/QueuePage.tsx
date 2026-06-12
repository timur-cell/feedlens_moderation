import { jeImageUrl } from "@/components/JeImage";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Image,
  MapPin,
  DollarSign,
  Building,
  Bot,
  Bed,
  Bath,
  Ruler,
  LandPlot,
  Tag,
  FileText,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Clock,
  X,
  StickyNote,
  Send,
  Trash2,
  Lock,
  // ShieldAlert, Activity — removed with LAS UI (hidden 2026-03-17)
} from "lucide-react";
import { useState, useEffect } from "react";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { REFUSE_REASON_TYPES } from "@/lib/refuseReasons";

interface QueueListing {
  _id: string;
  jeId: string;
  title: string;
  price?: number;
  priceUsd?: number;
  currency?: string;
  priceOnRequest?: boolean;
  country?: string;
  city?: string;
  state?: string;
  category?: string;
  realEstateType?: string;
  imageCount?: number;
  imageUrls?: string[];
  avgImageWidth?: number;
  avgImageHeight?: number;
  lqi?: number;
  description?: string;
  descriptionLength?: number;
  office?: string;
  officeGroupName?: string;
  officeSubscription?: string;
  livingArea?: number;
  landArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  feedSource?: string;
  listingUrl?: string;
  importedAt: number;
  rental?: boolean;
  preOwned?: boolean;
  outdated?: boolean;
  year?: number;
  chatGptConclusion?: string;
  chatGptPropertyCondition?: number;
  chatGptWatermarkShare?: number;
  chatGptImageQuality?: string;
  // LAS accuracy data
  accuracyScore?: number;
  accuracyLabel?: string;
  accuracyFlags?: string[];
  accuracyReview?: string;
  accuracyUserMessage?: string;
  accuracyAction?: string;
  accuracyScannedAt?: number;
  pricePerSqm?: number;
}

/* ─── Time Waiting Counter ────────────────────────────────────── */
function TimeWaiting({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - since;
      const secs = Math.floor(diff / 1000);
      const mins = Math.floor(secs / 60);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setElapsed(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setElapsed(`${hours}h ${mins % 60}m`);
      } else if (mins > 0) {
        setElapsed(`${mins}m ${secs % 60}s`);
      } else {
        setElapsed(`${secs}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [since]);

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-full text-xs font-medium text-amber-700 dark:text-amber-300">
      <Clock className="size-3 animate-pulse" />
      <span>Waiting: {elapsed}</span>
    </div>
  );
}

/* ─── Dismissable Rule Pills ──────────────────────────────────── */
function DismissableRulePills({
  ruleMatches,
  dismissedRules,
  onDismiss,
}: {
  ruleMatches: Array<{ ruleName: string; ruleCategory: string; action: string; details?: string; message?: string }>;
  dismissedRules: Set<string>;
  onDismiss: (ruleName: string) => void;
}) {
  const visibleRules = ruleMatches.filter((m) => !dismissedRules.has(m.ruleName));

  if (visibleRules.length === 0 && ruleMatches.length > 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-1">
        All {ruleMatches.length} rule alerts dismissed
      </div>
    );
  }

  if (visibleRules.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleRules.map((m, i) => (
        <div
          key={i}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-all ${
            m.action === "reject"
              ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
              : m.action === "flag"
                ? "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                : "bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300"
          }`}
        >
          {m.ruleCategory === "llm" && <Bot className="size-3" />}
          <span>{m.ruleName}</span>
          {m.details && (
            <span className="opacity-60 max-w-[200px] truncate" title={m.details}>
              — {m.details}
            </span>
          )}
          <button
            type="button"
            className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(m.ruleName);
            }}
            title="Dismiss this alert"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Moderation Notes Panel ──────────────────────────────────── */
function ModerationNotes({ listingId }: { listingId: string }) {
  const { data: notes } = useApiQuery(apiClient.notes.listByListing, {
    listingId,
  });
  const [addNote] = useApiMutation(apiClient.notes.add);
  const [removeNote] = useApiMutation(apiClient.notes.remove);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;
    setIsSubmitting(true);
    try {
      // The author is the session user on the Rails side.
      await addNote({
        listingId,
        content: newNote.trim(),
      });
      setNewNote("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await removeNote({ id: noteId });
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
    }
  };

  return (
    <div className="mt-3 border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        <StickyNote className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Moderation Notes</span>
        {notes && notes.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {notes.length}
          </Badge>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Existing notes */}
        {notes && notes.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {notes.map((note: any) => (
              <div
                key={note._id}
                className="flex items-start gap-2 p-2 bg-muted/30 rounded text-xs group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">{note.authorName}</span>
                    <span className="text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{note.content}</p>
                </div>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  onClick={() => handleDelete(note._id)}
                  title="Delete note"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {notes && notes.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-1">No notes yet</p>
        )}

        {/* Add new note */}
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add internal note..."
            rows={2}
            className="text-xs resize-none flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-end h-8 px-2"
            onClick={handleSubmit}
            disabled={!newNote.trim() || isSubmitting}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Image Gallery with thumbnails ───────────────────────────── */
function ImageGallery({ images, title }: { images: string[]; title: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const maxThumbs = 5;
  const remaining = images.length - maxThumbs;

  if (images.length === 0) {
    return (
      <div className="w-full aspect-[4/3] bg-muted rounded-lg flex items-center justify-center">
        <div className="text-center text-muted-foreground/50">
          <Image className="size-10 mx-auto mb-1" />
          <span className="text-xs">No images</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {/* Main image */}
        <div
          className="w-full aspect-[4/3] bg-muted rounded-lg overflow-hidden relative group cursor-pointer"
          onClick={() => setLightbox(true)}
        >
          <img
            src={jeImageUrl(images[activeIdx])}
            alt={title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "";
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <Maximize2 className="size-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setActiveIdx((activeIdx - 1 + images.length) % images.length); }}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setActiveIdx((activeIdx + 1) % images.length); }}
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
          <span className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded-full">
            {activeIdx + 1}/{images.length}
          </span>
        </div>
        {images.length > 1 && (
          <div className="flex gap-1">
            {images.slice(0, maxThumbs).map((url, i) => (
              <button
                type="button"
                key={i}
                className={`w-12 h-9 rounded overflow-hidden border-2 transition-colors ${
                  i === activeIdx ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                }`}
                onClick={() => setActiveIdx(i)}
              >
                <img src={jeImageUrl(url)} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
            {remaining > 0 && (
              <div className="w-12 h-9 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                +{remaining}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-4xl p-2">
          <div className="relative">
            <img
              src={jeImageUrl(images[activeIdx])}
              alt={title}
              className="w-full max-h-[80vh] object-contain rounded"
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setActiveIdx((activeIdx - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={() => setActiveIdx((activeIdx + 1) % images.length)}
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm bg-black/60 text-white px-3 py-1 rounded-full">
              {activeIdx + 1} / {images.length}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Key/value parameter pill ────────────────────────────────── */
function Param({ icon: Icon, label, value, warn, isNull }: { icon?: any; label: string; value: string | number | null | undefined; warn?: boolean; isNull?: boolean }) {
  const showNull = isNull || value === null || value === undefined || value === "";
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${
      showNull
        ? "bg-gray-50 dark:bg-gray-900/40 border border-dashed border-gray-200 dark:border-gray-700"
        : warn
          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "bg-muted"
    }`}>
      {Icon && <Icon className={`size-3 shrink-0 ${showNull ? "text-gray-300 dark:text-gray-600" : ""}`} />}
      <span className="text-muted-foreground">{label}</span>
      {showNull ? (
        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 italic">null</span>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}

/* ─── Listing Card ────────────────────────────────────────────── */
function ListingCard({ listing }: { listing: QueueListing }) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [actionDialog, setActionDialog] = useState<"approve" | "reject" | "notice" | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [refuseReasonType, setRefuseReasonType] = useState("other");
  const [permanent, setPermanent] = useState(false);
  const [dismissedRules, setDismissedRules] = useState<Set<string>>(new Set());
  const { data: results } = useApiQuery(apiClient.moderation.forListing, {
    listingId: listing._id,
  });
  const { data: templates } = useApiQuery(apiClient.messages.list);
  const [overrideDecision] = useApiMutation(apiClient.moderation.override);

  const result = results?.[0];
  const ruleMatches = result?.ruleMatches || [];

  const handleDismissRule = (ruleName: string) => {
    setDismissedRules((prev) => new Set([...prev, ruleName]));
  };

  const [actionLoading, setActionLoading] = useState(false);

  // Reset dialog inputs on close — otherwise a canceled Reject leaves the
  // refusal text in `message`, and a subsequent Approve would send it to the
  // seller as sellerMessage.
  const closeActionDialog = () => {
    setActionDialog(null);
    setMessage("");
    setReason("");
    setRefuseReasonType("other");
    setPermanent(false);
  };

  const handleAction = async (
    action: "approved" | "rejected" | "notice",
    opts?: { permanent?: boolean },
  ) => {
    if (!result) {
      toast.error("No moderation result found for this listing");
      return;
    }
    const lockForever = opts?.permanent ?? permanent;
    setActionLoading(true);
    try {
      // The override is attributed to the session moderator on the Rails side.
      await overrideDecision({
        resultId: result._id,
        newOutcome: action,
        reason: reason || undefined,
        sellerMessage: action === "approved" ? undefined : message || undefined,
        refuseReasonType: action === "rejected" ? refuseReasonType : undefined,
        permanent: lockForever || undefined,
      });
      toast.success(
        `Listing ${action === "approved" ? "approved" : action === "rejected" ? "rejected" : "noticed"}${lockForever ? " permanently (locked)" : ""}`,
      );
      closeActionDialog();
    } catch (err) {
      console.error("Override failed:", err);
      toast.error("Failed to update listing: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setActionLoading(false);
    }
  };

  const priceDisplay = listing.priceOnRequest
    ? "Price on Request"
    : listing.priceUsd
      ? `$${listing.priceUsd.toLocaleString()}`
      : listing.price
        ? `${listing.price.toLocaleString()} ${listing.currency || ""}`
        : "N/A";

  const location = [listing.city, listing.state, listing.country].filter(Boolean).join(", ");
  const categoryLabel = listing.category?.replace("RealEstate", "Real Estate") || "—";
  const typeLabel = listing.realEstateType
    ? listing.realEstateType.charAt(0).toUpperCase() + listing.realEstateType.slice(1)
    : null;

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Status banner with time waiting (Implio-style) */}
          <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Awaiting review in Manual Queue
              </span>
            </div>
            <TimeWaiting since={listing.importedAt} />
          </div>

          {/* Dismissable rule pills */}
          {ruleMatches.length > 0 && (
            <div className="px-4 py-2 bg-muted/30 border-b">
              <DismissableRulePills
                ruleMatches={ruleMatches}
                dismissedRules={dismissedRules}
                onDismiss={handleDismissRule}
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row">
            {/* Left: Image gallery */}
            <div className="w-full sm:w-72 shrink-0 p-3">
              <ImageGallery
                images={listing.imageUrls || []}
                title={listing.title}
              />
            </div>

            {/* Right: Info panel */}
            <div className="flex-1 min-w-0 p-4 sm:pl-0">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2">{listing.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {location}
                      </span>
                    )}
                    <span>•</span>
                    <span className="font-medium text-foreground">{priceDisplay}</span>
                    {listing.rental && <Badge variant="outline" className="text-[10px] py-0 px-1">Rental</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" asChild>
                    <a href={`https://www.jamesedition.com/admin/listings/${listing.jeId}/edit`} target="_blank" rel="noopener noreferrer" title="Open in JE Admin">
                      Admin
                    </a>
                  </Button>
                  {listing.listingUrl && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground" asChild>
                      <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer" title="View on JamesEdition.com">
                        <ExternalLink className="size-3" /> Live
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              {/* Parameter grid — categorized for easy navigation */}
              <div className="mt-3 space-y-2.5">
                {/* Basic Info */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">Basic Info</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={Tag} label="Category" value={categoryLabel !== "—" ? categoryLabel : null} />
                    <Param icon={Tag} label="Type" value={typeLabel} />
                    <Param icon={DollarSign} label="Price" value={listing.priceUsd != null ? `$${listing.priceUsd.toLocaleString()}` : listing.price != null ? `${listing.price.toLocaleString()} ${listing.currency || ""}` : null} />
                    <Param label="POR" value={listing.priceOnRequest != null ? (listing.priceOnRequest ? "Yes" : "No") : null} />
                    <Param label="Rental" value={listing.rental != null ? (listing.rental ? "Yes" : "No") : null} />
                    <Param label="Pre-owned" value={listing.preOwned != null ? (listing.preOwned ? "Yes" : "No") : null} />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">Location</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={MapPin} label="Country" value={listing.country} />
                    <Param label="City" value={listing.city} />
                    <Param label="State" value={listing.state} />
                  </div>
                </div>

                {/* Seller */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">Seller</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={Building} label="Office" value={listing.officeGroupName || listing.office || null} />
                    <Param label="Plan" value={listing.officeSubscription} />
                    <Param label="Feed" value={listing.feedSource} />
                  </div>
                </div>

                {/* Property Details */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">Property</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={Bed} label="Beds" value={listing.bedrooms} warn={listing.bedrooms != null && listing.bedrooms > 20} />
                    <Param icon={Bath} label="Baths" value={listing.bathrooms} warn={listing.bathrooms != null && listing.bathrooms > 20} />
                    <Param icon={Ruler} label="Living" value={listing.livingArea != null ? `${listing.livingArea.toLocaleString()} m²` : null} />
                    <Param icon={LandPlot} label="Land" value={listing.landArea != null ? `${listing.landArea.toLocaleString()} m²` : null} />
                    <Param icon={DollarSign} label="Price/sqm" value={listing.pricePerSqm != null ? `$${listing.pricePerSqm.toLocaleString()}` : (listing.price && listing.livingArea ? `~$${Math.round(listing.price / listing.livingArea).toLocaleString()}` : null)} warn={listing.pricePerSqm != null && listing.pricePerSqm <= 1000} />
                  </div>
                </div>

                {/* Content Quality */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">Content Quality</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={Image} label="Images" value={listing.imageCount ?? null} warn={listing.imageCount != null && listing.imageCount < 3} />
                    <Param label="Avg Img" value={listing.avgImageWidth != null && listing.avgImageHeight != null ? `${Math.round(listing.avgImageWidth)}×${Math.round(listing.avgImageHeight)}px` : null} />
                    <Param label="LQI" value={listing.lqi != null ? `${listing.lqi}%` : null} warn={listing.lqi != null && listing.lqi < 40} />
                    <Param icon={FileText} label="Desc" value={listing.descriptionLength != null ? `${listing.descriptionLength} chars` : null} />
                  </div>
                </div>

                {/* AI Analysis */}
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium mb-1">AI Analysis</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Param icon={Bot} label="AI Condition" value={listing.chatGptPropertyCondition != null ? `${listing.chatGptPropertyCondition}/6` : null} warn={listing.chatGptPropertyCondition != null && listing.chatGptPropertyCondition < 3} />
                    <Param icon={Bot} label="AI Watermark" value={listing.chatGptWatermarkShare != null ? `${listing.chatGptWatermarkShare}/10` : null} warn={listing.chatGptWatermarkShare != null && listing.chatGptWatermarkShare > 2} />
                    <Param icon={Bot} label="AI Img Quality" value={listing.chatGptImageQuality ?? null} warn={listing.chatGptImageQuality === "poor" || listing.chatGptImageQuality === "low"} />
                  </div>
                </div>
              </div>

              {/* HIDDEN: LAS Accuracy Data — hidden per Timur (2026-03-17), data still stored in DB */}

              {/* LLM assessment */}
              {result?.llmTriggered && result?.llmResponse && (
                <div className="mt-2 p-2 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded text-xs">
                  <div className="flex items-center gap-1 font-medium mb-1 text-violet-700 dark:text-violet-300">
                    <Bot className="size-3" />
                    LLM: {result.llmResponse.recommendation}
                    {result.llmResponse.confidence && (
                      <span className="opacity-70 ml-1">
                        ({Math.round(result.llmResponse.confidence * 100)}%)
                      </span>
                    )}
                  </div>
                  {result.llmResponse.assessment && (
                    <p className="text-violet-600/80 dark:text-violet-400/80">{result.llmResponse.assessment}</p>
                  )}
                </div>
              )}

              {/* Expandable details */}
              {expanded && (
                <div className="mt-3 p-3 bg-muted/30 rounded-lg text-xs space-y-2 border">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div><span className="text-muted-foreground">JE ID:</span> <a href={`https://www.jamesedition.com/admin/listings/${listing.jeId}/edit`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{listing.jeId}</a></div>
                    <div><span className="text-muted-foreground">Office ID:</span> {listing.office ? <a href={`https://www.jamesedition.com/admin/listings?search_term=${encodeURIComponent(listing.office)}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{listing.office}</a> : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                    <div><span className="text-muted-foreground">Avg img:</span> {listing.avgImageWidth != null && listing.avgImageHeight != null ? `${Math.round(listing.avgImageWidth)}×${Math.round(listing.avgImageHeight)}px` : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                    <div><span className="text-muted-foreground">Pre-owned:</span> {listing.preOwned != null ? (listing.preOwned ? "Yes" : "No") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                    <div><span className="text-muted-foreground">Outdated:</span> {listing.outdated != null ? (listing.outdated ? "Yes" : "No") : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                    <div><span className="text-muted-foreground">Year:</span> {listing.year != null ? listing.year : <span className="font-mono text-[10px] text-gray-400 italic">null</span>}</div>
                  </div>
                  {listing.description && (
                    <div className="pt-2 border-t">
                      <span className="font-medium">Description:</span>
                      <p className="text-muted-foreground mt-1 whitespace-pre-line line-clamp-6">{listing.description}</p>
                    </div>
                  )}
                  {ruleMatches.length > 0 && (
                    <div className="pt-2 border-t">
                      <span className="font-medium">Rule details:</span>
                      {ruleMatches.map((m: any, i: number) => (
                        <div key={i} className="text-muted-foreground mt-1">
                          • <span className="font-medium">{m.ruleName}</span>
                          <span className="opacity-70"> ({m.tier}/{m.action})</span>: {m.details}
                          {m.message && <div className="ml-3 mt-0.5 italic text-amber-600">→ "{m.message}"</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Moderation Notes (toggle) */}
              {showNotes && (
                <ModerationNotes listingId={listing._id} />
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs"
                  >
                    {expanded ? <ChevronUp className="size-3 mr-1" /> : <ChevronDown className="size-3 mr-1" />}
                    {expanded ? "Less" : "Details"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotes(!showNotes)}
                    className={`text-xs gap-1 ${showNotes ? "bg-muted" : ""}`}
                  >
                    <StickyNote className="size-3" />
                    Notes
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sky-600 border-sky-200 hover:bg-sky-50"
                    onClick={() => {
                      setMessage("");
                      setActionDialog("notice");
                    }}
                  >
                    <MessageSquare className="size-3.5 mr-1" />
                    Notice
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => {
                      // Auto-detect refuse reason from rules
                      const hasImageRule = ruleMatches.some((m: any) =>
                        /image|watermark|photo|picture|resolution/i.test(m.ruleName)
                      );
                      const hasDuplicateRule = ruleMatches.some((m: any) =>
                        /duplicate/i.test(m.ruleName)
                      );
                      const hasIllegalRule = ruleMatches.some((m: any) =>
                        /illegal|prohibited|weapon|drug/i.test(m.ruleName)
                      );
                      const detectedReason =
                        hasImageRule ? "images" :
                        hasDuplicateRule ? "duplicate" :
                        hasIllegalRule ? "illegal" : "other";
                      setRefuseReasonType(detectedReason);
                      // Use default generic seller message for the detected reason
                      const reasonType = REFUSE_REASON_TYPES.find((t) => t.value === detectedReason);
                      setMessage(reasonType?.defaultMessage || "");
                      setActionDialog("reject");
                    }}
                  >
                    <XCircle className="size-3.5 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    disabled={actionLoading}
                    onClick={() => handleAction("approved")}
                  >
                    {actionLoading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="size-3.5 mr-1" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                    disabled={actionLoading}
                    title="Approve and lock — automated re-moderation will never change this decision"
                    onClick={() => handleAction("approved", { permanent: true })}
                  >
                    <Lock className="size-3.5 mr-1" />
                    Approve forever
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Dialog with Refuse Reason Types */}
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
            {/* Refuse Reason Type (only for reject) */}
            {actionDialog === "reject" && (
              <div>
                <label className="text-sm font-medium">Refuse Reason</label>
                <Select value={refuseReasonType} onValueChange={(val) => {
                  setRefuseReasonType(val);
                  // Update seller message to match the new reason's default
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
                    if (t) setMessage(t.body);
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

            <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <Checkbox
                checked={permanent}
                onCheckedChange={(v) => setPermanent(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium flex items-center gap-1">
                  <Lock className="size-3.5" /> Final decision
                </span>
                <span className="text-muted-foreground">
                  Lock this listing — feed re-imports and automated re-moderation
                  will never change it until a moderator unlocks it.
                </span>
              </span>
            </label>
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

export default function QueuePage() {
  const { data: listings, error, refetch } = useApiQuery(apiClient.listings.pending, undefined, {
    pollMs: 10000,
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Manual Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Listings that need human review — low-confidence or flagged rules
        </p>
      </div>

      {error && !listings ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-muted-foreground">Failed to load the queue: {error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : !listings ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="size-12 text-muted-foreground/30 mb-3" />
            <p className="text-lg font-medium">Queue is empty</p>
            <p className="text-sm text-muted-foreground mt-1">
              All listings have been reviewed. Nice work!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {listings.length} listing{listings.length !== 1 ? "s" : ""} awaiting review
          </p>
          {listings.map((listing: any) => (
            <ListingCard key={listing._id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
