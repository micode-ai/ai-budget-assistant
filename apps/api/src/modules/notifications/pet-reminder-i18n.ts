/** Push copy for pet care reminders (ABA-831), all 11 locales; an unknown language falls back to English. */
type Kind = 'vaccination' | 'parasite';
interface Pack {
  title: Record<Kind, (name: string, days: number) => string>;
  body: Record<Kind, string>;
}

const PACKS: Record<string, Pack> = {
  en: {
    title: {
      vaccination: (n, d) => `${n}: vaccination due in ${d} days`,
      parasite: (n, d) => `${n}: flea and tick treatment due in ${d} days`,
    },
    body: {
      vaccination: 'Book the vet visit. Log the cost when you pay so the pet total stays accurate.',
      parasite: 'Time for the next treatment. Log the cost when you buy it so the pet total stays accurate.',
    },
  },
  ru: {
    title: {
      vaccination: (n, d) => `${n}: прививка через ${d} дн.`,
      parasite: (n, d) => `${n}: обработка от блох и клещей через ${d} дн.`,
    },
    body: {
      vaccination: 'Запишитесь к ветеринару. Внесите расход при оплате, чтобы итог по питомцу был точным.',
      parasite: 'Пора следующей обработки. Внесите расход при покупке, чтобы итог по питомцу был точным.',
    },
  },
  ua: {
    title: {
      vaccination: (n, d) => `${n}: щеплення через ${d} дн.`,
      parasite: (n, d) => `${n}: обробка від бліх і кліщів через ${d} дн.`,
    },
    body: {
      vaccination: 'Запишіться до ветеринара. Внесіть витрату під час оплати, щоб підсумок по улюбленцю був точним.',
      parasite: 'Час наступної обробки. Внесіть витрату під час купівлі, щоб підсумок по улюбленцю був точним.',
    },
  },
  be: {
    title: {
      vaccination: (n, d) => `${n}: прышчэпка праз ${d} дн.`,
      parasite: (n, d) => `${n}: апрацоўка ад блох і кляшчоў праз ${d} дн.`,
    },
    body: {
      vaccination: 'Запішыцеся да ветэрынара. Унясіце выдатак пры аплаце, каб вынік па гадаванцу быў дакладным.',
      parasite: 'Час наступнай апрацоўкі. Унясіце выдатак пры пакупцы, каб вынік па гадаванцу быў дакладным.',
    },
  },
  pl: {
    title: {
      vaccination: (n, d) => `${n}: szczepienie za ${d} dni`,
      parasite: (n, d) => `${n}: zabezpieczenie przed pchłami i kleszczami za ${d} dni`,
    },
    body: {
      vaccination: 'Umów wizytę u weterynarza. Zapisz koszt przy płatności, żeby suma dla pupila była dokładna.',
      parasite: 'Czas na kolejne zabezpieczenie. Zapisz koszt przy zakupie, żeby suma dla pupila była dokładna.',
    },
  },
  de: {
    title: {
      vaccination: (n, d) => `${n}: Impfung in ${d} Tagen fällig`,
      parasite: (n, d) => `${n}: Floh- und Zeckenschutz in ${d} Tagen fällig`,
    },
    body: {
      vaccination: 'Vereinbare den Tierarzttermin. Trag die Kosten beim Bezahlen ein, damit die Summe für dein Tier stimmt.',
      parasite: 'Zeit für die nächste Behandlung. Trag die Kosten beim Kauf ein, damit die Summe für dein Tier stimmt.',
    },
  },
  es: {
    title: {
      vaccination: (n, d) => `${n}: vacuna en ${d} días`,
      parasite: (n, d) => `${n}: antiparasitario en ${d} días`,
    },
    body: {
      vaccination: 'Pide cita en el veterinario. Registra el gasto al pagar para que el total de tu mascota sea exacto.',
      parasite: 'Toca el siguiente tratamiento. Registra el gasto al comprarlo para que el total de tu mascota sea exacto.',
    },
  },
  fr: {
    title: {
      vaccination: (n, d) => `${n} : vaccin dans ${d} jours`,
      parasite: (n, d) => `${n} : antiparasitaire dans ${d} jours`,
    },
    body: {
      vaccination:
        'Prenez rendez-vous chez le vétérinaire. Enregistrez le coût au paiement pour garder le total de votre animal exact.',
      parasite:
        'C’est l’heure du prochain traitement. Enregistrez le coût à l’achat pour garder le total de votre animal exact.',
    },
  },
  nl: {
    title: {
      vaccination: (n, d) => `${n}: vaccinatie over ${d} dagen`,
      parasite: (n, d) => `${n}: vlooien- en tekenbehandeling over ${d} dagen`,
    },
    body: {
      vaccination: 'Maak een afspraak bij de dierenarts. Leg de kosten vast bij betaling zodat het totaal voor je huisdier klopt.',
      parasite: 'Tijd voor de volgende behandeling. Leg de kosten vast bij aankoop zodat het totaal voor je huisdier klopt.',
    },
  },
  pt: {
    title: {
      vaccination: (n, d) => `${n}: vacina dentro de ${d} dias`,
      parasite: (n, d) => `${n}: desparasitação dentro de ${d} dias`,
    },
    body: {
      vaccination: 'Marque a consulta no veterinário. Registe o custo ao pagar para o total do seu animal ficar certo.',
      parasite: 'Está na hora do próximo tratamento. Registe o custo ao comprar para o total do seu animal ficar certo.',
    },
  },
  br: {
    title: {
      vaccination: (n, d) => `${n}: vacina em ${d} dias`,
      parasite: (n, d) => `${n}: antipulgas e carrapatos em ${d} dias`,
    },
    body: {
      vaccination: 'Agende a consulta no veterinário. Registre o custo ao pagar para o total do seu pet ficar certo.',
      parasite: 'Chegou a hora do próximo tratamento. Registre o custo ao comprar para o total do seu pet ficar certo.',
    },
  },
};

/** The languages with their own copy; anything else reads English. */
export const PET_REMINDER_LANGS = Object.keys(PACKS);

const pack = (lang: string): Pack => PACKS[lang] ?? PACKS.en;

export function petReminderTitle(lang: string, p: { name: string; kind: Kind; days: number }): string {
  return pack(lang).title[p.kind](p.name, p.days);
}
export function petReminderBody(lang: string, p: { kind: Kind }): string {
  return pack(lang).body[p.kind];
}
