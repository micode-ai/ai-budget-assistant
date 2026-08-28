import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { GeocodingService, GeocodeResult } from './geocoding.service';
import type { ReceiptCheckFinding } from '@budget/shared-types';
import {
  checkReceiptPrices,
  perUnitPrice,
  resolveReceiptCheckConfig,
  type ReceiptCheckLine,
} from '../../price-history/receipt-check.util';
import { PriceHistoryService } from '../../price-history/price-history.service';
import {
  ReceiptCategorySplitService,
  proposedKey,
  isProposedKey,
  proposedNameFromKey,
} from './receipt-category-split.service';
import { buildCategorySplits } from '../../../common/utils/receipt-category-split';
import type {
  CategoryWithName,
  ParsedReceipt,
  ReceiptCategorySplitPayload,
  ReceiptExpense,
  ReceiptItemCategory,
} from './ocr.service';

// Smallest share of a receipt a proposed category may account for. A category
// is a lasting part of the user's taxonomy; minting one for a rounding error's
// worth of the basket costs more attention than it returns.
const MIN_PROPOSAL_SHARE_PCT = 10;

/**
 * The single funnel for turning a parsed receipt into a `ReceiptExpense`.
 * Orchestrates the two downstream, independently-owned analyses — the
 * scan-time price check (`PriceHistoryService`) and the category split
 * (`ReceiptCategorySplitService`) — over the already-parsed, already-geocoded
 * receipt. `OcrService.finalizeReceipt` callers all go through this one
 * entry point so neither analysis can be forgotten when a new scan path is
 * added.
 */
@Injectable()
export class ReceiptFinalizerService {
  private readonly logger = new Logger(ReceiptFinalizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly priceHistory: PriceHistoryService,
    private readonly categorySplitter: ReceiptCategorySplitService,
  ) {}

  private async buildReceiptExpense(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    categories: CategoryWithName[],
  ): Promise<ReceiptExpense> {
    const matchedCategory = categories.find(
      (c: CategoryWithName) => c.name.toLowerCase() === parsed.suggestedCategory?.toLowerCase(),
    );

    let description = '';
    if (parsed.items && parsed.items.length > 0) {
      if (parsed.items.length === 1) {
        description = parsed.items[0].description;
      } else {
        description = `${parsed.merchantName || 'Purchase'} (${parsed.items.length} items)`;
      }
    } else if (parsed.merchantName) {
      description = `Purchase at ${parsed.merchantName}`;
    } else {
      description = 'Receipt expense';
    }

    let location: ReceiptExpense['location'] = null;
    const hasStructured = !!(parsed.merchantStreet || parsed.merchantCity || parsed.merchantPostalCode);
    let geo: GeocodeResult | null = null;
    // Prefer the structured store address — the free-text merchantAddress often
    // mixes the store with the company's registered seat, which Nominatim can't
    // resolve. Fall back to free text only when no structured parts are present.
    if (hasStructured) {
      geo = await this.geocoding.geocodeStructured({
        street: parsed.merchantStreet,
        city: parsed.merchantCity,
        postalCode: parsed.merchantPostalCode,
        country: parsed.merchantCountry,
      });
    }
    if (!geo && parsed.merchantAddress) {
      geo = await this.geocoding.geocode(parsed.merchantAddress);
    }
    if (geo) {
      location = { lat: geo.lat, lng: geo.lng, name: this.composeAddressName(parsed) };
    }

    return {
      amount: parsed.total || 0,
      discountAmount: parsed.discount || null,
      depositAmount: parsed.deposit || null,
      currencyCode: parsed.currency || 'USD',
      description,
      categoryId: matchedCategory?.id || null,
      categorySuggestion: parsed.suggestedCategory || null,
      merchant: parsed.merchantName,
      date: parsed.date,
      confidence: parsed.confidence || 0.7,
      receiptItems: parsed.items || [],
      location,
      priceFindings: [],
      categorySplits: [],
    };
  }

