/**
 * Who claimed which receipt line, for the split creation screen.
 *
 * A line can be claimed by SEVERAL people — a bottle shared by the table is
 * the ordinary case, not an edge case — so the map holds a list per line
 * rather than a single id. The server has always supported this
 * (`resolveItemSplit` divides a line equally among its claimants and
 * `CreateSplitDto` puts no uniqueness constraint across participants); it was
 * only ever this screen that could not express it.
 *
 * Pure and unit-tested. `AssignmentEditor.tsx` owns the state and calls these.
 */

/** itemId -> ids of everyone who claimed it. A line absent here stays with the payer. */
export type ItemAssignments = Record<string, string[]>;

/**
 * Adds or removes one person's claim on one line, leaving the rest untouched.
 * A line nobody claims any more drops out of the map entirely, so "assigned to
 * nobody" has exactly one representation rather than two.
 */
export function toggleItemAssignment(
  assignments: ItemAssignments,
  itemId: string,
  participantId: string,
): ItemAssignments {
  const current = assignments[itemId] ?? [];
  const next = current.includes(participantId)
    ? current.filter((id) => id !== participantId)
    : [...current, participantId];

  const updated = { ...assignments };
  if (next.length === 0) {
    delete updated[itemId];
  } else {
    updated[itemId] = next;
  }
  return updated;
}

/** Drops a removed participant from every line they had claimed. */
export function removeParticipantFromAssignments(
  assignments: ItemAssignments,
  participantId: string,
): ItemAssignments {
  const updated: ItemAssignments = {};
  for (const [itemId, ids] of Object.entries(assignments)) {
    const kept = ids.filter((id) => id !== participantId);
    if (kept.length > 0) updated[itemId] = kept;
  }
  return updated;
}

export function assigneesForItem(assignments: ItemAssignments, itemId: string): string[] {
  return assignments[itemId] ?? [];
}

/** The `itemIds` this participant contributes to `CreateSplitDto`. */
export function itemIdsForParticipant(assignments: ItemAssignments, participantId: string): string[] {
  return Object.entries(assignments)
    .filter(([, ids]) => ids.includes(participantId))
    .map(([itemId]) => itemId);
}

/**
 * Badge label for a line's claimants: the first name alone, or `Name +N` once
 * several people share it. Deliberately format-only and language-neutral — the
 * badge is a narrow, single-line slot, and spelling out three names there would
 * truncate to something less informative than the count.
 */
export function assigneeLabel(assignments: ItemAssignments, itemId: string, nameById: Map<string, string>): string | null {
  const names = assigneesForItem(assignments, itemId)
    .map((id) => nameById.get(id))
    .filter((name): name is string => !!name);

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
