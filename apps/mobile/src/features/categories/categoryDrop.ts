import type { Category } from '@budget/shared-types';
import { isDepositCategoryName } from '@budget/shared-utils';
import { hasLiveChildren } from './parentCandidates';

export type DropRefusal =
  | 'hasChildren'
  | 'targetNotTopLevel'
  | 'self'
  | 'typeMismatch'
  | 'deposit'
  | 'alreadyThere';

/**
 * Why `dragged` may not be filed under `target`, or null when it may. Mirrors
 * the server's `assertValidParent` (plus `alreadyThere`, a no-op drop).
 */
export function refuseParentDrop(
  categories: Category[],
  dragged: Category,
  target: Category,
): DropRefusal | null {
  if (dragged.id === target.id) return 'self';
  if (dragged.type !== target.type) return 'typeMismatch';
  if (isDepositCategoryName(dragged.name) || isDepositCategoryName(target.name)) return 'deposit';
  if (target.parentId) return 'targetNotTopLevel';
  if (hasLiveChildren(categories, dragged.id)) return 'hasChildren';
  if (dragged.parentId === target.id) return 'alreadyThere';
  return null;
}

export interface RowLayout {
  categoryId: string;
  depth: 0 | 1;
  top: number;
  height: number;
}

export type DropTarget = { kind: 'parent'; categoryId: string } | { kind: 'topLevel' };

/**
 * Row layouts measured at lift time, in the list's own layout space. On web
 * `onLayout` fires only when a row's SIZE changes (react-native-web uses a
 * ResizeObserver), so a row that only moved — every re-parent moves one — keeps
 * a stale top until it is measured again.
 */
export function rowLayoutsFromWindow(
  containerTop: number,
  rects: { categoryId: string; depth: 0 | 1; y: number; height: number }[]
): RowLayout[] {
  return rects
    .map(({ categoryId, depth, y, height }) => ({ categoryId, depth, top: y - containerTop, height }))
    .sort((a, b) => a.top - b.top);
}

/**
 * Swallows the one press that follows a drag. On web a row's `onPress` comes
 * from the browser's native `click`, which still fires when a mouse drag is
 * released over the lifted row (it follows the pointer), so without this the
 * drop would also open the category's edit form.
 */
export function createClickGuard() {
  let armed = false;
  return {
    arm: () => {
      armed = true;
    },
    reset: () => {
      armed = false;
    },
    consume: (): boolean => {
      const was = armed;
      armed = false;
      return was;
    },
  };
}

/**
 * Where the "back to top level" lines sit: the top of every top-level row and
 * the bottom of the last row.
 */
export function gapBoundaries(rows: RowLayout[]): number[] {
  const boundaries: number[] = [];
  rows.forEach((row) => {
    if (row.depth === 0) boundaries.push(row.top);
  });
  const last = rows[rows.length - 1];
  if (last) boundaries.push(last.top + last.height);
  return boundaries;
}

/** Pixels either side of a boundary before a top-level row / after the last row. */
export const GAP_HALF = 10;

/**
 * Resolves a pointer position to a drop target. `rows` holds one section
 * (expense or income) only. For a subcategory drag a gap band wins over the
 * row it overlaps; a top-level drag ignores gap bands entirely.
 */
export function dropTargetAt(
  y: number,
  rows: RowLayout[],
  dragged: Category,
  categories: Category[],
): DropTarget | null {
  const boundaries = gapBoundaries(rows);

  // A top-level drag can never go "back to top level", so its gap bands would
  // only steal the edges of the rows it can be dropped on: skip them.
  if (dragged.parentId && boundaries.some((b) => Math.abs(y - b) <= GAP_HALF)) {
    return { kind: 'topLevel' };
  }

  const row = rows.find((r) => y >= r.top && y < r.top + r.height);
  if (!row || row.depth !== 0) return null;
  const target = categories.find((c) => c.id === row.categoryId);
  if (!target) return null;
  return refuseParentDrop(categories, dragged, target) === null
    ? { kind: 'parent', categoryId: target.id }
    : null;
}

/** The refusals worth telling the user about; `self`/`alreadyThere` are silent no-ops. */
export type ShownDropRefusal = Exclude<DropRefusal, 'self' | 'alreadyThere'>;

/**
 * Why releasing at `y` does nothing, when the row under the pointer refused
 * the drop - or null when there is no message to show (a valid target, a gap
 * line, empty space, the row itself or its current parent).
 */
export function refusalAt(
  y: number,
  rows: RowLayout[],
  dragged: Category,
  categories: Category[],
): ShownDropRefusal | null {
  if (dropTargetAt(y, rows, dragged, categories)) return null;
  const row = rows.find((r) => y >= r.top && y < r.top + r.height);
  if (!row) return null;
  const target = categories.find((c) => c.id === row.categoryId);
  if (!target) return null;
  const refusal = refuseParentDrop(categories, dragged, target);
  return refusal === 'self' || refusal === 'alreadyThere' ? null : refusal;
}

/**
 * The `updateCategory` body for a drop: the parent change and nothing else.
 *
 * Deliberately not `categoryEditPayload`: that builder always sets the `color`
 * and `icon` keys (the form always has both), and the store merges the body
 * over the local row - a drop that passed `color: undefined` would blank the
 * row's colour locally. The `parentId` field has the same shape as the form's
 * (`null` clears the parent).
 */
export function dropPayload(target: DropTarget): { parentId: string | null } {
  return { parentId: target.kind === 'parent' ? target.categoryId : null };
}
