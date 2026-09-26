import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import type { RealSalaryResponse } from '@budget/shared-types';
import { FONT_BOLD, FONT_REGULAR } from '../../reports/generators/pdf-generator';
import { divisionLabel } from './coicop';

export const BRIEF_LANGS: readonly string[] = ['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl'];

interface BriefLabels {
  title: string;
  subtitle: (month: string | null) => string;
  pay: string;
  inflation: string;
  real: string;
  required: string;
  byCategory: string;
  share: string;
  rate: string;
  receipts: string;
  official: string;
  drivers: string;
  sources: (country: string | null, month: string | null) => string;
  /** Used when no official data went into the answer (`dataMonth === null`). */
  sourcesReceiptsOnly: string;
  disclaimer: string;
}

const pct = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);

const L: Record<string, BriefLabels> = {
  en: {
    title: 'My real salary', subtitle: (m) => `Personal inflation vs pay${m ? ` · data ${m}` : ''}`,
    pay: 'Pay change, 12 months', inflation: 'My inflation', real: 'Real pay change',
    required: 'Raise needed to keep up', byCategory: 'Where prices rose for me', share: 'Share of my spending',
    rate: 'Price change', receipts: 'my receipts', official: 'official data', drivers: 'Biggest drivers',
    sources: (c, m) => `Sources: my spending in the app; Eurostat HICP${c ? ` for ${c}` : ''}${m ? `, ${m}` : ''}; my scanned receipts.`,
    sourcesReceiptsOnly: 'Sources: my spending in the app and my scanned receipts only — no official data for my country.',
    disclaimer: 'An estimate from my own spending and public price statistics — not financial advice.',
  },
  pl: {
    title: 'Moja realna pensja', subtitle: (m) => `Osobista inflacja a wynagrodzenie${m ? ` · dane ${m}` : ''}`,
    pay: 'Zmiana wynagrodzenia, 12 mies.', inflation: 'Moja inflacja', real: 'Realna zmiana wynagrodzenia',
    required: 'Podwyżka potrzebna, by nie tracić', byCategory: 'Gdzie ceny wzrosły u mnie', share: 'Udział w moich wydatkach',
    rate: 'Zmiana cen', receipts: 'moje paragony', official: 'dane oficjalne', drivers: 'Największe czynniki',
    sources: (c, m) => `Źródła: moje wydatki w aplikacji; Eurostat HICP${c ? ` dla ${c}` : ''}${m ? `, ${m}` : ''}; moje zeskanowane paragony.`,
    sourcesReceiptsOnly: 'Źródła: tylko moje wydatki w aplikacji i moje zeskanowane paragony — brak danych oficjalnych dla mojego kraju.',
    disclaimer: 'Szacunek na podstawie moich wydatków i publicznych statystyk cen — nie jest to porada finansowa.',
  },
  de: {
    title: 'Mein Reallohn', subtitle: (m) => `Persönliche Inflation vs. Gehalt${m ? ` · Daten ${m}` : ''}`,
    pay: 'Gehaltsänderung, 12 Monate', inflation: 'Meine Inflation', real: 'Reale Gehaltsänderung',
    required: 'Nötige Erhöhung, um mitzuhalten', byCategory: 'Wo die Preise für mich stiegen', share: 'Anteil an meinen Ausgaben',
    rate: 'Preisänderung', receipts: 'meine Belege', official: 'amtliche Daten', drivers: 'Größte Treiber',
    sources: (c, m) => `Quellen: meine Ausgaben in der App; Eurostat HVPI${c ? ` für ${c}` : ''}${m ? `, ${m}` : ''}; meine gescannten Belege.`,
    sourcesReceiptsOnly: 'Quellen: nur meine Ausgaben in der App und meine gescannten Belege – keine amtlichen Daten für mein Land.',
    disclaimer: 'Eine Schätzung aus meinen Ausgaben und öffentlichen Preisstatistiken – keine Finanzberatung.',
  },
  es: {
    title: 'Mi salario real', subtitle: (m) => `Inflación personal frente al sueldo${m ? ` · datos ${m}` : ''}`,
    pay: 'Cambio de sueldo, 12 meses', inflation: 'Mi inflación', real: 'Cambio real del sueldo',
    required: 'Subida necesaria para no perder', byCategory: 'Dónde subieron mis precios', share: 'Parte de mi gasto',
    rate: 'Cambio de precios', receipts: 'mis recibos', official: 'datos oficiales', drivers: 'Mayores causas',
    sources: (c, m) => `Fuentes: mis gastos en la app; IPCA de Eurostat${c ? ` para ${c}` : ''}${m ? `, ${m}` : ''}; mis recibos escaneados.`,
    sourcesReceiptsOnly: 'Fuentes: solo mis gastos en la app y mis recibos escaneados; no hay datos oficiales para mi país.',
    disclaimer: 'Una estimación a partir de mis gastos y estadísticas públicas de precios; no es asesoramiento financiero.',
  },
  fr: {
    title: 'Mon salaire réel', subtitle: (m) => `Inflation personnelle et salaire${m ? ` · données ${m}` : ''}`,
    pay: 'Évolution du salaire, 12 mois', inflation: 'Mon inflation', real: 'Évolution réelle du salaire',
    required: 'Augmentation nécessaire pour suivre', byCategory: 'Où mes prix ont augmenté', share: 'Part de mes dépenses',
    rate: 'Évolution des prix', receipts: 'mes tickets', official: 'données officielles', drivers: 'Principaux facteurs',
    sources: (c, m) => `Sources : mes dépenses dans l'app ; IPCH d'Eurostat${c ? ` pour ${c}` : ''}${m ? `, ${m}` : ''} ; mes tickets scannés.`,
    sourcesReceiptsOnly: 'Sources : uniquement mes dépenses dans l’app et mes tickets scannés — aucune donnée officielle pour mon pays.',
    disclaimer: 'Une estimation à partir de mes dépenses et de statistiques publiques de prix — pas un conseil financier.',
  },
  ru: {
    title: 'Моя реальная зарплата', subtitle: (m) => `Личная инфляция и зарплата${m ? ` · данные за ${m}` : ''}`,
    pay: 'Изменение зарплаты за 12 месяцев', inflation: 'Моя инфляция', real: 'Реальное изменение зарплаты',
    required: 'Нужная прибавка, чтобы не отставать', byCategory: 'Где цены выросли для меня', share: 'Доля моих расходов',
    rate: 'Изменение цен', receipts: 'мои чеки', official: 'официальные данные', drivers: 'Главные причины',
    sources: (c, m) => `Источники: мои расходы в приложении; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мои отсканированные чеки.`,
    sourcesReceiptsOnly: 'Источники: только мои расходы в приложении и мои отсканированные чеки — официальных данных по моей стране нет.',
    disclaimer: 'Оценка по моим расходам и открытой статистике цен — не финансовая консультация.',
  },
  ua: {
    title: 'Моя реальна зарплата', subtitle: (m) => `Особиста інфляція і зарплата${m ? ` · дані за ${m}` : ''}`,
    pay: 'Зміна зарплати за 12 місяців', inflation: 'Моя інфляція', real: 'Реальна зміна зарплати',
    required: 'Потрібне підвищення, щоб не відставати', byCategory: 'Де ціни зросли для мене', share: 'Частка моїх витрат',
    rate: 'Зміна цін', receipts: 'мої чеки', official: 'офіційні дані', drivers: 'Головні причини',
    sources: (c, m) => `Джерела: мої витрати в застосунку; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мої відскановані чеки.`,
    sourcesReceiptsOnly: 'Джерела: лише мої витрати в застосунку та мої відскановані чеки — офіційних даних для моєї країни немає.',
    disclaimer: 'Оцінка за моїми витратами та відкритою статистикою цін — не фінансова консультація.',
  },
  be: {
    title: 'Мой рэальны заробак', subtitle: (m) => `Асабістая інфляцыя і заробак${m ? ` · даныя за ${m}` : ''}`,
    pay: 'Змена заробку за 12 месяцаў', inflation: 'Мая інфляцыя', real: 'Рэальная змена заробку',
    required: 'Патрэбнае павышэнне, каб не адставаць', byCategory: 'Дзе цэны выраслі для мяне', share: 'Доля маіх выдаткаў',
    rate: 'Змена цэн', receipts: 'мае чэкі', official: 'афіцыйныя даныя', drivers: 'Галоўныя прычыны',
    sources: (c, m) => `Крыніцы: мае выдаткі ў праграме; Eurostat HICP${c ? ` для ${c}` : ''}${m ? `, ${m}` : ''}; мае адсканаваныя чэкі.`,
    sourcesReceiptsOnly: 'Крыніцы: толькі мае выдаткі ў праграме і мае адсканаваныя чэкі — афіцыйных даных па маёй краіне няма.',
    disclaimer: 'Ацэнка па маіх выдатках і адкрытай статыстыцы цэн — не фінансавая кансультацыя.',
  },
  nl: {
    title: 'Mijn reële salaris', subtitle: (m) => `Persoonlijke inflatie tegenover loon${m ? ` · gegevens ${m}` : ''}`,
    pay: 'Loonsverandering, 12 maanden', inflation: 'Mijn inflatie', real: 'Reële loonsverandering',
    required: 'Nodige verhoging om bij te blijven', byCategory: 'Waar mijn prijzen stegen', share: 'Deel van mijn uitgaven',
    rate: 'Prijsverandering', receipts: 'mijn bonnen', official: 'officiële cijfers', drivers: 'Grootste oorzaken',
    sources: (c, m) => `Bronnen: mijn uitgaven in de app; Eurostat HICP${c ? ` voor ${c}` : ''}${m ? `, ${m}` : ''}; mijn gescande bonnen.`,
    sourcesReceiptsOnly: 'Bronnen: alleen mijn uitgaven in de app en mijn gescande bonnen — geen officiële cijfers voor mijn land.',
    disclaimer: 'Een schatting op basis van mijn uitgaven en openbare prijsstatistieken — geen financieel advies.',
  },
};

