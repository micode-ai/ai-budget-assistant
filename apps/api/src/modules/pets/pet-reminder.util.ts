/** Care reminders for a pet (ABA-831). Pure: no I/O, so the cron and its spec share one rule. */
export const PET_REMINDER_KINDS = ['vaccination', 'parasite'] as const;
export type PetReminderKind = (typeof PET_REMINDER_KINDS)[number];

/** Days before a date on which a push is sent — the same two as the vehicle renewals. */
export const PET_REMINDER_DAYS = [14, 2] as const;

export interface ReminderPet {
  nextVaccinationDate: Date | null;
  nextParasiteTreatmentDate: Date | null;
}

const DAY_MS = 86_400_000;

function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/** Whole calendar days from `today` to `date` (negative when past); the stored value is a `@db.Date`, read as UTC. */
export function petDaysUntil(date: Date, today: Date): number {
  return utcDay(date) - utcDay(today);
}

/** The pushes due today: a date exactly 14 or 2 days away. Past dates never fire. */
export function duePetReminders(p: ReminderPet, today: Date): { kind: PetReminderKind; days: number }[] {
  const dates: Record<PetReminderKind, Date | null> = {
    vaccination: p.nextVaccinationDate,
    parasite: p.nextParasiteTreatmentDate,
  };
  const out: { kind: PetReminderKind; days: number }[] = [];
  for (const kind of PET_REMINDER_KINDS) {
    const d = dates[kind];
    if (!d) continue;
    const days = petDaysUntil(d, today);
    if ((PET_REMINDER_DAYS as readonly number[]).includes(days)) out.push({ kind, days });
  }
  return out;
}
