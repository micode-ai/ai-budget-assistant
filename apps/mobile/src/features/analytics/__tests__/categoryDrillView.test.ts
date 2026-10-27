import { drillView } from '../categoryDrillView';

interface Row {
  categoryId: string | null;
  children?: Row[];
}
const rows: Row[] = [
  { categoryId: 'G', children: [{ categoryId: 'P' }, { categoryId: 'G' }] },
  { categoryId: 'X' },
];

describe('drillView', () => {
  it('returns children of the drilled parent', () => {
    const v = drillView(rows, 'G');
    expect(v.parent).toBe(rows[0]);
    expect(v.rows).toBe(rows[0].children);
  });
  it('returns top rows when not drilled', () => {
    expect(drillView(rows, null)).toEqual({ rows, parent: null });
  });
  it('falls back to top rows when the parent is gone', () => {
    expect(drillView(rows, 'Z')).toEqual({ rows, parent: null });
  });
});
