import { buildItemListBlock } from './shared-messages';
import type { EditableItem } from '../utils/receipt-item-edit';

// A stand-in for the real `t` so these tests pin structure, not copy.
const t = (key: string, _lang?: string, params?: Record<string, string>) =>
  params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

const items: EditableItem[] = [
  { description: 'Bread', quantity: 1, totalPrice: 5.99 },
  { description: 'Milk', quantity: 2, totalPrice: 7.98 },
];

describe('buildItemListBlock', () => {
  it('numbers the lines from 1 so the user can address them', () => {
    const block = buildItemListBlock(t, items, 'PLN', 13.97, 'en');

    const numbers = block.split('\n').map((line) => line.slice(0, 3));
    expect(numbers[0]).toBe('1. ');
    expect(numbers[1]).toBe('2. ');
  });

  it('shows a quantity prefix only when more than one was bought', () => {
    const block = buildItemListBlock(t, items, 'PLN', 13.97, 'en');

    expect(block).toContain('1. Bread — 5.99 PLN');
    expect(block).toContain('2. 2× Milk — 7.98 PLN');
  });

  it('reports the sum of the lines next to the receipt total, so a gap is visible', () => {
    // The whole point of showing both: the user is correcting a misread, and the
    // gap is the only signal that the lines do not add up to what was paid.
    const block = buildItemListBlock(t, items, 'PLN', 233.98, 'en');

    expect(block).toContain('itemSumLine(sum=13.97 PLN,total=233.98 PLN)');
  });

  it('says so when every line has been deleted rather than rendering an empty list', () => {
    expect(buildItemListBlock(t, [], 'PLN', 233.98, 'en')).toContain('itemsEmpty');
  });
});
