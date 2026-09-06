import fs from 'fs';
import path from 'path';
import { parseBackupFile } from '../fileImport.utils';

/**
 * Each case names the single production change it catches. A test that cannot
 * answer that question is a test that cannot fail, and this project has shipped
 * a few of those already.
 */
describe('parseBackupFile', () => {
  const VALID = JSON.stringify({ version: 1, data: { expenses: [] } });

  // Catches: returning `JSON.stringify(parsed)` instead of the original text.
  // The restore endpoint takes the raw string, so a re-serialised copy would
  // hand the server a different payload from the one on disk.
  it('accepts a backup and returns the text it was given, byte for byte', () => {
    const spaced = '{\n  "version": 1,\n  "data": { "expenses": [] }\n}';
    expect(parseBackupFile(spaced)).toEqual({ ok: true, text: spaced });
  });

  // Catches: dropping the try/catch around `JSON.parse`. Without it a
  // SyntaxError escapes a function whose whole contract is that it does not
  // throw, and lands in the caller's generic catch as a developer message.
  it('reports a file that is not JSON as not_json', () => {
    expect(parseBackupFile('this is not json')).toEqual({ ok: false, reason: 'not_json' });
    expect(parseBackupFile('')).toEqual({ ok: false, reason: 'not_json' });
  });

  // Catches: dropping `!record.version` — a file with rows but no version would
  // be uploaded to a restore endpoint that requires one.
  it('rejects JSON with no version', () => {
    expect(parseBackupFile(JSON.stringify({ data: { expenses: [] } })))
      .toEqual({ ok: false, reason: 'not_a_backup' });
  });

  // Catches: dropping `!record.data` — an empty restore that reports success.
  it('rejects JSON with no data', () => {
    expect(parseBackupFile(JSON.stringify({ version: 1 })))
      .toEqual({ ok: false, reason: 'not_a_backup' });
  });

  // Catches: reading `.version` straight off the parse result. `JSON.parse('null')`
  // is `null`, and `null.version` is a TypeError — the screen only ever survived
  // this input because that throw happened to land in the same catch as a parse
  // failure. Moving the check out of a try/catch is exactly when it stops being
  // absorbed, so the guard has to be here.
  it('does not throw on JSON null', () => {
    expect(() => parseBackupFile('null')).not.toThrow();
    expect(parseBackupFile('null')).toEqual({ ok: false, reason: 'not_a_backup' });
  });

  // Catches: a guard that tests only `typeof parsed === 'object'`. An array
  // passes that and is truthy, so nothing but the field check stops it.
  it('rejects a JSON array and a bare JSON scalar', () => {
    expect(parseBackupFile('[1,2,3]')).toEqual({ ok: false, reason: 'not_a_backup' });
    expect(parseBackupFile('42')).toEqual({ ok: false, reason: 'not_a_backup' });
    expect(parseBackupFile('"hello"')).toEqual({ ok: false, reason: 'not_a_backup' });
  });

  // Catches: relaxing the check to `'version' in record`. The screen tested
  // truthiness before this moved out of it, and quietly widening what counts as
  // a backup is not something a refactor may do on its own.
  it('treats a falsy version or data as not a backup', () => {
    expect(parseBackupFile(JSON.stringify({ version: 0, data: { expenses: [] } })))
      .toEqual({ ok: false, reason: 'not_a_backup' });
    expect(parseBackupFile(JSON.stringify({ version: 1, data: null })))
      .toEqual({ ok: false, reason: 'not_a_backup' });
  });

  it('accepts a realistic backup', () => {
    expect(parseBackupFile(VALID)).toEqual({ ok: true, text: VALID });
  });
});

/**
 * The defect this module exists to close, pinned so it cannot come back a fifth
 * time. `expo-file-system`'s `File` constructor calls `this.validatePath()`,
 * which its web module does not define, so `new File(uri)` throws in a browser
 * before reading a byte. Export was fixed once (ABA-412) and import was missed;
 * a grep for the bare package name would false-positive on the doc comments
 * that explain all this, so match the import statement instead.
 *
 * Catches: anyone reintroducing `import { File } from 'expo-file-system'` into
 * the web read path.
 */
describe('the web read path', () => {
  it('does not import expo-file-system', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'fileImport.web.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s[^\n]*['"]expo-file-system['"]/m);
    expect(source).not.toMatch(/require\(\s*['"]expo-file-system['"]\s*\)/);
  });

  it('still reads through fetch, which is what a blob: URL needs', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'fileImport.web.ts'), 'utf8');
    expect(source).toMatch(/await fetch\(uri\)/);
  });
});
