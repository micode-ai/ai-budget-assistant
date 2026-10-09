import type {
  GroupExpense,
  GroupExpenseItemInputDto,
  GroupExpenseItemsView,
  GroupExpenseItemView,
} from '@budget/shared-types';
import { BP_FULL, type ItemShares } from '@/components/split/itemShares';
import type { ItemAssignments } from '@/components/split/itemAssignments';
import { MAX_DESCRIPTION_LENGTH, MAX_GROUP_AMOUNT } from './groupSplit';

/**
 * Pure logic for itemised group expenses in the app (ABA-656): the line editor's draft, its
 * validation (a mirror of the server's `validateItemLines` in `apps/api/src/modules/groups/group-items.ts`,
 * so Save is disabled with a reason instead of surfacing a raw 400 ITEMS_INVALID), turning a scanned
 * receipt into lines, the claim window's display state, and the "your part" preview of an unsaved
 * claim change. The SERVER resolves the real shares; nothing here is written to the ledger.
 * Unit-tested because nothing renders in CI.
 */

export const MAX_GROUP_ITEMS = 100;
export const MAX_ITEM_NAME_LENGTH = 120;

const cents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** One line as typed. `key` is a client-only React key; `id` is the server line (edits only). */
export interface ItemLineDraft {
  key: string;
  id?: string;
  name: string;
  priceText: string;
  discountText: string;
}

export type ItemsIssue =
  | 'itemsEmpty'
  | 'itemsTooMany'
  | 'itemName'
  | 'itemPrice'
  | 'itemLineDiscount'
  | 'itemDiscount'
  | 'itemsExceedAmount';

/** A typed money value: blank = 0, otherwise a finite non-negative number with at most 2 decimals. */
function parseMoney(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > MAX_GROUP_AMOUNT) return null;
  if (Math.abs(cents(n) - n * 100) > 1e-6) return null;
  return n;
}

/** The net of one line (price minus its own discount), 0 when it does not parse. */
export function lineNet(line: Pick<ItemLineDraft, 'priceText' | 'discountText'>): number {
  const price = parseMoney(line.priceText) ?? 0;
  const disc = parseMoney(line.discountText) ?? 0;
  return Math.max(0, round2(price - disc));
}

/** Sum of the lines' nets minus the receipt discount: what the lines cost together. */
export function linesTotal(lines: ItemLineDraft[], discountText: string): number {
  const net = lines.reduce((s, l) => s + cents(lineNet(l)), 0);
  const disc = cents(parseMoney(discountText) ?? 0);
  return Math.max(0, (net - disc) / 100);
}

/** Why the lines cannot be saved against `amount` (the entry-currency total), or null. */
export function validateItemDrafts(lines: ItemLineDraft[], discountText: string, amount: number): ItemsIssue | null {
  if (lines.length === 0) return 'itemsEmpty';
  if (lines.length > MAX_GROUP_ITEMS) return 'itemsTooMany';
  let net = 0;
  for (const l of lines) {
    const name = l.name.trim();
    if (name.length === 0 || name.length > MAX_ITEM_NAME_LENGTH) return 'itemName';
    if (l.priceText.trim() === '') return 'itemPrice';
    const price = parseMoney(l.priceText);
    if (price === null) return 'itemPrice';
    const d = parseMoney(l.discountText);
    if (d === null || cents(d) > cents(price)) return 'itemLineDiscount';
    net += cents(price) - cents(d);
  }
  const disc = parseMoney(discountText);
  if (disc === null) return 'itemDiscount';
  const discC = cents(disc);
  if (discC > 0 && discC >= net) return 'itemDiscount';
  if (net - discC > cents(amount)) return 'itemsExceedAmount';
  return null;
}

/** The request lines. Call only after `validateItemDrafts` returned null. */
export function buildItemInputs(lines: ItemLineDraft[]): GroupExpenseItemInputDto[] {
  return lines.map((l) => {
    const d = parseMoney(l.discountText) ?? 0;
    return {
      ...(l.id ? { id: l.id } : {}),
      name: l.name.trim(),
      totalPrice: parseMoney(l.priceText) ?? 0,
      ...(d > 0 ? { lineDiscount: d } : {}),
    };
  });
}

/** The receipt discount for the body: a positive number, or undefined (create) / null (edit) when none. */
export function buildDiscountValue(discountText: string, editing: boolean): number | null | undefined {
  const d = parseMoney(discountText) ?? 0;
  if (d > 0) return d;
  return editing ? null : undefined;
}

/** A stored number as input text; zero and none read as an empty field. */
const toText = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? '' : String(n));

/** An edited itemised expense's lines, as stored (server order). */
export function draftsFromView(
  items: Pick<GroupExpenseItemView, 'id' | 'name' | 'totalPrice' | 'lineDiscount' | 'position'>[],
): ItemLineDraft[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ key: i.id, id: i.id, name: i.name, priceText: String(i.totalPrice), discountText: toText(i.lineDiscount) }));
}

