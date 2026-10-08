import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { GeocodingService, GeocodeResult } from './geocoding.service';
import { MerchantRulesService } from '../../merchant-rules/merchant-rules.service';
import type { ReceiptCheckFinding } from '@budget/shared-types';
import {
  checkReceiptPrices,
  perUnitPrice,
  resolveReceiptCheckConfig,
  type ReceiptCheckLine,
  type CommunityBaseline,
} from '../../price-history/receipt-check.util';
import { PriceHistoryService } from '../../price-history/price-history.service';
import {
  ReceiptCategorySplitService,
  proposedKey,
  isProposedKey,
  proposedNameFromKey,
  depositCategoryName,
} from './receipt-category-split.service';
import { buildCategorySplits, receiptTotalsReconcile } from '../../../common/utils/receipt-category-split';
import { CommunityPriceService } from '../../community-prices/community-price.service';
import { normalizeCommunityMerchant } from '../../community-prices/community-price.util';
import {
  ATTESTED_NAME_MAX_LEN,
  SCAN_ATTESTATION_MAX_LINES,
  SCAN_ATTESTATION_VERSION,
  attestedLineHash,
  signScanAttestation,
  usableCommunitySalt,
} from '../../community-prices/scan-attestation.util';
import { isDepositCategoryName } from '../../../common/utils/deposit-category';
import { reconcileReceiptCategory } from '../utils/receipt-overall-category.util';
import type {
  CategoryWithName,
  ParsedReceipt,
  ReceiptCategorySplitPayload,
  ReceiptExpense,
  ReceiptItemCategory,
} from './ocr.service';

/** Default OCR-confidence floor (percent) for issuing a community scan attestation. */
const DEFAULT_MIN_OCR_CONFIDENCE_PCT = 80;
/** A receipt needs at least this many priced, named lines to be attested. */
const MIN_ATTESTED_LINES = 2;

export interface ReceiptFinalizeOptions {
  /**
   * The caller (a new app build) asked for the same-store community baseline in
   * `priceFindings` (ABA-642). Bots and old builds never set it, so their copy
   * ("above your usual price") stays personal-only.
   */
  communityBaseline?: boolean;
  /** Issue a scan attestation when the gates pass. Default true; false for plain text. */
  attest?: boolean;
}

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
 * added. This also makes it the one place a learned merchant rule
 * (`MerchantRulesService`) is applied at receipt-scan time — see
 * `buildReceiptExpense`; a rule hit always wins over the model's own
 * `suggestedCategory` guess, mirroring bank/Wise import and the
 * categorize-uncategorized pass (docs/wiki/features/merchant-category-rules.md).
 */
@Injectable()
export class ReceiptFinalizerService {
  private readonly logger = new Logger(ReceiptFinalizerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly priceHistory: PriceHistoryService,
    private readonly categorySplitter: ReceiptCategorySplitService,
    private readonly merchantRules: MerchantRulesService,
    @Optional() private readonly communityPrices?: CommunityPriceService,
  ) {}

