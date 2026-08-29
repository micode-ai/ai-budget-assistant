/**
 * The returnable-packaging deposit category ("kaucja", "Pfand", …).
 *
 * Unlike every other category on a receipt this one is OURS, not the model's:
 * it has a fixed meaning, it is appended by the finalizer as its own split
 * group with no receipt line behind it, and it is deliberately never routed
 * through the model or through category proposals.
 *
 * It lives here rather than in `receipt-category-split.service.ts` because two
 * layers need to recognise it and one of them (`modules/merchant-rules`) is a
 * leaf the AI module depends on — importing the service back into it would
 * invert that dependency.
 *
 * Why recognition is by NAME across all nine languages rather than by the one
 * name the account owner's language resolves to: the owner can change their
 * language, and a shared account can change owner, but a category already
 * created keeps the name it was born with. Matching the whole table means a
 * "Pfand" created last month is still recognised after the owner switches to
 * Polish, instead of quietly becoming an ordinary assignable category again —
 * which is exactly the failure this guards (see `isDepositCategoryName`).
 */
const DEPOSIT_CATEGORY_NAMES: Record<string, string> = {
  en: 'Deposit',
  pl: 'Kaucja',
  de: 'Pfand',
  es: 'Depósito',
  fr: 'Consigne',
  nl: 'Statiegeld',
  ru: 'Залог за тару',
  ua: 'Застава за тару',
  be: 'Закладзь за тару',
};

/** The deposit category's name in the account owner's language. */
export const depositCategoryName = (language?: string): string =>
  DEPOSIT_CATEGORY_NAMES[language ?? ''] ?? DEPOSIT_CATEGORY_NAMES.en;

const RESERVED = new Set(Object.values(DEPOSIT_CATEGORY_NAMES).map((n) => n.trim().toLowerCase()));

/**
 * True when a category name is the deposit category in ANY supported language.
 *
 * Grounded in production (2026-08-29). The first Polish receipt printing a
 * `kaucja` created a real category named "Kaucja", and from the next scan on it
 * sat in the account's category list like any other — so the line classifier
 * offered it to the model, which filed cured ham, bacon and peanuts under it.
 * The save-time learner then wrote those three as permanent `product_category_rules`,
 * turning a one-off misread into a deterministic, model-free mistake that would
 * repeat on every future receipt containing those products.
 *
 * A user's own category that happens to be called "Deposit" (a rental deposit,
 * say) is also treated as reserved. That is the safe direction: it only stops
 * *receipt lines* being filed there, and a receipt line is groceries, never a
 * rental deposit.
 */
export const isDepositCategoryName = (name: string | null | undefined): boolean =>
  !!name && RESERVED.has(name.trim().toLowerCase());
