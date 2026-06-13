import { useEffect, useRef } from "react";

// Queue-scoped keyboard handler. Implements the review-loop key map once:
//   J / K  next / prev        A / R / N / S  decide        F  focus
//   Esc  exit / close         ← / →  browse images         ?  shortcut sheet
//
// Guards against firing while a text input, textarea or contenteditable is
// focused (so typing a note or a search never triggers a decision), and skips
// when a modifier is held (⌘K etc. is handled separately).

export type KeyHandlers = Partial<{
  next: () => void; // J / ArrowDown
  prev: () => void; // K / ArrowUp
  approve: () => void; // A
  approveForever: () => void; // Shift+A — approve and lock against re-moderation
  reject: () => void; // R
  notice: () => void; // N
  skip: () => void; // S
  focus: () => void; // F
  escape: () => void; // Esc
  prevImage: () => void; // ArrowLeft
  nextImage: () => void; // ArrowRight
  zoom: () => void; // Z
  help: () => void; // ?
  undo: () => void; // U
}>;

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Radix Select / dropdown triggers render as a button with role="combobox"
  // (or aria-haspopup). Treat them as editable so A/R/N/S/F don't fire a real
  // moderation decision while a Rule/Country/Sort/Template/Reason facet is focused.
  if (el.getAttribute("role") === "combobox" ||
      el.closest('[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"]')) {
    return true;
  }
  // Radix dialogs/menus set role; let their own handlers run.
  if (el.closest('[role="menu"],[role="listbox"],[role="dialog"] input,[role="dialog"] textarea')) {
    // still allow Esc through (handled below via the raw key)
    return tag === "INPUT" || tag === "TEXTAREA";
  }
  return false;
}

export function useQueueKeyboard(handlers: KeyHandlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const h = ref.current;
      const editable = isEditableTarget(e.target);

      // Escape always works (closes overlays / dialogs) even from a field.
      if (e.key === "Escape") {
        if (h.escape) {
          h.escape();
          // don't preventDefault — let dialogs also close naturally
        }
        return;
      }

      if (editable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const fire = (fn?: () => void) => {
        if (!fn) return;
        e.preventDefault();
        fn();
      };

      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          fire(h.next);
          break;
        case "k":
        case "K":
        case "ArrowUp":
          fire(h.prev);
          break;
        case "a":
        case "A":
          fire(e.shiftKey ? (h.approveForever ?? h.approve) : h.approve);
          break;
        case "r":
        case "R":
          fire(h.reject);
          break;
        case "n":
        case "N":
          fire(h.notice);
          break;
        case "s":
        case "S":
          fire(h.skip);
          break;
        case "f":
        case "F":
          fire(h.focus);
          break;
        case "u":
        case "U":
          fire(h.undo);
          break;
        case "z":
        case "Z":
          fire(h.zoom);
          break;
        case "ArrowLeft":
          fire(h.prevImage);
          break;
        case "ArrowRight":
          fire(h.nextImage);
          break;
        case "?":
          fire(h.help);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