  private async buildReceiptExpense(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    categories: CategoryWithName[],
    merchantRulesMap: Map<string, string>,
  ): Promise<ReceiptExpense> {
    // A learned merchant rule always wins over the model's own guess — same
    // invariant bank/Wise import and the categorize-uncategorized pass already
    // enforce (see docs/wiki/features/merchant-category-rules.md). Checked
    // first, unconditionally: a rule hit is never second-guessed by
    // `suggestedCategory` below, even when the model itself answered `null`.
    const merchantKey = parsed.merchantName?.trim().toLowerCase();
    const ruleCategoryId = merchantKey ? merchantRulesMap.get(merchantKey) : undefined;

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
      categoryId: ruleCategoryId ?? matchedCategory?.id ?? null,
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
  private async runPriceCheck(
    accountId: string,
    userId: string,
    receipt: ReceiptExpense,
    options: ReceiptFinalizeOptions = {},
  ): Promise<ReceiptCheckFinding[]> {
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

      // Community fallback (ABA-642): only when the read flag is on, the caller is a
      // build that labels it honestly ("others usually pay here"), and the store has a
      // SERVER-geocoded location. Same store + region + currency only; a personal
      // history of >= 2 points still wins inside checkReceiptPrices. Inline-only:
      // the post-create detector never persists a community finding.
      let community: CommunityBaseline[] = [];
      if (options.communityBaseline === true && this.communityPrices?.readEnabled() && receipt.location) {
        const merchantKey = normalizeCommunityMerchant(merchant);
        if (merchantKey) {
          community = await this.communityPrices.getStoreBaselines(
            userId,
            lines.map((l) => l.canonicalName),
            merchantKey,
            receipt.location.lat,
            receipt.location.lng,
            receipt.currencyCode,
          );
        }
      }

      const result = checkReceiptPrices({
        lines,
        history,
        merchant,
        currencyCode: receipt.currencyCode,
        now,
        community,
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
   * The deposit category's name is resolved from the ACCOUNT OWNER's
   * language, never the acting member's — a shared account whose members use
   * different app languages must converge on one deposit category, not mint
   * one per member per scan. Filtered on `role: 'owner'`, never sorted by it:
   * alphabetically 'editor' sorts ahead of 'owner', so an `orderBy` would
   * silently pick the wrong member (the same trap
   * `WalletCurrencyService.resolveOwnerId` documents). `undefined` when there
   * is no owner row or the owner has no language set — `depositCategoryName`
   * already falls back to English for that case.
   */
  private async resolveOwnerLanguage(accountId: string): Promise<string | undefined> {
    const owner = await this.prisma.accountMember.findFirst({
      where: { accountId, role: 'owner' },
      select: { user: { select: { language: true } } },
    });
    return owner?.user.language ?? undefined;
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
      // A deposit is a legitimate second group on its own (design decision 2:
      // it always forms its own split), so a receipt with only one
      // classifiable line is still worth sending to the classifier when a
      // deposit is present — skip only when there is neither enough to
      // classify nor a deposit to pair it with.
      const depositAmount = Number(receipt.depositAmount ?? 0);
      const hasDeposit = Number.isFinite(depositAmount) && depositAmount > 0;
      if (labeledLines.length < 2 && !hasDeposit) {
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

      // The deposit is deliberately NOT routed through `proposals` and so never
      // meets MIN_PROPOSAL_SHARE_PCT. That floor exists to stop the model
      // inventing a lasting category to hold three zloty; a deposit is a
      // printed, labelled block of the receipt with a name we supply ourselves,
      // and at a typical 1-2% of the basket the floor would drop it every time.
      //
      // Named from the ACCOUNT OWNER's language (resolveOwnerLanguage), NOT
      // `user?.language` above — `user` is whoever's device did the scan, and
      // a shared account must converge on one deposit category regardless of
      // which member scanned. Query only runs when there is actually a
      // deposit to name.
      let depositGroup: { categoryId: string; categoryName: string } | null = null;
      if (hasDeposit) {
        const depositName = depositCategoryName(await this.resolveOwnerLanguage(accountId));
        const existingDeposit = categories.find(
          (c) => c.name.trim().toLowerCase() === depositName.toLowerCase(),
        );
        depositGroup = {
          categoryId: existingDeposit ? existingDeposit.id : proposedKey(depositName),
          categoryName: depositName,
        };
      }

      const splits = buildCategorySplits({
        total: receipt.amount,
        discount: receipt.discountAmount,
        deposit: receipt.depositAmount,
        depositGroup,
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
            new Set(keyByIndex.values()).size + (depositGroup ? 1 : 0) < 2
              ? 'one_category'
              : 'refused_by_arithmetic'
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
    options: ReceiptFinalizeOptions = {},
  ): Promise<ReceiptExpense> {
    // One fetch per scan, not per line — mirrors import-bank.service.ts and
    // categorize-suggestions.service.ts's own single getRulesMap() call per batch.
    const merchantRulesMap = await this.merchantRules.getRulesMap(accountId);
    const receipt = await this.buildReceiptExpense(parsed, categories, merchantRulesMap);
    receipt.priceFindings = await this.runPriceCheck(accountId, userId, receipt, options);

    const { splits, itemCategories } = await this.runCategorySplit(accountId, receipt, userId);
    receipt.categorySplits = splits;
    for (const line of itemCategories) {
      const item = receipt.receiptItems[line.index];
      if (!item) continue;
      item.categoryId = line.categoryId;
      item.categoryName = line.categoryName;
    }

    // The overall category must agree with the per-line evidence: the model's
    // single guess is vetoed when the split puts most of the receipt somewhere
    // else. Groups come from the reconciled split when there is one, else from
    // the line categories weighted by line total (a split the arithmetic
    // refused still says what the lines ARE). The deposit group is not goods.
    const groups = (splits.length > 0
      ? splits.map((s) => ({ categoryId: s.categoryId, categoryName: s.categoryName, amount: s.amount }))
      : Array.from(
          itemCategories
            .reduce((acc, line) => {
              const key = line.categoryId ?? `proposed:${line.categoryName}`;
              const prev = acc.get(key) ?? { categoryId: line.categoryId, categoryName: line.categoryName, amount: 0 };
              prev.amount += Number(receipt.receiptItems[line.index]?.totalPrice) || 0;
              acc.set(key, prev);
              return acc;
            }, new Map<string, { categoryId: string | null; categoryName: string; amount: number }>())
            .values(),
        )
    ).filter((g) => !isDepositCategoryName(g.categoryName));
    const merchantKey = receipt.merchant?.trim().toLowerCase();
    const overall = reconcileReceiptCategory({
      ruleCategoryId: merchantKey ? merchantRulesMap.get(merchantKey) : undefined,
      model: { categoryId: receipt.categoryId, name: receipt.categorySuggestion },
      groups,
    });
    receipt.categoryId = overall.categoryId;
    receipt.categorySuggestion = overall.categorySuggestion;

    if (options.attest !== false) {
      const token = this.issueScanAttestation(receipt, parsed, accountId, userId);
      if (token) receipt.scanAttestation = token;
    }

    return receipt;
  }

  /**
   * Community-price scan attestation (ABA-642 D1): a server-signed token that says
   * "the server's own OCR read these lines on this receipt for this user". Issued
   * only when EVERY gate passes; otherwise none, and the scan works exactly as before
   * (the receipt just never contributes). Fail-silent for the same reason as the
   * other derived extras. Reads the salt from the environment, like the contribution
   * path does: with no salt there is no key, so no token.
   *
   * Gates: salt set; OCR confidence >= COMMUNITY_MIN_OCR_CONFIDENCE_PCT (default 80;
   * a missing confidence defaults to 0.7 upstream and so fails on purpose); line sum
   * reconciles with the total within the split tolerance (same arithmetic as
   * buildCategorySplits); >= 2 priced lines with a canonicalName of <= 64 chars;
   * merchant, ISO date and currency present; and a SERVER-geocoded store location,
   * because `receipt.location` is only ever set from the printed address, never
   * client GPS.
   */
  private issueScanAttestation(
    receipt: ReceiptExpense,
    parsed: ParsedReceipt,
    accountId: string,
    userId: string,
  ): string | null {
    try {
      // A salt shorter than 32 chars is a weak key: no token (the service warns at startup).
      const salt = usableCommunitySalt(process.env.COMMUNITY_PRICE_SALT);
      if (!salt) return null;

      const minPctRaw = parseInt(process.env.COMMUNITY_MIN_OCR_CONFIDENCE_PCT ?? '', 10);
      const minPct = Number.isFinite(minPctRaw) && minPctRaw >= 0 ? minPctRaw : DEFAULT_MIN_OCR_CONFIDENCE_PCT;
      if (!(receipt.confidence >= minPct / 100)) return null;

      const merchant = normalizeCommunityMerchant(receipt.merchant);
      if (!merchant || merchant.length > ATTESTED_NAME_MAX_LEN) return null;
      if (!receipt.date || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.date)) return null;
      if (!parsed.currency || !/^[A-Z]{3}$/.test(receipt.currencyCode)) return null;
      if (!receipt.location) return null;
      const lat = Math.round(receipt.location.lat * 1e4) / 1e4;
      const lng = Math.round(receipt.location.lng * 1e4) / 1e4;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;

      const items = receipt.receiptItems ?? [];
      if (
        !receiptTotalsReconcile({
          items: items.map((i) => ({ amount: Number(i.totalPrice), lineDiscount: i.lineDiscount })),
          total: receipt.amount,
          discount: receipt.discountAmount,
          deposit: receipt.depositAmount,
        })
      ) {
        return null;
      }

      const hashes: string[] = [];
      for (const item of items) {
        const name = item.canonicalName;
        const total = Number(item.totalPrice);
        if (!name || !name.trim() || name.length > ATTESTED_NAME_MAX_LEN) continue;
        if (!(Number.isFinite(total) && total > 0)) continue;
        hashes.push(attestedLineHash(name, Number(item.quantity) > 0 ? Number(item.quantity) : 1, total));
      }
      if (hashes.length < MIN_ATTESTED_LINES || hashes.length > SCAN_ATTESTATION_MAX_LINES) return null;

      return signScanAttestation(salt, {
        v: SCAN_ATTESTATION_VERSION,
        u: userId,
        a: accountId,
        iat: Date.now(),
        m: merchant,
        c: receipt.currencyCode,
        d: receipt.date,
        t: parsed.time ?? null,
        tot: Math.round(receipt.amount * 100),
        loc: [lat, lng],
        h: hashes,
      });
    } catch (error) {
      this.logger.warn(`[ScanAttestation] skipped: ${error}`);
      return null;
    }
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
