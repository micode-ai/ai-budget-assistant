/**
 * The PATCH body for a category edit form.
 *
 * The form prefills the DISPLAY name, which for a standard category (keyed,
 * not renamed) is the catalog name in the UI language - not the stored `name`.
 * The server marks a keyed category renamed (`nameCustomized = true`) on any
 * PATCH whose `name` differs from the stored one, so echoing the prefilled
 * text back on a colour-only edit would read as a rename: the category would
 * stop following the UI language, frozen under whatever language the form
 * happened to show. `name` is therefore sent ONLY when the user changed the
 * text from what was prefilled - compared with the prefill, never with the
 * stored name.
 */
export interface CategoryEditInput {
  /** The text the form opened with (the display name). */
  prefilledName: string;
  /** The text in the field at save time. */
  typedName: string;
  color?: string;
  icon?: string;
  /** Present only when the parent changed; `null` clears it. */
  parentId?: string | null;
  parentChanged?: boolean;
}

export interface CategoryEditPayload {
  name?: string;
  color?: string;
  icon?: string;
  parentId?: string | null;
}

export function categoryEditPayload(input: CategoryEditInput): CategoryEditPayload {
  const typed = input.typedName.trim();
  const payload: CategoryEditPayload = { color: input.color, icon: input.icon };
  if (typed !== input.prefilledName.trim()) payload.name = typed;
  if (input.parentChanged) payload.parentId = input.parentId ?? null;
  return payload;
}
