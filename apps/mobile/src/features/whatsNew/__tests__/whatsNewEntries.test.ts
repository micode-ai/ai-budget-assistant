import { WHATS_NEW_ENTRIES } from '../whatsNewEntries';
import { sectionsMeta } from '@/help/sections';

describe('WHATS_NEW_ENTRIES', () => {
  it('is non-empty', () => {
    expect(WHATS_NEW_ENTRIES.length).toBeGreaterThan(0);
  });

  it('every entry has a unique, permanent id', () => {
    const ids = WHATS_NEW_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a route or a helpSectionId to send "Tell me more" to', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(Boolean(entry.route || entry.helpSectionId)).toBe(true);
    }
  });

  it('every helpSectionId references a real registered help section', () => {
    const knownIds = new Set(sectionsMeta.map((m) => m.id));
    for (const entry of WHATS_NEW_ENTRIES) {
      if (entry.helpSectionId) {
        expect(knownIds.has(entry.helpSectionId)).toBe(true);
      }
    }
  });

  it('every entry has non-empty title and body content', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(0);
    }
  });
});
