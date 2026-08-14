import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../../../database/prisma.service';
import { resolveAiModel } from './model-resolver';
import { sanitizeForPrompt } from '../utils/sanitize';
import { extractReceiptDiscounts } from '../utils/receipt-discount';
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

export interface ReceiptItem {
  description: string;
  canonicalName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  /**
   * The category this line was classified into, when it was. Present even when
   * the receipt produced no money split: knowing which line is beer and which
   * is bread is worth having on its own — it is what gives the line-by-line
   * view its categories, what teaches the product rules on save, and what fills
   * `expense_items.category_id`. Discarding it because the amounts did not
   * reconcile would throw away the answer along with the arithmetic.
   *
   * `null` with a name set means a category the model proposed that does not
   * exist yet — the same convention the split payload uses.
   */
  categoryId?: string | null;
  categoryName?: string | null;
}

/** One line's classification, applied onto `ReceiptItem` by `finalizeReceipt`. */
export interface ReceiptItemCategory {
  index: number;
  categoryId: string | null;
  categoryName: string;
}

export function buildCanonicalNameFallback(description: string): string | null {
  const tokens = description.split(/\s+/);
  const result: string[] = [];
  let textCount = 0;

  for (const token of tokens) {
    // Extract size from multiplier+size compound token (e.g. "4X130G" → "130G", "6x0,5L" → "0,5L")
    const multiplierSize = token.match(/^\d+[xX×](\d+([.,]\d+)?[GgKkLlMmDd]{1,3})$/i);
    if (multiplierSize) {
      result.push(multiplierSize[1]);
      continue;
    }
    // Keep size discriminators: weight (G/KG/ML/L/etc.) and fat%/alcohol%
    const isSizeToken =
      /^\d+([.,]\d+)?(G|KG|DAG|MG|ML|CL|DL|L)$/i.test(token) ||
      /^\d+([.,]\d+)?%$/.test(token);
    if (isSizeToken) {
      result.push(token);
      continue;
    }
    // Filter noise: purely numeric, bare multipliers (4X, 4×), quantity units (6SZT/PCS)
    const isNoise =
      /^\d+([.,]\d+)?$/.test(token) ||
      /^\d+[xX×]$/i.test(token) ||
      /^\d+(SZT|SZTUK|SZTUKI|PCS|PACK|OPAK|PKT|PAK)$/i.test(token);
    if (!isNoise && token.length >= 3 && textCount < 3) {
      result.push(token);
      textCount++;
    }
  }

  return result.length > 0 ? result.join(' ') : null;
}

export interface ParsedReceipt {
  merchantName: string | null;
  merchantAddress: string | null;
  // Structured store address (the point of sale) — used for reliable geocoding.
  // Deliberately excludes the seller company's registered seat / legal name.
  merchantStreet?: string | null;
  merchantCity?: string | null;
  merchantPostalCode?: string | null;
  merchantCountry?: string | null;
  date: string | null;
  time: string | null;
  items: ReceiptItem[];
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  total: number;
  currency: string;
  paymentMethod: string | null;
  confidence: number;
  rawText: string;
}

/**
 * What leaves the server. Distinct from the arithmetic type
 * `ReceiptCategorySplit`: here `categoryId` may be `null`, meaning "a category
 * the model proposed that does not exist yet — create it if the user saves".
 */
