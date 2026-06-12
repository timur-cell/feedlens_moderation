import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanSearch, Loader2, ExternalLink, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { StatusChip, SectionLabel } from "@/components/ops";
import { WhyFlagged } from "@/components/queue/EvidencePanel";
import { outcomeKind } from "@/lib/queueFormat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ⌘K Inspect — ad-hoc "should this one listing be live?" without leaving the
// page. Fetches + moderates a pasted URL/JE ID through the full pipeline and
// renders the result in the *same* evidence dialect the Queue uses (shared
// WhyFlagged). The run persists to the same moderation store as queued items.

const EVENT = "feedlens:open-inspect";

export function openInspect(query = "") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { query } }));
}

export function InspectPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [run] = useApiMutation(apiClient.moderateById.run);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent).detail?.query || "";
      setQuery(q);
      setResult(null);
      setOpen(true);
      if (q) void inspect(q);
      else requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspect = async (q: string) => {
    const input = q.trim();
    if (!input) return;
    setBusy(true);
    setResult(null);
    try {
      const resp: any = await run({ inputs: [input] });
      const r = resp?.results?.[0];
      if (!r) {
        toast.error("No result returned");
      } else if (r.error) {
        toast.error(r.error);
        setResult(r);
      } else {
        setResult(r);
      }
    } catch (e) {
      toast.error("Inspect failed: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 rounded-none p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="flex items-center gap-2 text-[15px] font-semibold">
            <ScanSearch className="size-4" /> Inspect a listing
          </SheetTitle>
        </SheetHeader>

        <div className="border-b border-border p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inspect(query)}
              placeholder="Paste a JE listing URL or ID…"
              className="h-9 flex-1 border border-border bg-background px-2.5 text-[13px] outline-none focus-visible:border-je-teal placeholder:text-je-ink-3"
            />
            <Button size="sm" className="h-9 rounded-none" disabled={busy || !query.trim()} onClick={() => inspect(query)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Inspect"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-je-ink-3">
            Runs the full pipeline (rules · param scan · vision) and saves to the Decisions log.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {busy && (
            <div className="flex items-center gap-2 text-[13px] text-je-ink-2">
              <Loader2 className="size-4 animate-spin" /> Fetching &amp; moderating…
            </div>
          )}

          {result && !busy && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold">{result.title || result.jeId}</span>
                {result.outcome && <StatusChip kind={outcomeKind(result.outcome)} label={result.outcome} />}
                {result.locked && <StatusChip kind="off" label="Locked" />}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-je-ink-2">
                <span>
                  JE <span className="font-mono">{result.jeId}</span>
                </span>
                {result.dataSource && (
                  <>
                    <span>·</span>
                    <span>{String(result.dataSource).replace(/_/g, " ")}</span>
                  </>
                )}
                <span>·</span>
                <a
                  href={`https://www.jamesedition.com/admin/listings/${result.jeId}/edit`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-je-teal hover:underline"
                >
                  Admin <ExternalLink className="size-3" />
                </a>
              </div>

              {result.error ? (
                <div className="border border-je-error bg-je-error-bg px-3 py-2 text-[12.5px] text-je-error">
                  {result.error}
                </div>
              ) : (
                <div>
                  <SectionLabel className="mb-1.5">Why flagged</SectionLabel>
                  <WhyFlagged matches={result.ruleMatchDetails || []} scan={result.aiScan} dense />
                </div>
              )}

              {result.outcome === "manual" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-none"
                  onClick={() => {
                    setOpen(false);
                    navigate("/queue");
                  }}
                >
                  Review in Queue <ArrowRight className="size-3.5" />
                </Button>
              )}
            </>
          )}

          {!result && !busy && (
            <p className="text-[13px] text-je-ink-3">Paste a listing URL or JE ID above to fetch and moderate it.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
