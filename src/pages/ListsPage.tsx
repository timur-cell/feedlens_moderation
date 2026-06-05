import { useAction, useMutation, useQuery } from "convex/react";
import {
  List,
  Search,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Hash,
  Regex,
  Type,
  Download,
  Loader2,
  Sparkles,
  X,
  Copy,
  Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type ListItem = {
  value: string;
  type: string;
  pattern?: string;
  flags?: string;
};

type ModerationList = {
  _id: any;
  name: string;
  displayName: string;
  description?: string;
  category: string;
  source?: string;
  items: ListItem[];
  itemCount: number;
  updatedAt: number;
};

const categoryColors: Record<string, string> = {
  automotive: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  exceptions: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  image_quality: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  location: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "location.alicante": "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "location.malaga": "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  "real_estate.availability": "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  "real_estate.development": "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  "real_estate.property_type": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  "real_estate.quality": "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
};

function ListCard({
  list,
  rules,
  onEdit,
  onDelete,
}: {
  list: ModerationList;
  rules: any[];
  onEdit: (list: ModerationList) => void;
  onDelete: (list: ModerationList) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [copiedName, setCopiedName] = useState(false);

  const referencingRules = useMemo(() => {
    return rules.filter((r: any) => {
      const cfg = r.config || {};
      return (
        cfg.listRef === list.name ||
        cfg.excludeListRef === list.name ||
        cfg.additionalListRef === list.name ||
        cfg.watermarkListRef === list.name ||
        cfg.excludeTitleListRef === list.name
      );
    });
  }, [rules, list.name]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return list.items;
    const lower = itemSearch.toLowerCase();
    return list.items.filter((item) => item.value.toLowerCase().includes(lower));
  }, [list.items, itemSearch]);

  const regexCount = list.items.filter((i) => i.type === "regex").length;
  const exactCount = list.items.filter((i) => i.type === "exact").length;

  const handleCopyName = () => {
    navigator.clipboard.writeText(list.name);
    setCopiedName(true);
    setTimeout(() => setCopiedName(false), 1500);
  };

  return (
    <Card className="border border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">{list.displayName}</h3>
              <Badge className={`text-[10px] px-1.5 py-0 ${categoryColors[list.category] || "bg-zinc-100 text-zinc-700"}`}>
                {list.category}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <button
                onClick={handleCopyName}
                className="text-[11px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded flex items-center gap-1 hover:bg-muted transition-colors"
                title="Copy list name for rule config"
              >
                {copiedName ? <Check className="size-2.5" /> : <Copy className="size-2.5" />}
                {list.name}
              </button>
            </div>
            {list.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {list.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Hash className="size-3" />
                {list.itemCount} items
              </span>
              {exactCount > 0 && (
                <span className="flex items-center gap-1">
                  <Type className="size-3" />
                  {exactCount} exact
                </span>
              )}
              {regexCount > 0 && (
                <span className="flex items-center gap-1">
                  <Regex className="size-3" />
                  {regexCount} regex
                </span>
              )}
              {referencingRules.length > 0 && (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  Used by {referencingRules.length} rule{referencingRules.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => onEdit(list)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-border/50">
            {referencingRules.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Referenced by rules:</p>
                <div className="flex flex-wrap gap-1">
                  {referencingRules.map((r: any) => (
                    <Badge key={r._id} variant="outline" className="text-[10px]">
                      {r.displayName}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {list.items.length > 20 && (
              <div className="mb-2">
                <Input
                  placeholder="Search items..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto rounded-md bg-muted/30 p-2">
              <div className="grid gap-0.5">
                {filteredItems.slice(0, 100).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs py-0.5 px-1.5 rounded hover:bg-muted/50"
                  >
                    {item.type === "regex" ? (
                      <Regex className="size-3 text-purple-500 flex-shrink-0" />
                    ) : (
                      <Type className="size-3 text-emerald-500 flex-shrink-0" />
                    )}
                    <span className="font-mono text-[11px] truncate">{item.value}</span>
                  </div>
                ))}
                {filteredItems.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    ... and {filteredItems.length - 100} more items
                  </p>
                )}
                {filteredItems.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No items match your search
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateListDialog({
  open,
  onClose,
  existingCategories,
}: {
  open: boolean;
  onClose: () => void;
  existingCategories: string[];
}) {
  const createList = useMutation(api.lists.create);
  const suggestList = useAction(api.listsAi.suggestList);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai">("ai");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiSuggested, setAiSuggested] = useState(false);

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [bulkItems, setBulkItems] = useState("");
  const [bulkItemType, setBulkItemType] = useState<"exact" | "regex">("exact");
  // For AI-generated items that may have mixed types
  const [aiItems, setAiItems] = useState<ListItem[]>([]);

  const resetForm = () => {
    setName("");
    setDisplayName("");
    setDescription("");
    setCategory("");
    setCustomCategory("");
    setBulkItems("");
    setBulkItemType("exact");
    setAiDescription("");
    setAiSuggested(false);
    setAiItems([]);
  };

  // Auto-generate name from displayName
  const handleDisplayNameChange = (val: string) => {
    setDisplayName(val);
    if (!name || name === displayName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")) {
      setName(val.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, ""));
    }
  };

  const parseBulkItems = (): ListItem[] => {
    if (!bulkItems.trim()) return [];
    return bulkItems
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((value) => {
        const item: ListItem = { value, type: bulkItemType };
        if (bulkItemType === "regex") {
          const match = value.match(/^\/(.+)\/([gimsuy]*)$/);
          if (match) {
            item.pattern = match[1];
            item.flags = match[2] || undefined;
          } else {
            item.pattern = value;
          }
        }
        return item;
      });
  };

  const handleAiSuggest = async () => {
    if (!aiDescription.trim()) {
      toast.error("Please describe the list you want to create");
      return;
    }
    setAiLoading(true);
    try {
      const suggestion = await suggestList({ description: aiDescription });
      setName(suggestion.name || "");
      setDisplayName(suggestion.displayName || "");
      setDescription(suggestion.description || "");
      // Set category — use existing if matching, otherwise custom
      const suggestedCat = suggestion.category || "";
      if (existingCategories.includes(suggestedCat)) {
        setCategory(suggestedCat);
      } else if (suggestedCat) {
        setCategory("__custom");
        setCustomCategory(suggestedCat);
      }
      // Set items from AI
      const items: ListItem[] = (suggestion.items || []).map((item: any) => ({
        value: item.value,
        type: item.type || "exact",
        pattern: item.pattern,
        flags: item.flags,
      }));
      setAiItems(items);
      // Also populate bulk text for display/editing
      setBulkItems(items.map((i: ListItem) => i.value).join("\n"));
      setAiSuggested(true);
      toast.success(`AI generated a list with ${items.length} items — review and adjust before saving`);
    } catch (e: any) {
      toast.error("AI suggestion failed: " + (e.message || "Unknown error"));
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreate = async () => {
    const finalCategory = category === "__custom" ? customCategory.trim() : category;
    if (!name.trim() || !displayName.trim() || !finalCategory) {
      toast.error("Name, display name, and category are required");
      return;
    }
    setSaving(true);
    try {
      // If AI-suggested and bulk items haven't been manually changed, use aiItems (preserves mixed types)
      const items = aiSuggested && aiItems.length > 0
        ? aiItems
        : parseBulkItems();
      await createList({
        name: name.trim(),
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        category: finalCategory,
        source: aiSuggested ? "ai_generated" : "manual",
        items,
      });
      toast.success(`List "${name.trim()}" created with ${items.length} items`);
      resetForm();
      onClose();
    } catch (e: any) {
      toast.error("Failed to create list: " + e.message);
    }
    setSaving(false);
  };

  const previewCount = aiSuggested && aiItems.length > 0 ? aiItems.length : parseBulkItems().length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
          <DialogDescription>
            Create a moderation list manually or let AI generate one for you.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setMode("ai")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "ai"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5" /> AI Assisted
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === "manual"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="size-3.5" /> Manual
          </button>
        </div>

        {/* AI Assist mode - initial prompt */}
        {mode === "ai" && !aiSuggested && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Describe the list you want to create</label>
              <Textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={4}
                className="mt-1"
                placeholder="e.g., A list of Spanish cities in the Costa del Sol area for location-based moderation rules. Include major cities and popular resort towns."
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Be specific about: what items to include, the purpose of the list, and any patterns or categories.
              </p>
            </div>
            <Button
              onClick={handleAiSuggest}
              disabled={aiLoading || !aiDescription.trim()}
              className="w-full"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Generating list...
                </>
              ) : (
                <>
                  <Sparkles className="size-4 mr-2" />
                  Generate List with AI
                </>
              )}
            </Button>
          </div>
        )}

        {/* AI suggestion banner */}
        {mode === "ai" && aiSuggested && (
          <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <Sparkles className="size-4 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-purple-700 dark:text-purple-300">
                AI generated {aiItems.length} items
              </p>
              <p className="text-purple-600 dark:text-purple-400 mt-0.5">
                Review and adjust the fields below before saving.
              </p>
              <button
                onClick={() => {
                  setAiSuggested(false);
                  resetForm();
                }}
                className="text-purple-700 dark:text-purple-300 underline mt-1 hover:text-purple-900"
              >
                ← Start over
              </button>
            </div>
          </div>
        )}

        {/* Form fields (shown in manual mode or after AI suggestion) */}
        {(mode === "manual" || aiSuggested) && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Display Name *</label>
                <Input
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="e.g. Luxury Car Brands"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Internal Name *{" "}
                  <span className="text-muted-foreground font-normal">(used in rule config)</span>
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. luxury_car_brands"
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this list is used for..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Category *</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom">+ New category...</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {category === "__custom" && (
                <div>
                  <label className="text-sm font-medium">New Category Name</label>
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. yacht.brands"
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">
                  {aiSuggested ? "Generated Items" : "Initial Items"}{" "}
                  <span className="text-muted-foreground font-normal">(one per line)</span>
                </h4>
                <div className="flex items-center gap-2">
                  {previewCount > 0 && (
                    <span className="text-xs text-muted-foreground">{previewCount} items</span>
                  )}
                  {!aiSuggested && (
                    <Select value={bulkItemType} onValueChange={(v: any) => setBulkItemType(v)}>
                      <SelectTrigger className="w-24 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exact</SelectItem>
                        <SelectItem value="regex">Regex</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* If AI-suggested, show items with type badges */}
              {aiSuggested && aiItems.length > 0 ? (
                <div className="space-y-2">
                  <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/20 p-2">
                    <div className="grid gap-0.5">
                      {aiItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50 group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {item.type === "regex" ? (
                              <Regex className="size-3 text-purple-500 flex-shrink-0" />
                            ) : (
                              <Type className="size-3 text-emerald-500 flex-shrink-0" />
                            )}
                            <span className="font-mono text-[11px] truncate">{item.value}</span>
                          </div>
                          <button
                            onClick={() => {
                              setAiItems(aiItems.filter((_, i) => i !== idx));
                            }}
                            className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hover over items to remove them. You can also edit the list after creation.
                  </p>
                </div>
              ) : (
                <Textarea
                  value={bulkItems}
                  onChange={(e) => {
                    setBulkItems(e.target.value);
                    if (aiSuggested) setAiItems([]); // Clear AI items when manually editing
                  }}
                  placeholder={
                    bulkItemType === "exact"
                      ? "apartment\nvilla\npenthouse\nloft"
                      : "/\\bapartment\\b/i\n/\\bvilla\\b/i\n/\\bpenthouse\\b/i"
                  }
                  className="font-mono text-sm"
                  rows={6}
                />
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              resetForm();
              onClose();
            }}
          >
            Cancel
          </Button>
          {(mode === "manual" || aiSuggested) && (
            <Button onClick={handleCreate} disabled={saving || !name.trim() || !displayName.trim()}>
              {saving && <Loader2 className="size-3.5 animate-spin mr-1" />}
              <Plus className="size-3.5 mr-1" />
              Create List
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditListDialog({
  list,
  open,
  onClose,
}: {
  list: ModerationList | null;
  open: boolean;
  onClose: () => void;
}) {
  const updateList = useMutation(api.lists.update);
  const addItem = useMutation(api.lists.addItem);
  const removeItem = useMutation(api.lists.removeItem);
  const [newItemValue, setNewItemValue] = useState("");
  const [newItemType, setNewItemType] = useState<"exact" | "regex">("exact");
  const [saving, setSaving] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  const handleOpen = () => {
    if (list) {
      setEditDisplayName(list.displayName);
      setEditDescription(list.description || "");
    }
  };

  const handleSaveMetadata = async () => {
    if (!list) return;
    setSaving(true);
    try {
      await updateList({
        id: list._id,
        displayName: editDisplayName || undefined,
        description: editDescription || undefined,
      });
      toast.success("List updated");
    } catch (e: any) {
      toast.error("Failed to update list: " + e.message);
    }
    setSaving(false);
  };

  const handleAddItem = async () => {
    if (!list || !newItemValue.trim()) return;
    try {
      const item: ListItem = { value: newItemValue.trim(), type: newItemType };
      if (newItemType === "regex") {
        // Extract pattern from /pattern/flags format or use as-is
        const match = newItemValue.trim().match(/^\/(.+)\/([gimsuy]*)$/);
        if (match) {
          item.pattern = match[1];
          item.flags = match[2] || undefined;
        } else {
          item.pattern = newItemValue.trim();
        }
      }
      await addItem({ id: list._id, item });
      setNewItemValue("");
      toast.success("Item added");
    } catch (e: any) {
      toast.error("Failed to add item: " + e.message);
    }
  };

  const handleRemoveItem = async (idx: number) => {
    if (!list) return;
    try {
      await removeItem({ id: list._id, itemIndex: idx });
      toast.success("Item removed");
    } catch (e: any) {
      toast.error("Failed to remove item: " + e.message);
    }
  };

  if (!list) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
        else handleOpen();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit List: {list.name}</DialogTitle>
          <DialogDescription>
            {list.itemCount} items • {list.category}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3">
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <Button onClick={handleSaveMetadata} disabled={saving} size="sm">
              {saving && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Save Changes
            </Button>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Add Item</h4>
            <div className="flex gap-2">
              <Select value={newItemType} onValueChange={(v: any) => setNewItemType(v)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={newItemType === "regex" ? "/\\bpattern\\b/i" : "Value"}
                value={newItemValue}
                onChange={(e) => setNewItemValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                className="flex-1"
              />
              <Button onClick={handleAddItem} size="sm">
                <Plus className="size-3.5 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Items ({list.items.length})</h4>
            <div className="max-h-60 overflow-y-auto rounded-md border">
              {list.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 border-b last:border-0 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.type === "regex" ? (
                      <Regex className="size-3 text-purple-500 flex-shrink-0" />
                    ) : (
                      <Type className="size-3 text-emerald-500 flex-shrink-0" />
                    )}
                    <span className="text-xs font-mono truncate">{item.value}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 flex-shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveItem(idx)}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ListsPage() {
  const lists = useQuery(api.lists.list) as ModerationList[] | undefined;
  const rules = useQuery(api.rules.list) || [];
  const seedLists = useMutation(api.seedLists.seedAllLists);
  const deleteList = useMutation(api.lists.remove);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editList, setEditList] = useState<ModerationList | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [seeding, setSeeding] = useState(false); // kept for empty state seeding

  const categories = useMemo(() => {
    if (!lists) return [];
    return [...new Set(lists.map((l) => l.category))].sort();
  }, [lists]);

  const filteredLists = useMemo(() => {
    if (!lists) return [];
    return lists.filter((list) => {
      const matchesSearch =
        !searchQuery ||
        list.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        list.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (list.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || list.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [lists, searchQuery, categoryFilter]);

  const totalItems = useMemo(() => {
    return (lists || []).reduce((acc, l) => acc + l.itemCount, 0);
  }, [lists]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedLists();
      toast.success(`Seeded ${(result as any)?.inserted || 0} lists (replaced ${(result as any)?.deleted || 0})`);
    } catch (e: any) {
      toast.error("Failed to seed: " + e.message);
    }
    setSeeding(false);
  };

  const handleDelete = async (list: ModerationList) => {
    if (!confirm(`Delete list "${list.name}" with ${list.itemCount} items?`)) return;
    try {
      await deleteList({ id: list._id });
      toast.success("List deleted");
    } catch (e: any) {
      toast.error("Failed to delete: " + e.message);
    }
  };

  const handleExport = () => {
    if (!lists) return;
    const exportData = {
      meta: {
        exported: new Date().toISOString().split("T")[0],
        total_lists: lists.length,
        total_items: totalItems,
        categories,
      },
      lists: lists.map((l) => ({
        name: l.name,
        description: l.description,
        category: l.category,
        source: l.source,
        item_count: l.itemCount,
        items: l.items,
      })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `feedlens_lists_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Lists exported");
  };

  if (!lists) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <List className="size-6" />
            Moderation Lists
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lists.length} lists • {totalItems.toLocaleString()} total items • Referenced by rules for pattern matching
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-3.5 mr-1" />
            Export JSON
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="size-3.5 mr-1" />
            New List
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Lists", value: lists.length },
          { label: "Total Items", value: totalItems.toLocaleString() },
          { label: "Categories", value: categories.length },
          {
            label: "Used by Rules",
            value: lists.filter((l) =>
              rules.some(
                (r: any) =>
                  r.config?.listRef === l.name ||
                  r.config?.excludeListRef === l.name ||
                  r.config?.additionalListRef === l.name ||
                  r.config?.watermarkListRef === l.name ||
                  r.config?.excludeTitleListRef === l.name
              )
            ).length,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search lists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No Lists State */}
      {lists.length === 0 && (
        <Card className="py-12">
          <CardContent className="text-center">
            <List className="size-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No lists yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Seed the default moderation lists to get started
            </p>
            <Button onClick={handleSeed} disabled={seeding}>
              {seeding && <Loader2 className="size-4 animate-spin mr-2" />}
              Seed Default Lists
            </Button>
          </CardContent>
        </Card>
      )}

      {/* List Grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredLists.map((list) => (
          <ListCard
            key={list._id}
            list={list}
            rules={rules}
            onEdit={(l) => setEditList(l)}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {filteredLists.length === 0 && lists.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No lists match your search</p>
        </div>
      )}

      {/* Edit Dialog */}
      <EditListDialog
        list={editList}
        open={!!editList}
        onClose={() => setEditList(null)}
      />

      {/* Create Dialog */}
      <CreateListDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        existingCategories={categories}
      />
    </div>
  );
}
