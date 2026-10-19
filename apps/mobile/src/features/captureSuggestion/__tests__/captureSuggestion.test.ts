import {
  MANUAL_SAVES_THRESHOLD,
  captureOptionsFor,
  hasUsedFasterCapture,
  shouldSuggestFasterCapture,
} from '../captureSuggestion';
import en from '@/i18n/locales/en';
import ru from '@/i18n/locales/ru';
import ua from '@/i18n/locales/ua';
import pl from '@/i18n/locales/pl';
import es from '@/i18n/locales/es';
import fr from '@/i18n/locales/fr';
import de from '@/i18n/locales/de';
import be from '@/i18n/locales/be';
import nl from '@/i18n/locales/nl';

const LOCALES = { en, ru, ua, pl, es, fr, de, be, nl } as const;

describe('shouldSuggestFasterCapture', () => {
  const base = { manualSaves: MANUAL_SAVES_THRESHOLD, alreadyShown: false, usedFasterCapture: false };

  it('suggests once the threshold of manual saves is reached', () => {
    expect(shouldSuggestFasterCapture(base)).toBe(true);
    expect(shouldSuggestFasterCapture({ ...base, manualSaves: MANUAL_SAVES_THRESHOLD - 1 })).toBe(false);
  });

  it('never suggests twice', () => {
    expect(shouldSuggestFasterCapture({ ...base, manualSaves: 50, alreadyShown: true })).toBe(false);
  });

  it('never suggests to someone already using a faster way', () => {
    expect(shouldSuggestFasterCapture({ ...base, usedFasterCapture: true })).toBe(false);
  });
});

describe('hasUsedFasterCapture', () => {
  it('counts receipt, voice, import, bots and notification capture, not manual or group rows', () => {
    expect(hasUsedFasterCapture([{ source: 'manual' }, { source: 'group' as never }])).toBe(false);
    for (const source of ['ocr', 'voice', 'import', 'telegram', 'whatsapp', 'slack', 'notification'] as const) {
      expect(hasUsedFasterCapture([{ source: 'manual' }, { source }])).toBe(true);
    }
    expect(hasUsedFasterCapture([])).toBe(false);
  });
});

describe('captureOptionsFor', () => {
  it('offers bank-notification capture on Android only', () => {
    const keys = (os: string) => captureOptionsFor(os).map((o) => o.key);
    expect(keys('android')).toContain('notifications');
    expect(keys('ios')).not.toContain('notifications');
    expect(keys('web')).toEqual(['receipt', 'voice', 'bots', 'import']);
  });

  it('every option points at a route', () => {
    for (const o of captureOptionsFor('android')) expect(o.route.startsWith('/')).toBe(true);
  });
});

// i18next renders the key string itself for a missing key, so every locale must carry all copy.
describe('captureSuggestion copy', () => {
  it.each(Object.entries(LOCALES))('%s has every string, non-empty', (_lang, locale) => {
    const copy = (locale as unknown as { captureSuggestion?: Record<string, unknown> }).captureSuggestion;
    expect(copy).toBeDefined();
    for (const key of ['title', 'body', 'notNow'] as const) {
      expect(typeof copy?.[key]).toBe('string');
      expect((copy?.[key] as string).length).toBeGreaterThan(0);
    }
    const options = copy?.options as Record<string, { title: string; body: string }>;
    for (const { key } of captureOptionsFor('android')) {
      expect(options[key]?.title.length).toBeGreaterThan(0);
      expect(options[key]?.body.length).toBeGreaterThan(0);
    }
  });
});
