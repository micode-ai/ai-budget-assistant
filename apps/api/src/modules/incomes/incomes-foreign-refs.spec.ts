import * as fs from 'fs';
import * as path from 'path';

/**
 * ABA-809: tag and project references on expense and income writes are looked up
 * INSIDE the account. A source check, because these lookups sit deep in
 * transactions the existing service specs mock wholesale.
 */
describe('expense and income writes never accept another account\'s tag or project', () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const files = ['expenses/expenses.service.ts', 'incomes/incomes.service.ts'];

  it.each(files)('%s: every tag lookup by the client\'s ids is scoped by accountId', (f) => {
    const src = read(f);
    expect(src).not.toMatch(/where: \{ id: \{ in: dto\.tagIds \} \}/);
    expect(src.match(/where: \{ accountId, id: \{ in: dto\.tagIds \} \}/g)?.length).toBe(2);
  });

  it.each(files)('%s: no project is found by a bare id', (f) => {
    expect(read(f)).not.toMatch(/project\.findUnique\(\{\s*where: \{ id: dto\.projectId \}/);
  });
});
