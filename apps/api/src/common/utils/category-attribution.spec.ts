import * as fs from 'fs';
import * as path from 'path';
import {
  attributeToCategories,
  attributableAmountForCategories,
} from './category-attribution';

const GROCERIES = 'cat-groceries';
const HOUSEHOLD = 'cat-household';
const DEPOSIT = 'cat-deposit';

/** The receipt from the report: 240 split 180 / 35 / 25. */
const splitReceipt = {
  amount: 240,
  categoryId: GROCERIES,
  categorySplits: [
    { categoryId: GROCERIES, amount: 180 },
    { categoryId: HOUSEHOLD, amount: 35 },
    { categoryId: DEPOSIT, amount: 25 },
  ],
};

const plainExpense = { amount: 240, categoryId: GROCERIES };

describe('attributeToCategories', () => {
  it('prefers the scalar categoryId over the category relation', () => {
    const parts = attributeToCategories({ amount: 10, categoryId: 'scalar', category: { id: 'relation' } });
    expect(parts).toEqual([{ categoryId: 'scalar', categoryName: 'Uncategorized', amount: 10 }]);
  });

  it('still reads the relation when no scalar is present', () => {
    const parts = attributeToCategories({ amount: 10, category: { id: 'relation', name: 'Food' } });
    expect(parts).toEqual([{ categoryId: 'relation', categoryName: 'Food', amount: 10 }]);
  });

  it('ignores soft-deleted splits', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 100 },
        { categoryId: HOUSEHOLD, amount: 40, isDeleted: true },
      ],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('falls back to the own category when every split is soft-deleted', () => {
    const parts = attributeToCategories({
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [{ categoryId: HOUSEHOLD, amount: 100, isDeleted: true }],
    });
    expect(parts).toEqual([{ categoryId: GROCERIES, categoryName: 'Uncategorized', amount: 100 }]);
  });

  it('accepts the mobile field name `splits` as well as `categorySplits`', () => {
    const parts = attributeToCategories({
      amount: 240,
      categoryId: GROCERIES,
      splits: [
        { categoryId: GROCERIES, amount: 180 },
        { categoryId: HOUSEHOLD, amount: 60 },
      ],
    });
    expect(parts.map((p) => p.amount)).toEqual([180, 60]);
  });
});

describe('attributableAmountForCategories', () => {
  it('gives a split-only category its share — the reported bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([HOUSEHOLD]))).toBe(35);
  });

  it('gives the deposit category its share and nothing else', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([DEPOSIT]))).toBe(25);
  });

  it('stops the own category absorbing the whole receipt — the mirror bug', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set([GROCERIES]))).toBe(180);
  });

  it('sums to the receipt when the set covers every split', () => {
    const all = new Set([GROCERIES, HOUSEHOLD, DEPOSIT]);
    expect(attributableAmountForCategories(splitReceipt, all)).toBe(240);
  });

  it('gives an unsplit expense its whole amount when its own category matches', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([GROCERIES]))).toBe(240);
  });

  it('gives zero when an unsplit expense belongs to another category', () => {
    expect(attributableAmountForCategories(plainExpense, new Set([HOUSEHOLD]))).toBe(0);
  });

  it('gives zero for an empty set rather than the whole amount', () => {
    expect(attributableAmountForCategories(splitReceipt, new Set())).toBe(0);
  });

  it('treats a non-numeric amount as zero rather than NaN', () => {
    const broken = { amount: 'not a number', categoryId: GROCERIES };
    expect(attributableAmountForCategories(broken, new Set([GROCERIES]))).toBe(0);
  });

  it('ignores a split with no category id', () => {
    const orphan = {
      amount: 100,
      categoryId: GROCERIES,
      categorySplits: [
        { categoryId: GROCERIES, amount: 60 },
        { categoryId: null, amount: 40 },
      ],
    };
    expect(attributableAmountForCategories(orphan, new Set([GROCERIES]))).toBe(60);
  });
});

describe('mirror drift guard (apps/api vs packages/shared-utils)', () => {
  // This file's twin lives at
  // packages/shared-utils/src/formatting/category-attribution.ts. The API
  // cannot import it at runtime (see this file's header comment +
  // scripts/check-no-shared-utils-runtime-import.sh), so mobile carries its
  // own copy. Unlike financial-month.ts (which appends a mobile-only
  // `formatFinancialMonth` after the shared portion), the two
  // category-attribution.ts files are identical from
  // `export interface AttributableSplit` all the way to end-of-file — only
  // the header doc comment above that point differs. That makes a plain
  // byte-identity slice sufficient here; there is no second function to stop
  // the comparison at.
  //
  // Reading both files with `fs` here is a test-time file read, not a
  // runtime import of @budget/shared-utils -- it does not violate the
  // no-shared-utils-runtime-import rule, which only forbids application code
  // importing the package.
  //
  // A case-table comparison (calling both copies with the same inputs and
  // asserting equal outputs) was tried first and rejected: this exact
  // failure mode already happened once in this repo (financial-month.ts
  // shipped a mirror whose test table had 13 cases against the API's 16,
  // caught only by a human reviewer, not by the table). A byte-identity
  // check can't have that gap -- there's no table to under-cover.

  const API_FILE = path.resolve(__dirname, 'category-attribution.ts');
  const SHARED_UTILS_FILE = path.resolve(
    __dirname,
    '../../../../../packages/shared-utils/src/formatting/category-attribution.ts',
  );

  const START_MARKER = 'export interface AttributableSplit';

  function extractSharedPortion(source: string, label: string): string {
    const startIdx = source.indexOf(START_MARKER);
    if (startIdx === -1) {
      throw new Error(`${label}: could not find "${START_MARKER}" -- has it been renamed?`);
    }
    return source.slice(startIdx);
  }

  it('keeps everything from AttributableSplit onward byte-identical between apps/api and packages/shared-utils', () => {
    // Normalize CRLF -> LF before comparing: on a Windows checkout with
    // core.autocrlf=true, one file can legitimately end up with different
    // on-disk line endings than the other even with no real content drift.
    const apiSource = fs.readFileSync(API_FILE, 'utf8').replace(/\r\n/g, '\n');
    const sharedUtilsSource = fs.readFileSync(SHARED_UTILS_FILE, 'utf8').replace(/\r\n/g, '\n');

    const apiShared = extractSharedPortion(apiSource, 'apps/api copy');
    const sharedUtilsShared = extractSharedPortion(sharedUtilsSource, 'shared-utils copy');

    if (apiShared !== sharedUtilsShared) {
      throw new Error(
        'category-attribution.ts mirrors have drifted: ' +
          'apps/api/src/common/utils/category-attribution.ts and ' +
          'packages/shared-utils/src/formatting/category-attribution.ts must be ' +
          'byte-identical from "export interface AttributableSplit" through ' +
          'end-of-file. Update BOTH copies together.',
      );
    }

    expect(apiShared).toBe(sharedUtilsShared);
  });
});