export interface ScannedLine {
  description: string;
  totalPrice: number;
}

/**
 * Lines from an OCR scan. A negative line is a discount printed under the item it belongs to, so it
 * folds into the previous kept line's discount (capped at that line's price); one with no line
 * above it, or the part a line cannot absorb, goes to the receipt discount. Zero and unreadable
 * lines are dropped; names are trimmed to the server's 120 characters; at most 100 lines.
 */
export function linesFromScan(
  scanned: ScannedLine[],
  receiptDiscount: number | null | undefined,
  makeKey: (index: number) => string,
): { lines: ItemLineDraft[]; discountText: string } {
  const kept: { name: string; price: number; discount: number }[] = [];
  let basket = cents(receiptDiscount && receiptDiscount > 0 ? receiptDiscount : 0);
  for (const s of scanned) {
    const p = Number(s.totalPrice);
    if (!Number.isFinite(p) || cents(p) === 0) continue;
    if (p < 0) {
      let off = cents(-p);
      const prev = kept[kept.length - 1];
      if (prev) {
        const room = cents(prev.price) - cents(prev.discount);
        const take = Math.min(room, off);
        prev.discount = (cents(prev.discount) + take) / 100;
        off -= take;
      }
      basket += off;
      continue;
    }
    if (kept.length >= MAX_GROUP_ITEMS) continue;
    const name = (s.description ?? '').trim().slice(0, MAX_ITEM_NAME_LENGTH);
    kept.push({ name, price: round2(p), discount: 0 });
  }
  return {
    lines: kept.map((k, i) => ({
      key: makeKey(i),
      name: k.name,
      priceText: String(k.price),
      discountText: toText(k.discount),
    })),
    discountText: toText(basket / 100),
  };
}

/** The form's own checks for an itemised expense, in the order the screen reports them. */
export function validateItemizedForm(input: {
  description: string;
  amount: number;
  paidByMemberId: string | null;
  lines: ItemLineDraft[];
  discountText: string;
}): { ok: boolean; issue: ItemsIssue | 'amount' | 'description' | 'payer' | null } {
  const description = input.description.trim();
  if (description.length === 0 || description.length > MAX_DESCRIPTION_LENGTH) return { ok: false, issue: 'description' };
  if (!(input.amount > 0) || input.amount > MAX_GROUP_AMOUNT) return { ok: false, issue: 'amount' };
  if (!input.paidByMemberId) return { ok: false, issue: 'payer' };
  const issue = validateItemDrafts(input.lines, input.discountText, input.amount);
  return issue ? { ok: false, issue } : { ok: true, issue: null };
}

/** 400 ITEMS_INVALID: the server refused the lines (a stale form, or a rule this mirror missed). */
export function isItemsInvalid(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return !!err && err.status === 400 && err.code === 'ITEMS_INVALID';
}

/** 409 CLAIMS_CLOSED: the window ended (or was closed) while the screen was open. */
export function isClaimsClosed(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return !!err && err.status === 409 && err.code === 'CLAIMS_CLOSED';
}

/** 429 CLAIMS_BUSY: too many claim changes on this receipt in the last hour (server ABA-655 M1). */
export function isClaimsBusy(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return !!err && err.status === 429 && err.code === 'CLAIMS_BUSY';
}

/** 400 CLAIM_SHARE_INVALID: a line's explicit shares are out of range or exceed 100%. */
export function isClaimShareInvalid(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null;
  return !!err && err.status === 400 && err.code === 'CLAIM_SHARE_INVALID';
}

// ------------------------------------------------------------------ the claim window

const DAY_MS = 24 * 3600 * 1000;

export interface ClaimWindowState {
  itemized: boolean;
  open: boolean;
  /** Null when not itemised. */
  until: Date | null;
  /** Whole days left, rounded up; 0 when closed. */
  daysLeft: number;
}

/** Display state of an expense's claim window. Mirrors the server's `isClaimsOpen`. */
export function claimWindow(
  expense: Pick<GroupExpense, 'itemized' | 'claimsOpenUntil'>,
  now: Date = new Date(),
): ClaimWindowState {
  if (!expense.itemized || !expense.claimsOpenUntil) {
    return { itemized: !!expense.itemized, open: false, until: null, daysLeft: 0 };
  }
  const until = new Date(expense.claimsOpenUntil);
  const ms = until.getTime() - now.getTime();
  const open = Number.isFinite(ms) && ms > 0;
  return { itemized: true, open, until, daysLeft: open ? Math.ceil(ms / DAY_MS) : 0 };
}

