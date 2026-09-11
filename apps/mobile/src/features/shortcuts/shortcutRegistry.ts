/**
 * Module-level registry of active desktop-web keyboard shortcuts.
 *
 * Pure and DOM-free on purpose: `useDesktopShortcuts.ts` is the only file
 * that touches `document`, so everything decided here — which combo wins,
 * whether an editable target blocks it — is testable with plain objects, per
 * `docs/contracts/desktop-web-design-language.md`'s "nothing in this repo
 * renders a component in CI" rule.
 *
 * A screen registers its own bindings while mounted and unregisters on
 * unmount (`useDesktopShortcut`, in the hook file) — "screens register/
 * unregister their own key actions on focus", per the product idea's sketch
 * — rather than one god switch statement enumerating every screen's keys.
 */

export interface ShortcutRegistration {
  id: number;
  combo: string;
  handler: (event: ShortcutHandlerEvent) => void;
  /** Human-readable label for the `?` help overlay. Omitted for a binding
   *  that shouldn't be advertised (there are none today, but the shape
   *  allows one later without a second registration mechanism). */
  description?: string;
  /** When true, this binding still fires even while the keyboard focus is
   *  inside a text input/textarea/contenteditable node. Defaults to false —
   *  see `isEditableTarget` in `shortcutCombo.ts`. */
  allowInInput: boolean;
}

/** The subset of a real `KeyboardEvent` a registered handler receives. */
export interface ShortcutHandlerEvent {
  preventDefault: () => void;
}

let nextId = 1;
// Reassigned (never mutated in place) on every register/unregister so
// `useSyncExternalStore`'s snapshot equality check works correctly for the
// help overlay — see `useRegisteredShortcuts` in the hook file.
let registrations: ShortcutRegistration[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function registerShortcut(
  registration: Omit<ShortcutRegistration, 'id'>
): number {
  const id = nextId++;
  registrations = [...registrations, { ...registration, id }];
  notify();
  return id;
}

export function unregisterShortcut(id: number): void {
  registrations = registrations.filter((r) => r.id !== id);
  notify();
}

export function subscribeShortcuts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShortcutSnapshot(): ShortcutRegistration[] {
  return registrations;
}

/**
 * Decide which registration (if any) should fire for a normalized combo.
 *
 * **Most-recently-registered wins** — the last entry in the array with a
 * matching combo, searched from the end. This is what lets a dialog mounted
 * on top of a screen "win" a combo the screen behind it also registered,
 * with no explicit priority system: mount order already reflects what's on
 * top, since a dialog mounts after the screen that opened it.
 *
 * **An editable target blocks the match outright — it does not fall through
 * to an older registration of the same combo.** Typing `n` while naming a
 * category must type an "n", never silently trigger some OTHER screen's `n`
 * binding underneath the one that's blocked.
 */
export function resolveShortcutHandler(
  combo: string,
  isInputTarget: boolean,
  regs: ShortcutRegistration[] = registrations
): ShortcutRegistration | null {
  for (let i = regs.length - 1; i >= 0; i--) {
    const reg = regs[i];
    if (reg.combo !== combo) continue;
    if (isInputTarget && !reg.allowInInput) return null;
    return reg;
  }
  return null;
}

/** Test-only: clears every registration between suites so one test's
 *  `registerShortcut` calls can't leak into the next. Not used by app code. */
export function __resetShortcutRegistryForTests(): void {
  registrations = [];
  nextId = 1;
}
