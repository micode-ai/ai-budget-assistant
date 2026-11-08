// Re-applies the Android launcher shortcuts after `expo prebuild` (android/ is committed, but a
// prebuild regenerates the manifest). Source of truth: launcherShortcuts.json. Contract:
// docs/contracts/android-launcher-app-shortcuts.md
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const cfg = require('./launcherShortcuts.json');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'");

function shortcutsXml(pkg) {
  const items = cfg.shortcuts
    .map(
      (s, i) => `  <shortcut android:shortcutId="${s.id}" android:enabled="true" android:icon="@mipmap/ic_launcher" android:shortcutShortLabel="@string/${s.key}" android:shortcutLongLabel="@string/${s.key}">
    <intent android:action="android.intent.action.VIEW" android:data="budget:///${s.path}" android:targetPackage="${pkg}" android:targetClass="${pkg}.MainActivity"/>
    <categories android:name="android.shortcut.conversation"/>
  </shortcut>`.replace(/\n    <categories[^\n]*/, '')
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${items}\n</shortcuts>\n`;
}

function stringsXml(lang) {
  const labels = cfg.labels[lang];
  const rows = cfg.shortcuts.map((s, i) => `  <string name="${s.key}">${esc(labels[i])}</string>`);
  return `<resources>\n${rows.join('\n')}\n</resources>\n`;
}

module.exports = (config) => {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0];
    const activity = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    activity['meta-data'] = (activity['meta-data'] || []).filter((m) => m.$['android:name'] !== 'android.app.shortcuts');
    activity['meta-data'].push({ $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' } });
    return c;
  });
  return withDangerousMod(config, ['android', (c) => {
    const pkg = c.android?.package || 'com.budget.assistant';
    const res = path.join(c.modRequest.platformProjectRoot, 'app/src/main/res');
    fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
    fs.writeFileSync(path.join(res, 'xml/shortcuts.xml'), shortcutsXml(pkg));
    for (const lang of Object.keys(cfg.labels)) {
      const dir = path.join(res, lang === 'en' ? 'values' : `values-${lang}`);
      fs.mkdirSync(dir, { recursive: true });
      // en labels go to a dedicated file so they never clobber values/strings.xml
      fs.writeFileSync(path.join(dir, 'launcher_shortcuts.xml'), stringsXml(lang));
    }
    return c;
  }]);
};