/** Where tapping an expense row goes: an itemised one opens its claims (every member may claim). */
export function expenseRowTarget(
  expense: Pick<GroupExpense, 'itemized' | 'deletedAt'>,
  canModify: boolean,
  canWrite: boolean,
): 'claims' | 'edit' | null {
  if (expense.deletedAt !== null) return null;
  if (expense.itemized) return 'claims';
  return canWrite && canModify ? 'edit' : null;
}

// ------------------------------------------------------------------ claims view

/** A line is hand-split once any claim on it carries an explicit share. */
export function isHandSplit(item: Pick<GroupExpenseItemView, 'claims'>): boolean {
  return item.claims.some((c) => c.shareBp !== null);
}

/** The line ids the member claims now (the starting point of "my lines"). */
export function myClaimedIds(view: Pick<GroupExpenseItemsView, 'items'>, memberId: string): string[] {
  return view.items.filter((i) => i.claims.some((c) => c.memberId === memberId)).map((i) => i.id);
}

/** Toggle one line in "my lines". */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** Same set, order-insensitive: an unchanged draft disables Save. */
export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * "Your part" of each line if the member's claims became `draftIds`, in the item currency. Mirrors
 * `resolveItemSplit`: a line divides equally among its claimants, a hand-split line gives the member
 * their explicit share (none = nothing), and a basket discount strictly between 0 and the lines' net
 * sum scales everything. The total floors once, as the server does; lines are rounded for display.
 * A preview only: the server's `myPart` replaces it after the save.
 */
export function previewMyParts(
  view: Pick<GroupExpenseItemsView, 'items' | 'discountAmount'>,
  memberId: string,
  draftIds: string[],
): { parts: Record<string, number>; total: number } {
  const want = new Set(draftIds);
  const nets = new Map(view.items.map((i) => [i.id, Math.max(0, cents(i.totalPrice) - cents(i.lineDiscount ?? 0))]));
  const netSum = [...nets.values()].reduce((s, c) => s + c, 0);
  const disc = cents(view.discountAmount ?? 0);
  const factor = disc > 0 && netSum > 0 && disc < netSum ? (netSum - disc) / netSum : 1;
  const parts: Record<string, number> = {};
  let raw = 0;
  for (const item of view.items) {
    if (!want.has(item.id)) continue;
    const others = item.claims.filter((c) => c.memberId !== memberId);
    const mine = item.claims.find((c) => c.memberId === memberId);
    const hand = isHandSplit(item);
    const fraction = hand ? Math.min(BP_FULL, Math.max(0, mine?.shareBp ?? 0)) / BP_FULL : 1 / (others.length + 1);
    const c = (nets.get(item.id) ?? 0) * fraction;
    raw += c;
    parts[item.id] = Math.round(c * factor) / 100;
  }
  return { parts, total: Math.floor(raw * factor) / 100 };
}

/** The managers' editor state seeded from the stored claims. */
export function assignmentsFromView(view: Pick<GroupExpenseItemsView, 'items'>): {
  assignments: ItemAssignments;
  shares: ItemShares;
} {
  const assignments: ItemAssignments = {};
  const shares: ItemShares = {};
  for (const item of view.items) {
    if (item.claims.length === 0) continue;
    assignments[item.id] = item.claims.map((c) => c.memberId);
    if (isHandSplit(item)) {
      const line: Record<string, number> = {};
      for (const c of item.claims) line[c.memberId] = c.shareBp ?? 0;
      shares[item.id] = line;
    }
  }
  return { assignments, shares };
}

/**
 * The `PUT .../claims` body from the managers' editor: one entry per member in `memberIds` (the
 * live members, plus anyone holding a claim), each with their full line set and their FULL share
 * map (an empty map = every line divides equally). A share is sent only for a line the member
 * claims, which is what the server requires.
 */
export function buildManagedClaims(
  memberIds: string[],
  assignments: ItemAssignments,
  shares: ItemShares,
): { memberId: string; itemIds: string[]; shareBp: Record<string, number> }[] {
  return memberIds.map((memberId) => {
    const itemIds = Object.entries(assignments)
      .filter(([, ids]) => ids.includes(memberId))
      .map(([itemId]) => itemId);
    const shareBp: Record<string, number> = {};
    for (const itemId of itemIds) {
      const line = shares[itemId];
      if (line && Object.keys(line).length > 0) shareBp[itemId] = Math.min(BP_FULL, Math.max(0, Math.round(line[memberId] ?? 0)));
    }
    return { memberId, itemIds, shareBp };
  });
}

/** The line's net price (what the claim math divides), item currency. */
export function itemNet(item: Pick<GroupExpenseItemView, 'totalPrice' | 'lineDiscount'>): number {
  return Math.max(0, (cents(item.totalPrice) - cents(item.lineDiscount ?? 0)) / 100);
}
