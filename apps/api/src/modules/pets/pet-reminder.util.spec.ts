import { duePetReminders, petDaysUntil } from './pet-reminder.util';
import { PET_REMINDER_LANGS, petReminderBody, petReminderTitle } from '../notifications/pet-reminder-i18n';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const empty = { nextVaccinationDate: null, nextParasiteTreatmentDate: null };

describe('pet reminder util', () => {
  it('fires at 14 and 2 days only', () => {
    const today = d('2026-06-01');
    expect(duePetReminders({ ...empty, nextVaccinationDate: d('2026-06-15') }, today)).toEqual([
      { kind: 'vaccination', days: 14 },
    ]);
    expect(duePetReminders({ ...empty, nextParasiteTreatmentDate: d('2026-06-03') }, today)).toEqual([
      { kind: 'parasite', days: 2 },
    ]);
    expect(duePetReminders({ ...empty, nextVaccinationDate: d('2026-06-10') }, today)).toEqual([]);
  });

  it('fires both kinds on the same day', () => {
    const r = duePetReminders({ nextVaccinationDate: d('2026-06-15'), nextParasiteTreatmentDate: d('2026-06-03') }, d('2026-06-01'));
    expect(r.map((x) => x.kind)).toEqual(['vaccination', 'parasite']);
  });

  it('never fires for a past date and ignores the time of day', () => {
    expect(duePetReminders({ ...empty, nextVaccinationDate: d('2026-05-30') }, d('2026-06-01'))).toEqual([]);
    expect(petDaysUntil(d('2026-06-03'), new Date('2026-06-01T23:59:00Z'))).toBe(2);
  });
});

describe('pet reminder push copy', () => {
  it('has all 11 languages, each with the name and days in the title', () => {
    expect(PET_REMINDER_LANGS.sort()).toEqual(['be', 'br', 'de', 'en', 'es', 'fr', 'nl', 'pl', 'pt', 'ru', 'ua']);
    for (const lang of PET_REMINDER_LANGS) {
      for (const kind of ['vaccination', 'parasite'] as const) {
        const title = petReminderTitle(lang, { name: 'Yoka', kind, days: 14 });
        expect(title).toContain('Yoka');
        expect(title).toContain('14');
        expect(petReminderBody(lang, { kind }).length).toBeGreaterThan(10);
      }
    }
  });

  it('falls back to English for an unknown language', () => {
    expect(petReminderTitle('xx', { name: 'Rex', kind: 'vaccination', days: 2 })).toBe(
      petReminderTitle('en', { name: 'Rex', kind: 'vaccination', days: 2 }),
    );
  });

  it('words the two kinds differently in every language', () => {
    for (const lang of PET_REMINDER_LANGS) {
      expect(petReminderBody(lang, { kind: 'vaccination' })).not.toBe(petReminderBody(lang, { kind: 'parasite' }));
    }
  });
});
