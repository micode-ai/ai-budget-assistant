/**
 * Pure keyboard-combo helpers for the desktop web app's global shortcuts.
 *
 * Kept apart from the registry and the React hook because nothing in this
 * repo renders a component in CI (see
 * `docs/contracts/desktop-web-design-language.md`) — this file is the only
 * place a mistake in "which key did the user press" or "is this an editable
 * field" can be caught before a human sees it.
 */

/** The subset of a real `KeyboardEvent` this module actually reads. Kept
 *  narrow and structural (not `KeyboardEvent` itself) so it's testable with
 *  a plain object — no DOM, no jsdom event construction required. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** The subset of a real `EventTarget`/`Element` this module actually reads. */
export interface ShortcutEventTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * Named keys that don't read well as their raw `event.key` value in a combo
 * string (`" "`, `"ArrowUp"`, ...). Everything else falls through to a plain
 * lowercase of `event.key`, which already covers letters, digits, `/`, and
 * `?` (a browser reports `key: "?"` directly — it has already applied Shift
 * for us, so this module never needs to reason about a `shift` modifier).
 */
const NAMED_KEYS: Record<string, string> = {
  ' ': 'space',
  Escape: 'escape',
  Enter: 'enter',
  ArrowUp: 'arrowup',
  ArrowDown: 'arrowdown',
  ArrowLeft: 'arrowleft',
  ArrowRight: 'arrowright',
};

/**
 * Normalize a keyboard event into a canonical combo string: `"n"`, `"/"`,
 * `"?"`, `"mod+k"`, `"arrowup"`, `"space"`. `"mod"` is Ctrl OR Cmd, never
 * both spelled out separately — this app has no binding that cares which
 * platform's modifier key was used, only that ONE of them was held, so a
 * single canonical prefix keeps every binding one string instead of two.
 */
export function normalizeShortcutEvent(event: ShortcutKeyEvent): string {
  const rawKey = event.key ?? '';
  const key = NAMED_KEYS[rawKey] ?? rawKey.toLowerCase();
  const mod = event.ctrlKey || event.metaKey;
  return mod ? `mod+${key}` : key;
}

/**
 * True when the given target is a place ordinary typing should reach —
 * an `<input>`/`<textarea>`/`<select>` or a `contenteditable` node. Every
 * global shortcut is gated on this by default (`allowInInput` opts a
 * specific binding out), or pressing `n` while naming a new category would
 * silently eat the letter instead of typing it.
 */
export function isEditableTarget(target: ShortcutEventTarget | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function partLabel(part: string): string {
  switch (part) {
    case 'arrowup':
      return '↑';
    case 'arrowdown':
      return '↓';
    case 'arrowleft':
      return '←';
    case 'arrowright':
      return '→';
    case 'space':
      return 'Space';
    case 'escape':
      return 'Esc';
    case 'enter':
      return 'Enter';
    default:
      return part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1);
  }
}

/**
 * Human-readable label for a combo string, for the `?` help overlay only —
 * never fed back into `normalizeShortcutEvent`. Deliberately supports just
 * the one modifier this app actually uses (`mod+`); a combo this doesn't
 * recognise degrades to `partLabel` on the whole string rather than
 * throwing, since a display helper should never be the thing that crashes
 * the overlay it renders.
 */
export function formatComboForDisplay(combo: string, isMac: boolean): string {
  if (combo.startsWith('mod+')) {
    const rest = combo.slice('mod+'.length);
    return isMac ? `⌘${partLabel(rest)}` : `Ctrl+${partLabel(rest)}`;
  }
  return partLabel(combo);
}
