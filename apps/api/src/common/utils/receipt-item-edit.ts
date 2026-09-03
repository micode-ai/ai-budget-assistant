/**
 * Parsing and applying the bot receipt line-item corrections.
 *
 * The mobile app edits scanned lines with a tap-to-expand form (ABA-481). A chat
 * bot cannot: WhatsApp allows at most 3 interactive buttons or 10 list rows per
 * message (`whatsapp-client.service.ts` throws above that), and a real receipt has
 * twenty to forty lines. So corrections are typed, exactly as the date already is —
 * one grammar, identical on Telegram, WhatsApp and Slack.
 *
 * Syntax and semantics are deliberately split: `parseItemEditCommand` only decides
 * what the user asked for, `applyItemEditCommand` owns every money rule. That is why
 * `3 = 0` parses fine and is rejected on application.
 *
 * Both functions are pure — the handlers persist the result to Redis themselves.
 */

import { buildCategorySplits } from './receipt-category-split';

/**
 * A split as it travels to the bots: structurally `ReceiptCategorySplitPayload`,
 * declared here so this util does not depend on the AI module. `categoryId` is
 * `null` for a category the scan proposed; `categoryName` is always set and is what
 * identifies such a group.
 */
export interface PendingCategorySplit {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

/** Group key for a proposed category — never leaves this module (ABA-398/451). */
const PROPOSED_PREFIX = 'proposed:';

const groupKey = (
  categoryId: string | null | undefined,
  categoryName: string | null | undefined,
): string | null => categoryId ?? (categoryName ? `${PROPOSED_PREFIX}${categoryName}` : null);

export interface EditableItem {
  description: string;
  /** Category the scan classified this line into. Lives on the item, not in an
   * index map, so removing a line cannot misalign the others (the app needed
   * `reindexAfterRemoval` for exactly that). `null` means a category the scan
   * PROPOSED but that does not exist yet — then `categoryName` is the only handle
   * on it, and it is what `resolveProposedSplits` creates at confirm time. */
  categoryId?: string | null;
  categoryName?: string | null;
  canonicalName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
}

/** `index` is 1-based — the number the user sees in the rendered list. */
export type ItemEditCommand =
  | { kind: 'setPrice'; index: number; amount: number }
  | { kind: 'rename'; index: number; description: string }
  | { kind: 'remove'; index: number }
  | { kind: 'add'; description: string; amount: number }
  | { kind: 'setTotal'; amount: number };

export type ItemEditError = 'no_such_line' | 'invalid_amount' | 'empty_description';

export type ItemEditOutcome =
  | { ok: true; items: EditableItem[]; total: number }
  | { ok: false; error: ItemEditError };

/** A price as typed on a phone: comma or dot, at most two decimals, never signed. */
const MONEY = '\\d+(?:[.,]\\d{1,2})?';

const SET_PRICE_RE = new RegExp(`^(\\d+)\\s*=\\s*(${MONEY})$`);
const RENAME_RE = /^(\d+)\s*:\s*(.+)$/;
const REMOVE_RE = /^(\d+)\s*-\s*$/;
const ADD_RE = new RegExp(`^\\+\\s*(.+?)\\s+(${MONEY})\\s*$`);
const SET_TOTAL_RE = new RegExp(`^(?:total\\s*)?=\\s*(${MONEY})$`, 'i');

function parseMoney(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function parseItemEditCommand(text: string): ItemEditCommand | null {
  const input = (text ?? '').trim();
  if (!input) return null;

  const total = SET_TOTAL_RE.exec(input);
  if (total) {
    const amount = parseMoney(total[1]);
    return amount === null ? null : { kind: 'setTotal', amount };
  }

  const price = SET_PRICE_RE.exec(input);
  if (price) {
    const amount = parseMoney(price[2]);
    return amount === null ? null : { kind: 'setPrice', index: Number(price[1]), amount };
  }

  const remove = REMOVE_RE.exec(input);
  if (remove) return { kind: 'remove', index: Number(remove[1]) };

  const rename = RENAME_RE.exec(input);
  if (rename) return { kind: 'rename', index: Number(rename[1]), description: rename[2] };

  const add = ADD_RE.exec(input);
  if (add) {
    const amount = parseMoney(add[2]);
    return amount === null ? null : { kind: 'add', description: add[1].trim(), amount };
  }

  return null;
}

export function applyItemEditCommand(
  items: EditableItem[],
  total: number,
  command: ItemEditCommand,
): ItemEditOutcome {
  if (command.kind === 'setTotal') {
    if (command.amount <= 0) return { ok: false, error: 'invalid_amount' };
    return { ok: true, items, total: command.amount };
  }

  if (command.kind === 'add') {
    if (command.amount <= 0) return { ok: false, error: 'invalid_amount' };
    const description = command.description.trim();
    if (!description) return { ok: false, error: 'empty_description' };
    const added: EditableItem = {
      description,
      quantity: 1,
      unitPrice: command.amount,
      totalPrice: command.amount,
    };
    return { ok: true, items: [...items, added], total };
  }

  const position = command.index - 1;
  if (!Number.isInteger(position) || position < 0 || position >= items.length) {
    return { ok: false, error: 'no_such_line' };
  }
  const target = items[position];

  if (command.kind === 'remove') {
    return { ok: true, items: items.filter((_, i) => i !== position), total };
  }

  if (command.kind === 'setPrice') {
    if (command.amount <= 0) return { ok: false, error: 'invalid_amount' };
    const quantity = target.quantity && target.quantity > 0 ? target.quantity : 1;
    const replaced: EditableItem = {
      ...target,
      totalPrice: command.amount,
      unitPrice: round2(command.amount / quantity),
    };
    return { ok: true, items: items.map((it, i) => (i === position ? replaced : it)), total };
  }

  const description = command.description.trim();
  if (!description) return { ok: false, error: 'empty_description' };
  // The old canonicalName described the old text; price history matches on it, so
  // keeping it would file the corrected line under the wrong product.
  const renamed: EditableItem = { ...target, description, canonicalName: undefined };
  return { ok: true, items: items.map((it, i) => (i === position ? renamed : it)), total };
}

/**
 * Lands the scan's item -> category mapping onto the items themselves, once, when
 * the user steps into edit mode.
 *
 * Needed because that mapping lives in each split's `itemIndexes`, which are
 * positions — and a deleted line shifts every later position, the exact problem the
 * app solved with `reindexAfterRemoval`. Landing it on the items first means every
 * later edit is index-shift-safe by construction. It also preserves a PROPOSED
 * category, whose only handle is its name.
 */
export function seedItemGroups(
  items: EditableItem[],
  splits: PendingCategorySplit[],
): EditableItem[] {
  if (splits.length === 0) return items.map((item) => ({ ...item }));

  const byIndex = new Map<number, PendingCategorySplit>();
  for (const split of splits) {
    for (const index of split.itemIndexes) byIndex.set(index, split);
  }

  return items.map((item, index) => {
    const split = byIndex.get(index);
    if (!split) return { ...item };
    return { ...item, categoryId: split.categoryId, categoryName: split.categoryName };
  });
}

/**
 * Rebuilds the category split from the corrected lines. Without this the expense
 * would be saved with a split computed from the prices the OCR misread — the
 * mobile app recomputes for the same reason (`useReceiptCategorySplit`).
 *
 * The tolerance gate is deliberately relaxed: the user has just corrected these
 * lines by hand, so they are the authority on them, exactly as the app's manual
 * path bypasses the gate.
 *
 * Groups by category id when there is one and by NAME when there is not, because a
 * proposed category has no id yet — and the result maps that sentinel back to
 * `categoryId: null`, so confirming still creates it by name. Letting the sentinel
 * escape as an id is the ABA-451 failure mode (a category literally named
 * `proposed:Kaucja`).
 */
export function recomputeSplits(params: {
  items: EditableItem[];
  total: number;
  discount?: number | null;
  deposit?: number | null;
  existing: PendingCategorySplit[];
}): PendingCategorySplit[] {
  const { items, total, discount, deposit, existing } = params;

  const names = new Map<string, string>();
  for (const split of existing) {
    const key = groupKey(split.categoryId, split.categoryName);
    if (key) names.set(key, split.categoryName);
  }

  // The deposit group is the one with no receipt line behind it (ABA-440/451); it
  // must be handed back as `depositGroup` or it dissolves into the residual.
  const depositGroup = existing.find((split) => split.itemIndexes.length === 0) ?? null;
  const depositKey = depositGroup
    ? groupKey(depositGroup.categoryId, depositGroup.categoryName)
    : null;

  const built = buildCategorySplits({
    items: items.map((item, index) => {
      const key = groupKey(item.categoryId, item.categoryName);
      return {
        index,
        amount: item.totalPrice,
        categoryId: key,
        categoryName: key ? names.get(key) ?? item.categoryName ?? null : null,
      };
    }),
    total,
    discount,
    deposit,
    depositGroup:
      depositGroup && depositKey
        ? { categoryId: depositKey, categoryName: depositGroup.categoryName }
        : null,
    config: { tolerancePct: 100 },
  });

  return built.map((split) =>
    split.categoryId.startsWith(PROPOSED_PREFIX) ? { ...split, categoryId: null } : split,
  );
}
