import { columnMappingsEqual } from './column-mapping';
import type { ColumnMapping } from '@budget/shared-types';

const BASE: ColumnMapping = { date: 'Data', amount: 'Kwota', description: 'Opis' };

describe('columnMappingsEqual', () => {
  it('is true for two structurally identical mappings, even as different objects', () => {
    expect(columnMappingsEqual(BASE, { ...BASE })).toBe(true);
  });

  it('is false when the date column differs', () => {
    expect(columnMappingsEqual(BASE, { ...BASE, date: 'Datum' })).toBe(false);
  });

  it('is false when a single-column amount differs', () => {
    expect(columnMappingsEqual(BASE, { ...BASE, amount: 'Suma' })).toBe(false);
  });

  it('is false when one side is a single amount column and the other a debit/credit pair', () => {
    const split: ColumnMapping = { ...BASE, amount: { debit: 'Winien', credit: 'Ma' } };
    expect(columnMappingsEqual(BASE, split)).toBe(false);
    expect(columnMappingsEqual(split, BASE)).toBe(false);
  });

  it('compares debit/credit pairs by value', () => {
    const a: ColumnMapping = { ...BASE, amount: { debit: 'Winien', credit: 'Ma' } };
    const b: ColumnMapping = { ...BASE, amount: { debit: 'Winien', credit: 'Ma' } };
    const c: ColumnMapping = { ...BASE, amount: { debit: 'Winien', credit: 'Inna' } };
    expect(columnMappingsEqual(a, b)).toBe(true);
    expect(columnMappingsEqual(a, c)).toBe(false);
  });

  it('treats an absent optional column and an explicit undefined as equal', () => {
    const withUndefinedCurrency: ColumnMapping = { ...BASE, currency: undefined };
    expect(columnMappingsEqual(BASE, withUndefinedCurrency)).toBe(true);
  });

  it('is false when an optional column is present on one side only', () => {
    expect(columnMappingsEqual(BASE, { ...BASE, currency: 'Waluta' })).toBe(false);
    expect(columnMappingsEqual({ ...BASE, counterparty: 'Kontrahent' }, BASE)).toBe(false);
  });

  it('is true when both sides carry the same optional columns', () => {
    const withOptional: ColumnMapping = { ...BASE, currency: 'Waluta', counterparty: 'Kontrahent' };
    expect(columnMappingsEqual(withOptional, { ...withOptional })).toBe(true);
  });

  it('is not fooled by key order (structural, not JSON-string comparison)', () => {
    const reordered: ColumnMapping = {
      description: BASE.description,
      date: BASE.date,
      amount: BASE.amount,
    };
    expect(columnMappingsEqual(BASE, reordered)).toBe(true);
  });
});