export interface ReceiptCategorySplitPayload {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

export interface ReceiptExpense {
  amount: number;
  discountAmount: number | null;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  categorySuggestion: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number;
  receiptItems: ReceiptItem[];
  location: { lat: number; lng: number; name: string } | null;
  /** Lines that cost more than usual for this user in this store. Always present; empty when nothing to report. */
  priceFindings: ReceiptCheckFinding[];
  /** Category groups derived from the receipt's own lines. Always present; empty when there is nothing to split. */
  categorySplits: ReceiptCategorySplitPayload[];
}

interface CategoryWithName {
  id: string;
  name: string;
}

interface OcrContext {
  language: string;
  todayIso: string;
}

// Date format actually printed on receipts in each locale (verified against
// real Polish/Czech/Hungarian/etc. receipts — many ISO-first countries do NOT
// use DD.MM.YYYY on cash receipts, even though their conversational format
// looks European).
type ReceiptDateFormat = 'YYYY-MM-DD' | 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'MM/DD/YYYY';

const DATE_FORMAT_BY_LANG: Record<string, ReceiptDateFormat> = {
  // ISO-first on receipts (Poland, Czechia, Slovakia, Slovenia, Finland, Sweden, Hungary)
  pl: 'YYYY-MM-DD',
  cs: 'YYYY-MM-DD',
  sk: 'YYYY-MM-DD',
  sl: 'YYYY-MM-DD',
  fi: 'YYYY-MM-DD',
  sv: 'YYYY-MM-DD',
  hu: 'YYYY-MM-DD',
  // DD.MM.YYYY (Germany / Austria / Switzerland / Norway / Russia / Ukraine / Belarus)
  de: 'DD.MM.YYYY',
  no: 'DD.MM.YYYY',
  ru: 'DD.MM.YYYY',
  ua: 'DD.MM.YYYY',
  be: 'DD.MM.YYYY',
  // DD/MM/YYYY (France / Italy / Spain / UK / Belgium)
  fr: 'DD/MM/YYYY',
  it: 'DD/MM/YYYY',
  es: 'DD/MM/YYYY',
  // DD-MM-YYYY (Portugal / Netherlands / Denmark)
  pt: 'DD-MM-YYYY',
  nl: 'DD-MM-YYYY',
  da: 'DD-MM-YYYY',
  // English defaults to US convention; UK trade receipts vary
  en: 'MM/DD/YYYY',
};

function getDateFormatForLang(lang: string): ReceiptDateFormat {
  return DATE_FORMAT_BY_LANG[lang.toLowerCase()] || 'YYYY-MM-DD';
}

// "Ambiguous" 03/04/2026 with no part >12: which side is the day?
// Everyone except US English defaults to day-first when reading slash-dates.
function isDayFirstLanguage(lang: string): boolean {
  return lang.toLowerCase() !== 'en';
}

function dateExampleForFormat(fmt: ReceiptDateFormat): string {
  // 3 April 2026 in the locale's typical receipt format
  switch (fmt) {
    case 'YYYY-MM-DD': return '2026-04-03';
    case 'DD.MM.YYYY': return '03.04.2026';
    case 'DD/MM/YYYY': return '03/04/2026';
    case 'DD-MM-YYYY': return '03-04-2026';
    case 'MM/DD/YYYY': return '04/03/2026';
  }
}

function todayInTimezone(timezone: string | null | undefined): string {
  const tz = timezone || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Force GPT-4.1 for receipt OCR regardless of the user's general aiModel pref.
// On scanned-PDF receipts (Biedronka/Lidl/etc) gpt-4o hallucinates items and
// totals; gpt-4.1 reads the same PDF correctly AND is cheaper per token.
const OCR_RECEIPT_MODEL = 'gpt-4.1';

// Smallest share of a receipt a proposed category may account for. A category
// is a lasting part of the user's taxonomy; minting one for a rounding error's
// worth of the basket costs more attention than it returns.
const MIN_PROPOSAL_SHARE_PCT = 10;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly priceHistory: PriceHistoryService,
    private readonly categorySplitter: ReceiptCategorySplitService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  private buildReceiptPrompt(
    categoryNames: string,
    source: 'image' | 'text',
    context: OcrContext,
    userPrompt?: string,
    receiptText?: string,
  ): string {
    const sourceLabel = source === 'image' ? 'receipt image' : 'receipt text';
    const localFmt = getDateFormatForLang(context.language);
    const localExample = dateExampleForFormat(localFmt);
    const dayFirstNote = isDayFirstLanguage(context.language)
      ? `If the date appears as "DD/MM/YYYY", "DD.MM.YYYY", or "DD-MM-YYYY", the FIRST number is the DAY (not the month). Example: "12/04/2026" = 12 April 2026, NOT 4 December.`
      : `The user's locale is US English: ambiguous slash-dates are MM/DD/YYYY by default. Trust the merchant's country if it's outside the US.`;

    let prompt = `Analyze this ${sourceLabel} and extract all information.

USER CONTEXT (use as a tiebreaker for ambiguous formats):
- Today's date: ${context.todayIso} — any extracted date MUST NOT be more than 7 days after this.
- User app language: "${context.language}". On receipts in this locale, dates are typically printed as ${localFmt} (example: 3 April 2026 → "${localExample}").
- ${dayFirstNote}
- If the receipt itself indicates a different country (merchant address, language, currency), trust the RECEIPT's locale over the user's app language.
- ALWAYS output the date strictly as YYYY-MM-DD regardless of how it appears on the receipt.

Available expense categories for classification: ${categoryNames}
`;

    if (source === 'text' && receiptText) {
      prompt += `
Receipt text (extracted via pdf-parse — spacing may be lost, columns may be misaligned, but the content is correct):
---
${receiptText}
---
`;
    }

    prompt += `
Return a JSON object with the following structure:
{
  "merchantName": "store/restaurant name or null if not found",
  "merchantAddress": "the STORE's own address on ONE line (street + building no, postal code, city) or null — see store-address rules below",
  "merchantStreet": "the STORE's street name + building number only, or null",
  "merchantCity": "the STORE's city/town, or null",
  "merchantPostalCode": "the STORE's postal code, or null",
  "merchantCountry": "country of the STORE as an English name or ISO code (infer from address/language/currency), or null",
  "date": "STRICT YYYY-MM-DD format only, or null. Use USER CONTEXT to pick the right format. Never invent the year — if year is unreadable, return null.",
  "time": "HH:MM format or null",
  "items": [
    {
      "description": "clean, normalized product name (see normalization rules below)",
      "canonicalName": "product name with size discriminators in title case (see canonicalName rules below)",
      "quantity": 1,
      "unitPrice": 10.00,
      "totalPrice": 10.00
    }
  ],
  "subtotal": number or null (sum BEFORE any discount and BEFORE tax, when shown),
  "discount": total discount amount as a POSITIVE number, or null,
  "tax": number or null,
  "total": total amount the customer actually pays (after discount, including tax) — REQUIRED,
  "currency": "USD/EUR/PLN/etc",
  "paymentMethod": "cash/card/etc or null",
  "suggestedCategory": "best matching category from the available list",
  "confidence": 0-1 confidence score,
  "rawText": "all readable text from receipt"
}

Store-address rules (merchantAddress / merchantStreet / merchantCity / merchantPostalCode / merchantCountry):
- These describe the PHYSICAL STORE where the purchase happened (the point of sale) — NOT the seller company's registered office, head office, or legal seat.
- Receipts (especially in Poland) frequently print BOTH the company's registered seat AND the store address. Example: a Biedronka receipt shows the store "89-632 Brusy, ul. Wojska Polskiego" alongside the company seat "Jeronimo Martins Polska S.A., 62-025 Kostrzyn, ul. Żniwna 5". ALWAYS pick the STORE address (Brusy) and IGNORE the registered seat (Kostrzyn) and the legal entity name.
- Never mix two different addresses into one field. merchantStreet/merchantCity/merchantPostalCode must all refer to the SAME (store) location.
- merchantAddress is the same store address as a single human-readable line; do NOT include the company legal name or the registered seat.
- If only the company seat is printed and there is no distinct store address, return null for all five fields rather than guessing.

Item name normalization rules for the "description" field:
- IMPORTANT: Preserve the actual product name from the receipt — do NOT replace it with a different brand or product
- Separate concatenated words with spaces (e.g. "PiwoZywiec0.5" -> "Piwo Zywiec 0.5L")
- Use proper capitalization for the words as printed on receipt (e.g. "coca cola" -> "Coca-Cola")
- Remove store-specific product codes, PLU numbers, and internal IDs
- Include size/weight/volume when present (e.g. "0.5L", "500g", "1kg")
- Keep the product name in the original receipt language
- Only fix obvious single-character OCR errors within the same word, do NOT guess or substitute brand names

canonicalName rules — brand/product name with size discriminators, for price-history tracking across purchases:
- KEEP: weight/volume per single unit (500g, 1L, 250ml, 130g), fat/alcohol/content percentage (3,2%, 4,7%), flavour/variant descriptors (Truskawkowy, Naturalny)
- STRIP: pack-quantity multipliers (6SZT, ×6, 4×, 4x130G — but extract the unit "130g" from it), product codes, PLU numbers
- canonicalName examples:
  "MLEKO 3,2% ŁACIATE 1L 6SZT"       → "Mleko Łaciate 3,2% 1L"     (keep fat% + volume, strip 6SZT)
  "CHLEB RAZOWY WIEJSKI 500G"         → "Chleb Razowy Wiejski 500g"  (keep weight)
  "PIWO TYSKIE 0,5L 4,7%"            → "Tyskie 0,5l 4,7%"           (keep volume + alcohol%)
  "SERK DANIO TRUSKAWKOWY 4×130G"    → "Danio Truskawkowy 130g"      (extract per-unit size from multiplier)
  "JOGURT ACTIVIA BRZOSKWINIA 150G"  → "Activia Brzoskwinia 150g"
- Use title case (first letter of each word capitalised)

Discount extraction (read carefully — Polish/Lidl/Biedronka receipts often have many small discount lines that must be summed):
- Recognize ANY line that subtracts from the running total as a discount. Strong signals:
  (a) line label contains: DISCOUNT, RABAT, RABATT, REMISE, DESCUENTO, SCONTO, ZNIŻKA, ZNIZKA, UPUST, OPUST, OPUSTY, OPUSTY ŁĄCZNIE, PROMOCJA, AKCJA, OFERTA, СКИДКА, ЗНИЖКА, SAVINGS, GUTSCHEIN, BON, KUPON, COUPON, VOUCHER, "<store name> Plus voucher" / "<store name> Plus kupon" (e.g. "Lidl Plus voucher", "Lidl Plus kupon", "Biedronka rabat")
  (b) the line's amount is NEGATIVE (printed with a minus sign or in parentheses) — this alone is enough; treat the absolute value as a discount
- IMPORTANT for Polish (Biedronka/Lidl) receipts:
  - "Opust" lines under each item are PER-ITEM discounts (e.g. "Opust -4,56")
  - "OPUSTY ŁĄCZNIE" / "RABAT ŁĄCZNIE" prints the SUM of all per-item discounts
  - If both per-item Opust lines AND a "OPUSTY ŁĄCZNIE: -X,XX" total are present, use the ŁĄCZNIE total — do NOT add it to the per-item lines (would double-count)
- Output discount as a single POSITIVE number (drop the minus sign)
- Do NOT compute a discount from "regular price vs sale price" markings unless there is also an explicit discount line
- Receipt math layout:
  - Polish/EU style (VAT included in prices): items_sum − discount = post-discount total ("Suma PLN"), then optional packaging deposit ("kaucja") → final "DO ZAPŁATY"
  - US style (tax added on top): items_sum − discount + tax = total
  - Set "subtotal" to items_sum BEFORE discount (NOT the printed "Suma PLN" which is post-discount)
- "total" is the FINAL amount paid as printed on the receipt (DO ZAPŁATY / TOTAL / SUMMA / Итого)

Date extraction:
- Output STRICTLY in YYYY-MM-DD form. If the receipt shows DD.MM.YYYY, convert it. Do not include time in this field.
- If the date is partially unreadable or the year is missing, return null. Do NOT guess year from "today's date".

Important:
- Extract EVERY line item if possible
- If currency symbol is not clear, guess based on merchant location/language
- Total is required - estimate from items if not clearly visible
- Be thorough but fast
- Only return valid JSON, no other text`;

    if (userPrompt) {
      const safeNote = sanitizeForPrompt(userPrompt, 200);
      if (safeNote) {
        prompt += `\n\nUser note about this receipt: "${safeNote}"`;
      }
    }

    return prompt;
  }

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

      const splits = buildCategorySplits({
        total: receipt.amount,
        discount: receipt.discountAmount,
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
          }, kept ${itemCategories.length} line categories`,
        );
        // No split, but the lines keep their categories: the user sees what each
        // line is, the rules still learn from it on save, and assigning a line
        // by hand from there can produce a split the arithmetic would not.
        return { splits: [], itemCategories };
      }

      this.logger.log(`[CategorySplit] ${accountId}: ok groups=${splits.length} proposed=${materialProposals.length}`);
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
  private async finalizeReceipt(
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

  private async getExpenseCategories(accountId: string): Promise<CategoryWithName[]> {
    return this.prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { accountId }],
        type: 'expense',
        isDeleted: false,
      },
    });
  }

  private async getUserOcrPrefs(userId: string): Promise<{ aiModel: string | null; context: OcrContext }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { aiModel: true, language: true, timezone: true },
    });
    return {
      aiModel: user?.aiModel ?? null,
      context: {
        language: user?.language || 'en',
        todayIso: todayInTimezone(user?.timezone),
      },
    };
  }

  private validateAndNormalizeReceipt(
    parsed: ParsedReceipt & { suggestedCategory?: string },
    context: OcrContext,
  ): ParsedReceipt & { suggestedCategory?: string } {
    parsed.date = this.normalizeDate(parsed.date, context);

    const subtotal = typeof parsed.subtotal === 'number' && Number.isFinite(parsed.subtotal) ? parsed.subtotal : null;
    const total = typeof parsed.total === 'number' && Number.isFinite(parsed.total) ? parsed.total : null;
    const tax = typeof parsed.tax === 'number' && Number.isFinite(parsed.tax) ? parsed.tax : 0;
    const rawDiscount = typeof parsed.discount === 'number' && Number.isFinite(parsed.discount) ? Math.abs(parsed.discount) : null;

    let discount = rawDiscount;

    if (discount !== null && total !== null && discount >= total) {
      this.logger.warn(`[OCR] Discount ${discount} >= total ${total} — discarding implausible discount`);
      discount = null;
    }

    if (subtotal !== null && total !== null) {
      // Math invariant has two valid forms:
      //   (a) tax-exclusive (US-style): subtotal − discount + tax = total
      //   (b) tax-inclusive (EU-style, e.g. Polish VAT embedded in prices):
      //       subtotal − discount = total (tax is informational; total may
      //       additionally include small fees like packaging deposits)
      const tolerance = Math.max(0.5, Math.abs(total) * 0.03);
      const exclExpected = subtotal - (discount ?? 0) + tax;
      const inclExpected = subtotal - (discount ?? 0);
      const exclOk = Math.abs(exclExpected - total) <= tolerance;
      const inclOk = Math.abs(inclExpected - total) <= tolerance;

      if (!exclOk && !inclOk) {
        let derived: number | null = null;
        if (subtotal > total + 0.01) {
          derived = Math.round((subtotal - total) * 100) / 100;
        } else if (subtotal + tax > total + 0.01) {
          derived = Math.round((subtotal + tax - total) * 100) / 100;
        }
        if (derived !== null && derived > 0.01 && derived < subtotal) {
          this.logger.log(`[OCR] Discount reconciled: model=${rawDiscount} -> derived=${derived} (subtotal=${subtotal}, tax=${tax}, total=${total})`);
          discount = derived;
        } else {
          if (discount !== null) {
            this.logger.warn(`[OCR] Cannot reconcile discount=${rawDiscount} against subtotal=${subtotal} tax=${tax} total=${total}; clearing discount`);
          }
          discount = null;
        }
      }
    }

    parsed.discount = discount;

    if (parsed.items && parsed.items.length > 0) {
      // Some receipts print discounts as their own line ("OPUST PIWO ... -8,00") and the
      // model sometimes emits those as negative line items. Pull them out of the product
      // list and fold their value into the receipt discount. This only cleans the item
      // list + the informational discount — it never touches the paid total (`amount`).
      const { items: products, discount: reconciledDiscount, removedCount } = extractReceiptDiscounts(
        parsed.items,
        parsed.discount,
      );
      if (removedCount > 0) {
        this.logger.log(`[OCR] Folded ${removedCount} discount line item(s) into receipt discount (discount=${reconciledDiscount})`);
        parsed.items = products;
        parsed.discount = reconciledDiscount;
      }
      for (const item of parsed.items) {
        item.canonicalName = item.canonicalName?.trim() || buildCanonicalNameFallback(item.description) || undefined;
      }
    }

    return parsed;
  }

  private normalizeDate(raw: string | null, context: OcrContext): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    let normalized: string | null = null;

    // ISO-style YYYY-MM-DD (also accept ISO with "." or "/" separators —
    // some Polish/Czech receipts emit "2026.04.03" or "2026/04/03")
    const isoMatch = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (isoMatch) {
      const yyyy = isoMatch[1];
      const mm = parseInt(isoMatch[2], 10);
      const dd = parseInt(isoMatch[3], 10);
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        normalized = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      }
    } else {
      const dmy = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
      if (dmy) {
        const a = parseInt(dmy[1], 10);
        const b = parseInt(dmy[2], 10);
        let yyyy = dmy[3];
        if (yyyy.length === 2) yyyy = `20${yyyy}`;
        let day: number;
        let month: number;
        if (a > 12 && b <= 12) {
          day = a;
          month = b;
        } else if (b > 12 && a <= 12) {
          month = a;
          day = b;
        } else if (isDayFirstLanguage(context.language)) {
          day = a;
          month = b;
        } else {
          month = a;
          day = b;
        }
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          normalized = `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }

    if (!normalized) {
      this.logger.warn(`[OCR] Date "${raw}" did not match any known format; setting null`);
      return null;
    }

    const parsedDate = new Date(`${normalized}T12:00:00Z`);
    if (isNaN(parsedDate.getTime())) {
      this.logger.warn(`[OCR] Date "${raw}" -> "${normalized}" is not a valid Date; setting null`);
      return null;
    }

    const today = new Date(`${context.todayIso}T12:00:00Z`);
    const diffDays = (parsedDate.getTime() - today.getTime()) / 86400000;
    if (diffDays > 7) {
      this.logger.warn(`[OCR] Date "${normalized}" is ${diffDays.toFixed(0)} days in the future; setting null`);
      return null;
    }
    if (diffDays < -3650) {
      this.logger.warn(`[OCR] Date "${normalized}" is more than 10 years in the past; setting null`);
      return null;
    }

    if (raw !== normalized) {
      this.logger.log(`[OCR] Date normalized: "${raw}" -> "${normalized}"`);
    }
    return normalized;
  }