/** Own-property lookup only: `?lang=__proto__` must not reach Object.prototype. */
function langCode(lang: string): string {
  return Object.prototype.hasOwnProperty.call(L, lang) ? lang : 'en';
}

/** The sources footnote; a receipts-only answer (no official data) must not cite Eurostat. */
export function sourcesLine(data: RealSalaryResponse, lang: string): string {
  const t = L[langCode(lang)];
  return data.dataMonth === null ? t.sourcesReceiptsOnly : t.sources(data.country, data.dataMonth);
}

/** Deterministic, no LLM: every number comes straight from the response. */
@Injectable()
export class RealSalaryBriefPdf {
  render(data: RealSalaryResponse, lang: string): Promise<Buffer> {
    if (data.status !== 'ready') return Promise.reject(new Error('Real salary is not ready'));
    const code = langCode(lang);
    const t = L[code];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('Inter', FONT_REGULAR);
      doc.registerFont('Inter-Bold', FONT_BOLD);

      doc.font('Inter-Bold').fontSize(22).text(t.title);
      doc.font('Inter').fontSize(11).fillColor('#555555').text(t.subtitle(data.dataMonth)).moveDown(1.2);

      const kv = (label: string, value: string, bold = false) => {
        doc.fillColor('#000000').font('Inter').fontSize(12).text(label, { continued: true });
        doc.font(bold ? 'Inter-Bold' : 'Inter').text(`  ${value}`);
      };
      kv(t.pay, pct(data.nominalChangePct));
      kv(t.inflation, pct(data.personalInflationPct));
      kv(t.real, pct(data.realChangePct), true);
      kv(t.required, pct(data.requiredRaisePct), true);
      doc.moveDown(1.2);

      doc.font('Inter-Bold').fontSize(14).text(t.byCategory).moveDown(0.4);
      doc.font('Inter').fontSize(10).fillColor('#555555').text(`${t.share} · ${t.rate}`).moveDown(0.3);
      for (const row of data.breakdown) {
        const src = row.source === 'receipts' ? t.receipts : t.official;
        doc.fillColor('#000000').fontSize(11)
          .text(`${divisionLabel(row.division, code)} — ${Math.round(row.weight * 100)}% · ${pct(row.ratePct)} (${src})`);
      }
      if (data.topDrivers.length > 0) {
        doc.moveDown(0.8).font('Inter-Bold').fontSize(12).text(t.drivers);
        doc.font('Inter').fontSize(11).text(data.topDrivers.map((d) => divisionLabel(d, code)).join(', '));
      }

      doc.moveDown(1.5).fontSize(9).fillColor('#777777').text(sourcesLine(data, code));
      doc.moveDown(0.3).text(t.disclaimer);
      doc.end();
    });
  }
}
