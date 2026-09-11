/**
 * Groups registered shortcut descriptors by their description text, so the
 * `?` help overlay shows one row ("Move between rows — ↑ ↓") instead of two
 * identical-looking rows for `arrowup` and `arrowdown`.
 *
 * Pure and DOM-free, tested directly — see `shortcutRegistry.ts`'s doc
 * comment for why this whole feature keeps its decisions out of components.
 */

export interface ShortcutDescriptor {
  combo: string;
  description?: string;
}

export interface ShortcutDisplayGroup {
  description: string;
  combos: string[];
}

/**
 * A registration with no `description` is a real, active binding (it can
 * still fire) that simply isn't advertised — filtered out here, not an
 * oversight. Combos within a group are de-duplicated and groups are ordered
 * by first-seen description, so the list is stable across re-renders as long
 * as the underlying registrations don't change order.
 */
export function groupShortcutDescriptors(descriptors: ShortcutDescriptor[]): ShortcutDisplayGroup[] {
  const order: string[] = [];
  const combosByDescription = new Map<string, string[]>();

  for (const { combo, description } of descriptors) {
    if (!description) continue;
    let combos = combosByDescription.get(description);
    if (!combos) {
      combos = [];
      combosByDescription.set(description, combos);
      order.push(description);
    }
    if (!combos.includes(combo)) combos.push(combo);
  }

  return order.map((description) => ({ description, combos: combosByDescription.get(description)! }));
}