  /**
   * Compares each receipt line against the user's own price history for the
   * same product in the same store. Fail-silent by contract: a receipt scan
   * must never break because a price comparison failed.
   */
  private async runPriceCheck(accountId: string, receipt: ReceiptExpense): Promise<ReceiptCheckFinding[]> {
    try {
      const merchant = receipt.merchant?.trim();
      if (!merchant) return [];

      const lines: ReceiptCheckLine[] = (receipt.receiptItems ?? [])
        .filter((item) => !!item.canonicalName?.trim())
        .map((item) => ({
          canonicalName: item.canonicalName as string,
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
          unitPrice: perUnitPrice(item),
        }));
      if (lines.length === 0) return [];

      const config = resolveReceiptCheckConfig(process.env);
      const now = receipt.date ? new Date(receipt.date) : new Date();
      const since = new Date(now.getTime() - config.lookbackWeeks * 7 * 24 * 60 * 60 * 1000);

      const history = await this.priceHistory.getProductTrendsFor(
        accountId,
        lines.map((l) => l.canonicalName),
        merchant.toLowerCase(),
        since,
        receipt.currencyCode,
      );

      const result = checkReceiptPrices({
        lines,
        history,
        merchant,
        currencyCode: receipt.currencyCode,
        now,
        config,
      });

      if (result.stats.droppedByCap > 0) {
        this.logger.log(
          `[PriceCheck] evaluated ${result.stats.evaluated}, dropped ${result.stats.droppedByCap} by rise cap`,
        );
      }
      return result.findings;
    } catch (error) {
      this.logger.warn(`[PriceCheck] skipped: ${error}`);
      return [];
    }
  }

