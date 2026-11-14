import en from '../locales/en';
import pt from '../locales/pt';
import br from '../locales/br';

function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') flatten(v, path, out);
    else out[path] = String(v);
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

const flatEn = flatten(en);

describe.each([
  ['pt', pt],
  ['br', br],
])('locale %s parity with en', (_name, locale) => {
  const flat = flatten(locale);

  it('has exactly the same key paths as en', () => {
    const enKeys = Object.keys(flatEn).sort();
    const keys = Object.keys(flat).sort();
    expect({
      missing: enKeys.filter((k) => !(k in flat)),
      extra: keys.filter((k) => !(k in flatEn)),
    }).toEqual({ missing: [], extra: [] });
  });

  it('keeps the same {{placeholders}} as en for every key', () => {
    const bad = Object.keys(flatEn)
      .filter((k) => k in flat && placeholders(flat[k]).join() !== placeholders(flatEn[k]).join())
      .map((k) => k);
    expect(bad).toEqual([]);
  });

  it('has no value equal to its own key path', () => {
    expect(Object.keys(flat).filter((k) => flat[k] === k)).toEqual([]);
  });
});
