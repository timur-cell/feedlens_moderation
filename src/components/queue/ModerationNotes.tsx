import { useState } from "react";
import { Send, Trash2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionLabel } from "@/components/ops";

// Internal moderation notes for a listing. Threaded, with the author + time
// from the Rails session user. Used in the Queue detail pane.
export function ModerationNotes({ listingId }: { listingId: string }) {
  const { data: notes } = useApiQuery(apiClient.notes.listByListing, { listingId });
  const [addNote] = useApiMutation(apiClient.notes.add);
  const [removeNote] = useApiMutation(apiClient.notes.remove);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await addNote({ listingId, content: draft.trim() });
      setDraft("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-je-surface px-3 py-1.5">
        <StickyNote className="size-3.5 text-je-ink-2" />
        <SectionLabel>Notes{notes && notes.length > 0 ? ` · ${notes.length}` : ""}</SectionLabel>
      </div>
      <div className="space-y-2 p-3">
        {notes && notes.length > 0 ? (
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {notes.map((note: any) => (
              <div key={note._id} className="group flex items-start gap-2 bg-je-surface px-2 py-1.5 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="font-medium">{note.authorName}</span>
                    <span className="text-je-ink-3">
                      {new Date(note.createdAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-je-ink-2">{note.content}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-je-ink-3 opacity-0 transition-opacity hover:text-je-error group-hover:opacity-100"
                  onClick={async () => {
                    try {
                      await removeNote({ id: note._id });
                      toast.success("Note deleted");
                    } catch {
                      toast.error("Failed to delete note");
                    }
                  }}
                  title="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-1 text-[12px] italic text-je-ink-3">No notes yet</p>
        )}

        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add internal note… (⌘↵ to save)"
            rows={2}
            className="flex-1 resize-none rounded-none text-[12px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 self-end rounded-none px-2"
            onClick={submit}
            disabled={!draft.trim() || busy}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
