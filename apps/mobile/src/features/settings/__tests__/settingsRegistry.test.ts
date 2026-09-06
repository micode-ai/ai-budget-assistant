import en from '@/i18n/locales/en';
import de from '@/i18n/locales/de';
import es from '@/i18n/locales/es';
import fr from '@/i18n/locales/fr';
import nl from '@/i18n/locales/nl';
import pl from '@/i18n/locales/pl';
import ru from '@/i18n/locales/ru';
import ua from '@/i18n/locales/ua';
import be from '@/i18n/locales/be';
import {
  SETTINGS_ENTRIES,
  SETTINGS_PANE_KEYS,
  SETTINGS_FORM_MAX_WIDTH,
  ENTRY_POINT_ONLY_ROUTES,
  isPaneEntry,
  isLinkEntry,
  resolveSettingsPane,
  isShellHostedSettingsRoute,
  paneContentMaxWidth,
  visibleSettingsEntries,
} from '../settingsRegistry';

const LOCALES = { en, de, es, fr, nl, pl, ru, ua, be } as const;

function lookup(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    locale,
  );
}

describe('settingsRegistry', () => {
  // Catches: the shell hosting a place-you-work. `/wallet` and friends are in
  // the left pane only because a phone has no room for more tabs; if one of
  // them ever resolved as a pane, the shell would swallow the wallet — the
  // exact failure the spec's pane/link rule exists to prevent — and the row
  // would enter a selected state, which the spec forbids outright.
  it('never resolves a link key as a hostable pane', () => {
    for (const entry of SETTINGS_ENTRIES.filter(isLinkEntry)) {
      expect(resolveSettingsPane(entry.key)).toBeUndefined();
    }
  });

  // Catches: an extracted screen whose registry entry was never flipped, which
  // renders the shell's no-selection pane at `/settings/x` instead of the
  // screen — content silently missing rather than visibly broken.
  it('resolves every pane key to its own entry', () => {
    for (const entry of SETTINGS_ENTRIES.filter(isPaneEntry)) {
      expect(resolveSettingsPane(entry.key)).toBe(entry);
    }
  });

  // Catches: a selection the registry knows nothing about (a stale bookmark, a
  // renamed key) rendering a blank pane instead of falling back to the
  // no-selection content.
  it('resolves an unknown key to undefined', () => {
    expect(resolveSettingsPane('not-a-screen')).toBeUndefined();
    expect(resolveSettingsPane(undefined)).toBeUndefined();
  });

  // Catches: a screen destined to be a pane added without deciding its content
  // cap. It would look fine as a link and then land uncapped the day its wave
  // extracts it — which IS the reported defect (theme chips a third of a 1920
  // viewport). Declared up front for every pane-destined screen, extracted or
  // not, so the flip to `kind: 'pane'` is one word and cannot forget it. Also
  // catches a pane key with no row at all, i.e. a screen unreachable from the
  // left pane.
  it('declares a content width for every pane-destined screen', () => {
    expect(SETTINGS_PANE_KEYS.length).toBeGreaterThan(0);
    for (const key of SETTINGS_PANE_KEYS) {
      const matches = SETTINGS_ENTRIES.filter((e) => e.key === key);
      expect(matches).toHaveLength(1);
      expect(matches[0].width).toMatch(/^(form|full)$/);
    }
  });

  // Catches: a width on a destination that is never hosted — `/wallet` or
  // `/settings/import` (a wizard, a link permanently) claiming a cap it will
  // never use, which reads as though it were on its way to becoming a pane.
  it('declares no width on a destination that is never hosted', () => {
    const paneKeys = new Set<string>(SETTINGS_PANE_KEYS);
    for (const entry of SETTINGS_ENTRIES.filter((e) => !paneKeys.has(e.key))) {
      expect(entry.width).toBeUndefined();
    }
  });

  // Catches: the form cap being silently removed or widened. 720 is the number
  // the whole reported defect turns on, and 'full' must stay uncapped or the
  // three list screens lose the width they were classified 'full' for.
  it('caps a form pane at 720 and leaves a full pane uncapped', () => {
    expect(paneContentMaxWidth({ kind: 'pane', key: 'appearance', labelKey: 'x', route: '/settings/appearance', width: 'form' }))
      .toBe(SETTINGS_FORM_MAX_WIDTH);
    expect(SETTINGS_FORM_MAX_WIDTH).toBe(720);
    expect(paneContentMaxWidth({ kind: 'pane', key: 'categories', labelKey: 'x', route: '/settings/categories', width: 'full' }))
      .toBeUndefined();
  });

  // Catches: "flipping" an entry by adding a second one beside it, and the
  // `reference` sub-hub being left in place after its three children were
  // promoted — either way two left-pane rows pointing at one destination.
  it('has no duplicate key and no duplicate route', () => {
    const keys = SETTINGS_ENTRIES.map((e) => e.key);
    const routes = SETTINGS_ENTRIES.map((e) => e.route);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  // Catches: an entry whose `kind` typo makes it neither, so it silently
  // vanishes from both blocks of the left pane.
  it('classifies every entry as exactly one of pane or link', () => {
    for (const entry of SETTINGS_ENTRIES) {
      expect(isPaneEntry(entry)).toBe(!isLinkEntry(entry));
    }
    expect(SETTINGS_ENTRIES.filter(isPaneEntry).length + SETTINGS_ENTRIES.filter(isLinkEntry).length)
      .toBe(SETTINGS_ENTRIES.length);
  });

  // Catches: making four features unreachable on desktop. `/wallet`,
  // `/shopping-list`, `/purchase-requests` and `/subscriptions` have no
  // top-bar tab, so the settings left pane is their only entry point. They may
  // not be dropped, and they may not become panes either.
  it('keeps the four routes that have no other entry point, as links', () => {
    for (const route of ENTRY_POINT_ONLY_ROUTES) {
      const entry = SETTINGS_ENTRIES.find((e) => e.route === route);
      expect(entry).toBeDefined();
      expect(entry && isLinkEntry(entry)).toBe(true);
    }
    expect(ENTRY_POINT_ONLY_ROUTES).toEqual(
      expect.arrayContaining(['/wallet', '/shopping-list', '/purchase-requests', '/subscriptions']),
    );
  });

  // Catches: a pane declared for a screen that does not live under
  // `app/settings/`. Wave 4 converts `account/list`, `tags/manage` and
  // `projects`; flipping one before its file moves would claim the shell owns
  // a URL it does not.
  it('routes every pane under /settings/', () => {
    for (const entry of SETTINGS_ENTRIES.filter(isPaneEntry)) {
      expect(entry.route.startsWith('/settings/')).toBe(true);
    }
  });

  // Catches: the admin panel row appearing in every user's left pane, and the
  // inverse — a normal row accidentally marked admin-only and disappearing.
  it('hides the admin row from a non-admin and shows it to an admin', () => {
    const adminOnly = SETTINGS_ENTRIES.filter((e) => e.adminOnly);
    expect(adminOnly.map((e) => e.key)).toEqual(['admin']);
    expect(visibleSettingsEntries(false).some((e) => e.key === 'admin')).toBe(false);
    expect(visibleSettingsEntries(true).some((e) => e.key === 'admin')).toBe(true);
    expect(visibleSettingsEntries(true).length).toBe(SETTINGS_ENTRIES.length);
  });

  // Catches: a minted i18n key, and a key that exists in `en` but not in one
  // of the other eight. This whole body of work has shipped without a new key;
  // a label that does not resolve renders the raw dotted key in the left pane,
  // and a key present only in `en` does it for everyone else.
  it.each(Object.keys(LOCALES))('labels every row with a key that exists in %s', (lang) => {
    const locale = LOCALES[lang as keyof typeof LOCALES];
    for (const entry of SETTINGS_ENTRIES) {
      expect(typeof lookup(locale, entry.labelKey)).toBe('string');
    }
  });

  // Records which screens have actually been extracted and hosted. A pane here
  // is a claim that `src/components/settings/<key>/` exists and that the route
  // renders it through `SettingsRoute` - flipping an entry without the
  // extraction gives the row a selected state and an empty pane. Each task in
  // this wave adds the keys it moved; that is the point of the test. The order
  // is the order `SETTINGS_ENTRIES` declares, which is the order the left pane
  // draws - so this also pins that a newly promoted row rises into the pane
  // block in its intended place rather than being appended.
  it('records which entries are panes today', () => {
    expect(SETTINGS_ENTRIES.filter(isPaneEntry).map((e) => e.key)).toEqual(['appearance', 'ai', 'widgets', 'notifications', 'bots', 'security', 'data', 'about']);
  });
});

describe('isShellHostedSettingsRoute', () => {
  // Every call in `app/_layout.tsx` passes the expo-router screen name, which
  // has no leading slash, while the registry stores `/settings/x`. Asserting
  // through the slashless form is what makes these two cases real rather than
  // a restatement of `isPaneEntry`: drop the normalisation and every pane
  // answers false, which puts the redundant header back on all of them with
  // nothing else failing.
  it('hosts every pane entry, addressed as the router names it', () => {
    const panes = SETTINGS_ENTRIES.filter(isPaneEntry);
    expect(panes.length).toBeGreaterThan(0);
    for (const entry of panes) {
      expect(isShellHostedSettingsRoute(entry.route.replace(/^\//, ''))).toBe(true);
      expect(isShellHostedSettingsRoute(entry.route)).toBe(true);
    }
  });

  // Catches the failure this helper exists to prevent in the other direction:
  // a settings route that is still a link renders as a full page on desktop
  // with no left pane beside it, so if it lost its header the back arrow would
  // go with it and the user would be stranded there.
  it('does not host a link entry, including the settings ones', () => {
    const links = SETTINGS_ENTRIES.filter(isLinkEntry);
    expect(links.some((e) => e.route.startsWith('/settings/'))).toBe(true);
    for (const entry of links) {
      expect(isShellHostedSettingsRoute(entry.route.replace(/^\//, ''))).toBe(false);
      expect(isShellHostedSettingsRoute(entry.route)).toBe(false);
    }
  });

  // Catches an over-broad match — a prefix or `includes` test would strip the
  // header from a route the shell has never heard of, leaving it with no way
  // back. `settings/index` is in this list on purpose and is the subtle one:
  // it draws the shell too, but with nothing selected, so it is the shell
  // rather than something the shell hosts in its right pane, which is the only
  // question this predicate answers. `app/_layout.tsx` hides its header with a
  // plain `!isDesktopWeb` instead — so a future change that made this return
  // true would be wrong even though the observable header behaviour matches.
  it('does not host a settings route that is not an entry', () => {
    for (const route of [
      'settings/index',
      'settings/import/preview',
      'settings/ai-usage-details',
      'settings/auto-capture',
      'settings/reference',
      'settings/change-email',
    ]) {
      expect(isShellHostedSettingsRoute(route)).toBe(false);
    }
  });

  // Catches a match loose enough to reach outside settings entirely, which
  // would take the header off an unrelated screen that has no other way back.
  it('does not host anything outside settings', () => {
    for (const route of ['expense/new', 'wallet/index', '/wallet', '', '/', 'settings']) {
      expect(isShellHostedSettingsRoute(route)).toBe(false);
    }
  });
});
