import { useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useApiMutation, useApiQuery } from "@/hooks/useApiQuery";
import { apiClient } from "@/lib/apiClient";
import { StatusChip, SectionLabel } from "@/components/ops";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

// Variables a seller message can interpolate. Sample values drive the preview.
const VARIABLES: { token: string; sample: string }[] = [
  { token: "{listing_title}", sample: "Marbella Villa" },
  { token: "{je_id}", sample: "2126098665" },
  { token: "{office}", sample: "Best House Fuengirola" },
  { token: "{country}", sample: "Spain" },
  { token: "{min_price}", sample: "$490,000" },
];

function renderPreview(body: string): string {
  return VARIABLES.reduce((acc, v) => acc.split(v.token).join(v.sample), body || "");
}

function categoryKind(category: string): "rejected" | "notice" {
  return category === "reject" ? "rejected" : "notice";
}

function MessageDrawer({
  template,
  open,
  onClose,
  onDelete,
}: {
  template: any | null; // null = create
  open: boolean;
  onClose: () => void;
  onDelete: (t: any) => void;
}) {
  const [createTemplate] = useApiMutation(apiClient.messages.create);
  const [updateTemplate] = useApiMutation(apiClient.messages.update);
  const isNew = !template;

  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState("reject");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Re-seed the form whenever a different template (or create) opens.
  useMemo(() => {
    setDisplayName(template?.displayName || "");
    setCategory(template?.category || "reject");
    setBody(template?.body || "");
  }, [template, open]);

  const insertVariable = (token: string) => {
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const save = async () => {
    if (!displayName.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    try {
      if (isNew) {
        const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        await createTemplate({ name: slug, displayName: displayName.trim(), category, body });
        toast.success("Template created");
      } else {
        await updateTemplate({ id: template._id, displayName: displayName.trim(), category, body });
        toast.success("Template updated");
      }
      onClose();
    } catch {
      toast.error("Failed to save template");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 rounded-none p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="text-[15px] font-semibold">{isNew ? "New template" : "Edit template"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div>
              <SectionLabel className="mb-1.5">Name</SectionLabel>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Low quality photos"
                className="h-9 rounded-none"
              />
            </div>
            <div>
              <SectionLabel className="mb-1.5">Category</SectionLabel>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="reject" className="rounded-none">Rejection</SelectItem>
                  <SelectItem value="notice" className="rounded-none">Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <SectionLabel>Body</SectionLabel>
              <span className="text-je-ink-3">·</span>
              {VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token)}
                  className="rounded-[4px] border border-border bg-je-surface px-1.5 py-0.5 font-mono text-[10px] text-je-ink-2 hover:border-je-teal hover:text-je-teal"
                  title={`Insert ${v.token}`}
                >
                  {v.token}
                </button>
              ))}
            </div>
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              placeholder="Write the seller message… click a variable above to insert it."
              className="resize-none rounded-none font-mono text-[12.5px]"
            />
          </div>

          <div>
            <SectionLabel className="mb-1.5">Preview</SectionLabel>
            <div className="whitespace-pre-wrap border border-border bg-je-surface px-3 py-2.5 text-[12.5px] text-je-ink-2">
              {renderPreview(body) || <span className="italic text-je-ink-3">Nothing to preview yet.</span>}
            </div>
          </div>

          <p className="text-[11.5px] text-je-ink-3">
            Variables resolve against the listing at send time. Rule references to templates aren't modelled on the API
            yet — surfaced here once the backend exposes them.
          </p>
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-border p-4">
          <Button size="sm" className="rounded-none" onClick={save}>
            {isNew ? "Create" : "Save"}
          </Button>
          {!isNew && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto rounded-none text-je-error hover:text-je-error"
              onClick={() => onDelete(template)}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default function MessagesPage() {
  const { data: templates } = useApiQuery(apiClient.messages.list);
  const [deleteTemplate] = useApiMutation(apiClient.messages.remove);
  const [drawer, setDrawer] = useState<{ open: boolean; template: any | null }>({ open: false, template: null });
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = useMemo(() => {
    return (templates || []).filter((t: any) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      const q = search.trim().toLowerCase();
      if (q && !t.displayName.toLowerCase().includes(q) && !t.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, search, categoryFilter]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteTemplate({ id: deleteConfirm._id });
      toast.success("Template deleted");
      setDeleteConfirm(null);
      setDrawer({ open: false, template: null });
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (!templates) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="size-7 animate-spin text-je-ink-3" />
      </div>
    );
  }

  const rejectCount = templates.filter((t: any) => t.category === "reject").length;
  const noticeCount = templates.filter((t: any) => t.category === "notice").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Topbar */}
      <div className="flex items-center gap-3.5 border-b border-border px-6 py-3.5">
        <h1 className="text-[18px] font-semibold tracking-tight">Messages</h1>
        <span className="text-[12px] text-je-ink-2">
          {rejectCount} rejection · {noticeCount} notice
        </span>
        <Button
          size="sm"
          className="ml-auto h-[30px] gap-1.5 rounded-none"
          onClick={() => setDrawer({ open: true, template: null })}
        >
          <Plus className="size-3.5" /> New template
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex h-[30px] min-w-[220px] items-center gap-2 border border-border px-2.5">
          <Search className="size-3.5 text-je-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or body…"
            className="h-full w-full bg-transparent text-[12.5px] outline-none placeholder:text-je-ink-3"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="text-je-ink-3">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger size="sm" className="h-[30px]! w-auto gap-1.5 rounded-none border-border px-2.5 text-[12px]">
            <span className="text-je-ink-2">Category</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="all" className="rounded-none text-[12px]">All</SelectItem>
            <SelectItem value="reject" className="rounded-none text-[12px]">Rejection</SelectItem>
            <SelectItem value="notice" className="rounded-none text-[12px]">Notice</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-[12px] text-je-ink-3">{filtered.length} shown</span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto px-6">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-je-ink-2">No templates match.</div>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-je-ink text-[10px] uppercase tracking-[0.09em] text-je-ink-2">
                <th className="w-[220px] py-2 pr-3 text-left font-semibold">Name</th>
                <th className="w-[100px] py-2 pr-3 text-left font-semibold">Category</th>
                <th className="py-2 pr-3 text-left font-semibold">Body</th>
                <th className="w-[40px] py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => (
                <tr
                  key={t._id}
                  onClick={() => setDrawer({ open: true, template: t })}
                  className="cursor-pointer border-b border-border align-top hover:bg-je-surface"
                >
                  <td className="py-2.5 pr-3 font-medium">{t.displayName}</td>
                  <td className="py-2.5 pr-3">
                    <StatusChip kind={categoryKind(t.category)} label={t.category === "reject" ? "Reject" : "Notice"} />
                  </td>
                  <td className="max-w-0 truncate py-2.5 pr-3 text-je-ink-2">{t.body}</td>
                  <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label={`Delete ${t.displayName}`}
                      className="text-je-ink-3 hover:text-je-error"
                      onClick={() => setDeleteConfirm(t)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <MessageDrawer
        template={drawer.template}
        open={drawer.open}
        onClose={() => setDrawer({ open: false, template: null })}
        onDelete={(t) => setDeleteConfirm(t)}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
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