  async parseReceipt(
    imageBase64: string,
    userId: string,
    accountId: string,
    userPrompt?: string,
    imageDataUrl?: string,
  ): Promise<ReceiptExpense> {
    const { context } = await this.getUserOcrPrefs(userId);
    const aiModel = OCR_RECEIPT_MODEL;

    const categories = await this.getExpenseCategories(accountId);
    const categoryNames = categories.map((c: CategoryWithName) => c.name).join(', ');
    const prompt = this.buildReceiptPrompt(categoryNames, 'image', context, userPrompt);

    const url = imageDataUrl || `data:image/jpeg;base64,${imageBase64}`;

    // OCR needs more tokens than chat — receipts with many items produce large JSON
    const ocrMaxTokens = 4096;

    this.logger.log(`[Vision] Using model: ${aiModel} (forced for OCR), maxTokens: ${ocrMaxTokens}`);
    this.logger.log(`[Vision] Image base64 size: ${(imageBase64.length / 1024).toFixed(1)}KB`);

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: ocrMaxTokens,
      response_format: { type: 'json_object' },
    });

    const choice = response.choices[0];
    const content = choice?.message?.content;
    this.logger.log(`[Vision] GPT finish_reason: ${choice?.finish_reason}`);
    this.logger.log(`[Vision] GPT response: ${content}`);

    if (!content) {
      throw new Error('No response from AI');
    }

    if (choice?.finish_reason === 'length') {
      this.logger.warn('[Vision] Response was truncated (finish_reason=length), attempting to parse anyway');
    }

    const parsed: ParsedReceipt & { suggestedCategory?: string } = JSON.parse(content);
    return await this.finalizeReceipt(this.validateAndNormalizeReceipt(parsed, context), categories, accountId, userId);
  }

  async parseReceiptPdf(
    pdfBase64: string,
    userId: string,
    accountId: string,
    userPrompt?: string,
  ): Promise<ReceiptExpense> {
    const { context } = await this.getUserOcrPrefs(userId);
    const aiModel = OCR_RECEIPT_MODEL;

    const ocrMaxTokens = 4096;

    const buffer = Buffer.from(pdfBase64, 'base64');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      // Try text extraction first
      const textResult = await parser.getText();
      const trimmedText = textResult.text.trim();

      this.logger.log(`[PDF] Extracted text length: ${trimmedText.length}`);
      this.logger.log(`[PDF] Extracted text (first 500 chars): ${trimmedText.substring(0, 500)}`);

      // Strip pdf-parse page separators and whitespace to check for real content
      const meaningfulText = trimmedText.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();

      if (meaningfulText && meaningfulText.length >= 50) {
        // Text-based PDF — use cheaper text-only GPT call
        const categories = await this.getExpenseCategories(accountId);
        const categoryNames = categories.map((c: CategoryWithName) => c.name).join(', ');
        const prompt = this.buildReceiptPrompt(categoryNames, 'text', context, userPrompt, trimmedText);

        this.logger.log(`[PDF] Using text-based parsing with model: ${aiModel}, maxTokens: ${ocrMaxTokens}`);

        const response = await this.openai.chat.completions.create({
          model: aiModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: ocrMaxTokens,
          response_format: { type: 'json_object' },
        });

        const choice = response.choices[0];
        const content = choice?.message?.content;
        this.logger.log(`[PDF] GPT finish_reason: ${choice?.finish_reason}`);
        this.logger.log(`[PDF] GPT response: ${content}`);
        if (!content) throw new Error('No response from AI');

        const parsed: ParsedReceipt & { suggestedCategory?: string } = JSON.parse(content);
        return await this.finalizeReceipt(this.validateAndNormalizeReceipt(parsed, context), categories, accountId, userId);
      }

      // Scanned PDF — send the full PDF as a file
      this.logger.log(`[PDF] Insufficient meaningful text (${meaningfulText.length} chars), sending full PDF as file with model: ${aiModel}`);
      return this.parseReceiptFile(pdfBase64, userId, accountId, context, userPrompt, aiModel, ocrMaxTokens);
    } finally {
      await parser.destroy();
    }
  }

  private async renderPdfToPngs(pdfBuffer: Buffer, dpi = 300, maxPages = 4): Promise<Buffer[]> {
    const dir = await mkdtemp(join(tmpdir(), 'ocr-pdf-'));
    const inPath = join(dir, 'in.pdf');
    const outPrefix = join(dir, 'page');
    await writeFile(inPath, pdfBuffer);
    try {
      const args = ['-png', '-r', String(dpi), '-f', '1', '-l', String(maxPages), inPath, outPrefix];
      await new Promise<void>((resolve, reject) => {
        const p = spawn('pdftoppm', args);
        let stderr = '';
        p.stderr.on('data', (d) => { stderr += d.toString(); });
        p.on('error', reject);
        p.on('close', (code) => code === 0
          ? resolve()
          : reject(new Error(`pdftoppm exited ${code}: ${stderr.trim()}`)));
      });
      const files = (await readdir(dir))
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      const pngs: Buffer[] = [];
      for (const f of files) pngs.push(await readFile(join(dir, f)));
      return pngs;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async parseReceiptFile(
    pdfBase64: string,
    userId: string,
    accountId: string,
    context: OcrContext,
    userPrompt?: string,
    aiModel?: string,
    maxTokens?: number,
  ): Promise<ReceiptExpense> {
    const resolvedModel = aiModel || OCR_RECEIPT_MODEL;
    const resolvedMaxTokens = maxTokens || 4096;
    this.logger.log(`[PDF-File] Using model: ${resolvedModel}, maxTokens: ${resolvedMaxTokens}`);

    const categories = await this.getExpenseCategories(accountId);
    const categoryNames = categories.map((c: CategoryWithName) => c.name).join(', ');
    const prompt = this.buildReceiptPrompt(categoryNames, 'image', context, userPrompt);

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    let imageContents: Array<{ type: 'image_url'; image_url: { url: string; detail: 'high' } }>;
    try {
      const pngs = await this.renderPdfToPngs(pdfBuffer);
      this.logger.log(`[PDF-File] Rendered ${pngs.length} page(s) to PNG; total size: ${(pngs.reduce((s, b) => s + b.length, 0) / 1024).toFixed(1)}KB`);
      imageContents = pngs.map((png) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/png;base64,${png.toString('base64')}`,
          detail: 'high' as const,
        },
      }));
    } catch (err) {
      this.logger.error(`[PDF-File] pdftoppm rendering failed, falling back to raw PDF file upload: ${err instanceof Error ? err.message : err}`);
      const response = await this.openai.chat.completions.create({
        model: resolvedModel,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'file', file: { filename: 'receipt.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` } },
          ],
        }],
        max_tokens: resolvedMaxTokens,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      this.logger.log(`[PDF-File] GPT response (fallback): ${content}`);
      if (!content) throw new Error('No response from AI');
      const parsed: ParsedReceipt & { suggestedCategory?: string } = JSON.parse(content);
      return await this.finalizeReceipt(this.validateAndNormalizeReceipt(parsed, context), categories, accountId, userId);
    }

    const response = await this.openai.chat.completions.create({
      model: resolvedModel,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageContents],
        },
      ],
      max_tokens: resolvedMaxTokens,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    this.logger.log(`[PDF-File] GPT response: ${content}`);
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed: ParsedReceipt & { suggestedCategory?: string } = JSON.parse(content);
    return await this.finalizeReceipt(this.validateAndNormalizeReceipt(parsed, context), categories, accountId, userId);
  }

  async extractTextFromImage(imageBase64: string, userId?: string): Promise<string> {
    let aiModel = 'gpt-4o';
    if (userId) {
      const userPref = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true } });
      aiModel = resolveAiModel(userPref?.aiModel).model;
    }

    const response = await this.openai.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract and return ALL text visible in this image. Return plain text only, preserving the layout as much as possible.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    });

    return response.choices[0]?.message?.content || '';
  }
}
