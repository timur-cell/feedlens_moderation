import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  ListChecks,
  CheckCheck,
  Shield,
  List as ListIcon,
  MessageSquare,
  Users,
  Settings,
  ScanSearch,
  Image as ImageIcon,
  Moon,
  Sun,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTheme } from "@/contexts/ThemeContext";
import { openInspect } from "@/components/InspectPanel";

// ⌘K "Inspect or jump" palette. Tools are verbs, not places (design principle):
// the two former AI-tool destinations are reachable here as actions, alongside
// fast navigation to every screen.

const EVENT = "feedlens:open-command-palette";

/** Open the palette from anywhere (e.g. the sidebar Inspect entry). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

const JE_ID_RE = /^\d{6,}$/;
const URL_RE = /^https?:\/\//i;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { theme, toggleTheme, switchable } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENT, onOpen);
    };
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const inspect = (q = "") => {
    setOpen(false);
    setQuery("");
    openInspect(q);
  };

  const trimmed = query.trim();
  const looksLikeListing = JE_ID_RE.test(trimmed) || URL_RE.test(trimmed);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Inspect a listing (paste URL or JE ID) or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {looksLikeListing && (
          <>
            <CommandGroup heading="Inspect">
              <CommandItem value={`inspect ${trimmed}`} onSelect={() => inspect(trimmed)}>
                <ScanSearch />
                <span>
                  Inspect <span className="font-mono">{trimmed}</span>
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          <CommandItem value="overview dashboard queue health" onSelect={() => go("/dashboard")}>
            <LayoutGrid />
            <span>Overview</span>
          </CommandItem>
          <CommandItem value="queue review manual" onSelect={() => go("/queue")}>
            <ListChecks />
            <span>Queue</span>
          </CommandItem>
          <CommandItem value="decisions moderation log history" onSelect={() => go("/moderation-log")}>
            <CheckCheck />
            <span>Decisions</span>
          </CommandItem>
          <CommandItem value="rules policy" onSelect={() => go("/rules")}>
            <Shield />
            <span>Rules</span>
          </CommandItem>
          <CommandItem value="lists" onSelect={() => go("/lists")}>
            <ListIcon />
            <span>Lists</span>
          </CommandItem>
          <CommandItem value="messages templates" onSelect={() => go("/messages")}>
            <MessageSquare />
            <span>Messages</span>
          </CommandItem>
          <CommandItem value="team users moderators" onSelect={() => go("/settings?tab=team")}>
            <Users />
            <span>Team</span>
          </CommandItem>
          <CommandItem value="settings system ai alerts" onSelect={() => go("/settings")}>
            <Settings />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tools">
          <CommandItem value="inspect listing url je id moderate by id" onSelect={() => inspect()}>
            <ScanSearch />
            <span>Inspect a listing by URL / JE ID</span>
          </CommandItem>
          <CommandItem value="image recognition vision analyze" onSelect={() => go("/image-recognition")}>
            <ImageIcon />
            <span>Image recognition</span>
          </CommandItem>
          {switchable && (
            <CommandItem
              value="toggle theme dark light mode"
              onSelect={() => {
                toggleTheme();
                setOpen(false);
              }}
            >
              {theme === "light" ? <Moon /> : <Sun />}
              <span>{theme === "light" ? "Switch to dark mode" : "Switch to light mode"}</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
