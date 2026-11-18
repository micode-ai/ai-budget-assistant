/** Push copy for vehicle renewal reminders (ABA-827), all 11 locales; an unknown language falls back to English. */
type Kind = 'insurance' | 'inspection' | 'service';
interface Pack {
  kinds: Record<Kind, string>;
  title: (name: string, kind: string, days: number) => string;
  body: (kind: string) => string;
  odoTitle: (name: string) => string;
  odoBody: (km: number) => string;
}

const PACKS: Record<string, Pack> = {
  en: {
    kinds: { insurance: 'Insurance', inspection: 'Inspection', service: 'Service' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} due in ${d} days`,
    body: (k) => `${k} is coming up. Log the cost when you pay so your car's total stays accurate.`,
    odoTitle: (n) => `${n}: service is near`,
    odoBody: (km) => `About ${km} km left until the planned service.`,
  },
  ru: {
    kinds: { insurance: 'Страховка', inspection: 'Техосмотр', service: 'Обслуживание' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} через ${d} дн.`,
    body: (k) => `${k} скоро. Запишите расход при оплате, чтобы итог по машине был точным.`,
    odoTitle: (n) => `${n}: скоро обслуживание`,
    odoBody: (km) => `До планового обслуживания около ${km} км.`,
  },
  ua: {
    kinds: { insurance: 'Страховка', inspection: 'Техогляд', service: 'Обслуговування' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} через ${d} дн.`,
    body: (k) => `${k} незабаром. Запишіть витрату під час оплати, щоб підсумок по авто був точним.`,
    odoTitle: (n) => `${n}: скоро обслуговування`,
    odoBody: (km) => `До планового обслуговування близько ${km} км.`,
  },
  pl: {
    kinds: { insurance: 'Ubezpieczenie', inspection: 'Przegląd', service: 'Serwis' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} za ${d} dni`,
    body: (k) => `${k} już wkrótce. Zapisz koszt przy płatności, żeby suma dla auta była dokładna.`,
    odoTitle: (n) => `${n}: zbliża się serwis`,
    odoBody: (km) => `Do planowanego serwisu zostało ok. ${km} km.`,
  },
  es: {
    kinds: { insurance: 'Seguro', inspection: 'ITV', service: 'Revisión' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} en ${d} días`,
    body: (k) => `${k} se acerca. Registra el gasto al pagar para que el total del coche sea exacto.`,
    odoTitle: (n) => `${n}: se acerca la revisión`,
    odoBody: (km) => `Faltan unos ${km} km para la revisión prevista.`,
  },
  fr: {
    kinds: { insurance: 'Assurance', inspection: 'Contrôle technique', service: 'Entretien' },
    title: (n, k, d) => `${n} : ${k.toLowerCase()} dans ${d} jours`,
    body: (k) => `${k} approche. Enregistrez le coût au paiement pour garder le total de la voiture exact.`,
    odoTitle: (n) => `${n} : l'entretien approche`,
    odoBody: (km) => `Il reste environ ${km} km avant l'entretien prévu.`,
  },
  de: {
    kinds: { insurance: 'Versicherung', inspection: 'TÜV', service: 'Wartung' },
    title: (n, k, d) => `${n}: ${k} in ${d} Tagen fällig`,
    body: (k) => `${k} steht an. Trag die Kosten beim Bezahlen ein, damit die Gesamtsumme stimmt.`,
    odoTitle: (n) => `${n}: Wartung steht bald an`,
    odoBody: (km) => `Noch etwa ${km} km bis zur geplanten Wartung.`,
  },
  be: {
    kinds: { insurance: 'Страхоўка', inspection: 'Тэхагляд', service: 'Абслугоўванне' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} праз ${d} дн.`,
    body: (k) => `${k} хутка. Запішыце выдатак пры аплаце, каб вынік па машыне быў дакладным.`,
    odoTitle: (n) => `${n}: хутка абслугоўванне`,
    odoBody: (km) => `Да планавага абслугоўвання каля ${km} км.`,
  },
  nl: {
    kinds: { insurance: 'Verzekering', inspection: 'APK', service: 'Onderhoud' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} over ${d} dagen`,
    body: (k) => `${k} komt eraan. Leg de kosten vast bij betaling zodat het totaal voor je auto klopt.`,
    odoTitle: (n) => `${n}: onderhoud nadert`,
    odoBody: (km) => `Nog ongeveer ${km} km tot het geplande onderhoud.`,
  },
  pt: {
    kinds: { insurance: 'Seguro', inspection: 'Inspeção', service: 'Revisão' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} dentro de ${d} dias`,
    body: (k) => `${k} está a chegar. Registe o custo ao pagar para o total do carro ficar certo.`,
    odoTitle: (n) => `${n}: a revisão está perto`,
    odoBody: (km) => `Faltam cerca de ${km} km para a revisão prevista.`,
  },
  br: {
    kinds: { insurance: 'Seguro', inspection: 'Vistoria', service: 'Revisão' },
    title: (n, k, d) => `${n}: ${k.toLowerCase()} em ${d} dias`,
    body: (k) => `${k} está chegando. Registre o custo ao pagar para o total do carro ficar certo.`,
    odoTitle: (n) => `${n}: a revisão está perto`,
    odoBody: (km) => `Faltam cerca de ${km} km para a revisão prevista.`,
  },
};

const pack = (lang: string): Pack => PACKS[lang] ?? PACKS.en;

export function vehicleRenewalTitle(lang: string, p: { name: string; kind: Kind; days: number }): string {
  const k = pack(lang);
  return k.title(p.name, k.kinds[p.kind], p.days);
}
export function vehicleRenewalBody(lang: string, p: { kind: Kind }): string {
  const k = pack(lang);
  return k.body(k.kinds[p.kind]);
}
export function vehicleServiceOdometerTitle(lang: string, p: { name: string }): string {
  return pack(lang).odoTitle(p.name);
}
export function vehicleServiceOdometerBody(lang: string, p: { km: number }): string {
  return pack(lang).odoBody(p.km);
}