  /**
   * Groups the receipt's lines into category splits. Fail-silent by contract,
   * for the same reason as runPriceCheck: a scan must never break because a
   * derived extra failed.
   */
  private async runCategorySplit(
    accountId: string,
    receipt: ReceiptExpense,
    userId: string,
  ): Promise<{ splits: ReceiptCategorySplitPayload[]; itemCategories: ReceiptItemCategory[] }> {
    const nothing = { splits: [], itemCategories: [] };
    try {
      // Tier 2 (full E2EE): line items are encrypted at rest, so the server
      // cannot read them to classify. Same lookup as receipt-split/wrapped.
      const account = await this.prisma.account.findUnique({
        where: { id: accountId },
        select: { encryptionTier: true },
      });
      if ((account?.encryptionTier ?? 0) >= 2) return nothing;

      // Every line with a valid amount counts toward the split, labeled or
      // not: an unlabeled line's money is still part of the receipt, and
      // buildCategorySplits folds an unassigned (categoryId: null) line's
      // amount into the dominant category via the residual. Only a labeled
      // line can be sent to the classifier — there is nothing to classify
      // without a label — so that is the narrower set the cheap "is there
      // enough to bother classifying" pre-check measures.
      const allLines = (receipt.receiptItems ?? [])
        .map((item, index) => ({
          index,
          label: (item.canonicalName?.trim() || item.description?.trim() || ''),
          // The printed line, not the model's name — see ClassifyLine.ruleKey.
          ruleKey: (item.description?.trim() || item.canonicalName?.trim() || ''),
          amount: Number(item.totalPrice),
        }))
        .filter((line) => Number.isFinite(line.amount) && line.amount > 0);
      const labeledLines = allLines.filter((line) => line.label.length > 0);
      if (labeledLines.length < 2) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped few_lines`);
        return nothing;
      }

      const categories = await this.prisma.category.findMany({
        where: { OR: [{ isSystem: true }, { accountId }], type: 'expense', isDeleted: false },
        select: { id: true, name: true },
      });
      if (categories.length === 0) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped no_categories`);
        return nothing;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { language: true },
      });

      const { assignments, proposals } = await this.categorySplitter.classify({
        accountId,
        items: labeledLines,
        categories,
        language: user?.language ?? undefined,
      });
      if (assignments.size === 0 && proposals.length === 0) {
        this.logger.log(`[CategorySplit] ${accountId}: skipped no_assignments`);
        return nothing;
      }

      // A new category has to earn its place in the user's taxonomy. The model
      // is told to propose a distinct kind of spending even when a broad
      // category could hold it — otherwise a supermarket receipt files entirely
      // under "Groceries" and tells the user nothing — but it cannot judge
      // whether the group is worth a category, because by contract it never
      // sees an amount. The server can: a group below this share of the receipt
      // is clutter, and its lines are left unassigned rather than given a
      // category that exists to hold three zloty.
      const amountByIndex = new Map(allLines.map((line) => [line.index, line.amount]));
      const materialProposals = proposals.filter((proposal) => {
        const share = proposal.itemIndexes.reduce((sum, i) => sum + (amountByIndex.get(i) ?? 0), 0);
        return receipt.amount > 0 && (share / receipt.amount) * 100 >= MIN_PROPOSAL_SHARE_PCT;
      });
      if (materialProposals.length < proposals.length) {
        this.logger.log(
          `[CategorySplit] ${accountId}: dropped ${proposals.length - materialProposals.length} immaterial proposal(s)`,
        );
      }

      // A proposal has no id yet, so it is grouped under a synthetic key. The
      // key never leaves this method — it is mapped to `categoryId: null` below.
      const keyByIndex = new Map<number, string>();
      const nameByKey = new Map<string, string>();
      const byId = new Map(categories.map((c) => [c.id, c.name]));
      for (const [index, categoryId] of assignments) {
        keyByIndex.set(index, categoryId);
        nameByKey.set(categoryId, byId.get(categoryId) ?? '');
      }
      for (const proposal of materialProposals) {
        const key = proposedKey(proposal.name);
        nameByKey.set(key, proposal.name);
        for (const index of proposal.itemIndexes) keyByIndex.set(index, key);
      }

      // The classification stands on its own, whatever the arithmetic decides
      // below. It is the answer to "what is this line" — the money split is a
      // separate question about how much of the total each category accounts
      // for, and only that second question needs the sums to reconcile.
      const itemCategories: ReceiptItemCategory[] = Array.from(keyByIndex.entries()).map(([index, key]) => ({
        index,
        categoryId: isProposedKey(key) ? null : key,
        categoryName: isProposedKey(key) ? proposedNameFromKey(key) : nameByKey.get(key) ?? '',
      }));

      // What it actually decided, in one line. Without this the only way to see
      // the classification was to save the expense and read the database, which
      // is how three rounds of prompt tuning were diagnosed.
      const tally = new Map<string, number>();
      for (const line of itemCategories) tally.set(line.categoryName, (tally.get(line.categoryName) ?? 0) + 1);
      const decided = Array.from(tally.entries())
        .map(([name, n]) => `${name}x${n}`)
        .join(', ');

      const splits = buildCategorySplits({
        total: receipt.amount,
        discount: receipt.discountAmount,
        deposit: receipt.depositAmount,
        items: allLines.map((line) => {
          const key = keyByIndex.get(line.index) ?? null;
          return {
            index: line.index,
            amount: line.amount,
            categoryId: key,
            categoryName: key ? nameByKey.get(key) ?? null : null,
          };
        }),
      });

      if (splits.length === 0) {
        // 'one_category' is the specific, actionable cause this feature exists
        // for. Everything else buildCategorySplits can refuse for — the gap
        // over tolerance, a residual that zeroes out the largest group, no
        // line with a usable amount — collapses to one honest catch-all
        // rather than a label that names only one of those causes and is
        // wrong for the other two.
        this.logger.log(
          `[CategorySplit] ${accountId}: refused ${
            new Set(keyByIndex.values()).size < 2 ? 'one_category' : 'refused_by_arithmetic'
          }, kept ${itemCategories.length} line categories: ${decided}`,
        );
        // No split, but the lines keep their categories: the user sees what each
        // line is, the rules still learn from it on save, and assigning a line
        // by hand from there can produce a split the arithmetic would not.
        return { splits: [], itemCategories };
      }

      this.logger.log(`[CategorySplit] ${accountId}: ok groups=${splits.length} proposed=${materialProposals.length}: ${decided}`);
      return {
        itemCategories,
        splits: splits.map((split) => ({
          ...split,
          categoryId: isProposedKey(split.categoryId) ? null : split.categoryId,
          categoryName: isProposedKey(split.categoryId)
            ? proposedNameFromKey(split.categoryId)
            : split.categoryName,
        })),
      };
    } catch (error) {
      this.logger.warn(`[CategorySplit] skipped: ${error}`);
      return nothing;
    }
  }

  /**
   * The single funnel for turning a parsed receipt into a ReceiptExpense.
   * Every scan path must go through here so the price check cannot be
   * forgotten when a new path is added.
   */
  async finalizeReceipt(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    categories: CategoryWithName[],
    accountId: string,
    userId: string,
  ): Promise<ReceiptExpense> {
    const receipt = await this.buildReceiptExpense(parsed, categories);
    receipt.priceFindings = await this.runPriceCheck(accountId, receipt);

    const { splits, itemCategories } = await this.runCategorySplit(accountId, receipt, userId);
    receipt.categorySplits = splits;
    for (const line of itemCategories) {
      const item = receipt.receiptItems[line.index];
      if (!item) continue;
      item.categoryId = line.categoryId;
      item.categoryName = line.categoryName;
    }

    return receipt;
  }

  /**
   * Human-readable one-line store address for `location.name`. Prefers the clean
   * structured parts ("street, postal city"); falls back to the raw
   * merchantAddress only when no structured parts were extracted.
   */
  private composeAddressName(parsed: ParsedReceipt): string {
    const cityLine = [parsed.merchantPostalCode, parsed.merchantCity]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(' ');
    const composed = [parsed.merchantStreet?.trim(), cityLine].filter(Boolean).join(', ');
    return composed || parsed.merchantAddress?.trim() || '';
  }
}
