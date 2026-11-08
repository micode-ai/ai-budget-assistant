import * as fs from 'fs';
import * as path from 'path';

const cfg = require('../../../../plugins/launcherShortcuts.json');
const mobileRoot = path.resolve(__dirname, '../../../..');
const LOCALES = ['en', 'de', 'es', 'fr', 'nl', 'pl', 'ru', 'uk', 'be'];

describe('launcher shortcuts config', () => {
  it('has labels for all 9 locales, one per shortcut', () => {
    expect(Object.keys(cfg.labels).sort()).toEqual([...LOCALES].sort());
    for (const l of LOCALES) expect(cfg.labels[l]).toHaveLength(cfg.shortcuts.length);
  });
  it('stays within the 4-shortcut Android launcher cap', () => {
    expect(cfg.shortcuts.length).toBeLessThanOrEqual(4);
  });
  it('targets routes that exist', () => {
    for (const s of cfg.shortcuts) {
      expect(fs.existsSync(path.join(mobileRoot, 'app', `${s.path}.tsx`))).toBe(true);
    }
  });
  it('committed android resources match the config', () => {
    const xml = fs.readFileSync(path.join(mobileRoot, 'android/app/src/main/res/xml/shortcuts.xml'), 'utf8');
    for (const s of cfg.shortcuts) expect(xml).toContain(`budget:///${s.path}`);
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android.app.shortcuts');
  });
});
