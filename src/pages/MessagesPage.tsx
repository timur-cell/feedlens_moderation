import { useMutation, useQuery } from "convex/react";
import {
  MessageSquare,
  XCircle,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Star,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">{template.displayName}</h3>
              <Badge
                variant={template.category === "reject" ? "destructive" : "secondary"}
                className="text-xs"
              >
                {template.category === "reject" ? (
                  <XCircle className="size-3 mr-1" />
                ) : (
                  <MessageSquare className="size-3 mr-1" />
                )}
                {template.category}
              </Badge>
              {template.isDefault && (
                <Badge variant="outline" className="text-xs">
                  <Star className="size-3 mr-1" />
                  Default
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
              {template.body}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-8" onClick={onEdit}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateEditorDialog({
  template,
  open,
  onClose,
}: {
  template?: any;
  open: boolean;
  onClose: () => void;
}) {
  const createTemplate = useMutation(api.messages.create);
  const updateTemplate = useMutation(api.messages.update);

  const [displayName, setDisplayName] = useState(template?.displayName || "");
  const [category, setCategory] = useState(template?.category || "reject");
  const [body, setBody] = useState(template?.body || "");

  const isNew = !template;

  const handleSave = async () => {
    if (!displayName || !body) {
      toast.error("Name and body are required");
      return;
    }

    try {
      if (isNew) {
        const slug = displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
        await createTemplate({
          name: slug,
          displayName,
          category,
          body,
        });
        toast.success("Template created");
      } else {
        await updateTemplate({
          id: template._id,
          displayName,
          category,
          body,
        });
        toast.success("Template updated");
      }
      onClose();
    } catch (e) {
      toast.error("Failed to save template");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "New Template" : "Edit Template"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Create a new message template for seller communication."
              : "Update the message template."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Low Quality Photos"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reject">Rejection</SelectItem>
                <SelectItem value="notice">Notice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Message Body</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Write the seller message..."
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              This message will be sent to sellers when this template is used.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{isNew ? "Create" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MessagesPage() {
  const templates = useQuery(api.messages.list);
  const deleteTemplate = useMutation(api.messages.remove);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);

  if (!templates) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rejectTemplates = templates.filter((t: any) => t.category === "reject");
  const noticeTemplates = templates.filter((t: any) => t.category === "notice");

  const handleDelete = async (template: any) => {
    if (confirm(`Delete "${template.displayName}"?`)) {
      try {
        await deleteTemplate({ id: template._id });
        toast.success("Template deleted");
      } catch {
        toast.error("Failed to delete");
      }
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Message Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Seller messages for rejections and notices
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="size-4 mr-1" />
          New Template
        </Button>
      </div>

      {/* Rejection templates */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <XCircle className="size-5 text-red-500" />
          Rejection Messages
          <Badge variant="outline" className="text-xs">{rejectTemplates.length}</Badge>
        </h2>
        <div className="space-y-3">
          {rejectTemplates.map((t: any) => (
            <TemplateCard
              key={t._id}
              template={t}
              onEdit={() => setEditingTemplate(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
          {rejectTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No rejection templates yet
            </p>
          )}
        </div>
      </div>

      {/* Notice templates */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
          <MessageSquare className="size-5 text-sky-500" />
          Notice Messages
          <Badge variant="outline" className="text-xs">{noticeTemplates.length}</Badge>
        </h2>
        <div className="space-y-3">
          {noticeTemplates.map((t: any) => (
            <TemplateCard
              key={t._id}
              template={t}
              onEdit={() => setEditingTemplate(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
          {noticeTemplates.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No notice templates yet
            </p>
          )}
        </div>
      </div>

      {/* Editors */}
      {editingTemplate && (
        <TemplateEditorDialog
          template={editingTemplate}
          open={!!editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}
      {showNew && (
        <TemplateEditorDialog
          open={showNew}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
