/**
 * Labels for the consolidated (all-accounts) report, shared by the CSV, Excel and PDF
 * generators. Keys are the app's internal locale codes (`pt` = European, `br` = Brazilian Portuguese), looked up
 * directly and never passed to Intl; an unknown locale falls back to en.
 */
import type { LedgerNote } from '../../all-accounts/all-accounts.types';

export interface ConsolidatedLabels {
  allAccounts: string;
  accounts: string;
  notIncluded: string;
  other: string;
  notes: Record<NonNullable<LedgerNote>, string>;
}

const LABELS: Record<string, ConsolidatedLabels> = {
  en: {
    allAccounts: 'All accounts',
    accounts: 'Accounts',
    notIncluded: 'not included (encrypted)',
    other: 'Other',
    notes: { planned: 'Planned', splitReceivable: 'Split with others', internalTransfer: 'Transfer between own accounts' },
  },
  de: {
    allAccounts: 'Alle Konten',
    accounts: 'Konten',
    notIncluded: 'nicht enthalten (verschlüsselt)',
    other: 'Sonstiges',
    notes: { planned: 'Geplant', splitReceivable: 'Mit anderen geteilt', internalTransfer: 'Umbuchung zwischen eigenen Konten' },
  },
  es: {
    allAccounts: 'Todas las cuentas',
    accounts: 'Cuentas',
    notIncluded: 'no incluida (cifrada)',
    other: 'Otros',
    notes: { planned: 'Planificado', splitReceivable: 'Dividido con otros', internalTransfer: 'Transferencia entre cuentas propias' },
  },
  fr: {
    allAccounts: 'Tous les comptes',
    accounts: 'Comptes',
    notIncluded: 'non inclus (chiffré)',
    other: 'Autres',
    notes: { planned: 'Planifié', splitReceivable: "Partagé avec d'autres", internalTransfer: 'Virement entre comptes personnels' },
  },
  pl: {
    allAccounts: 'Wszystkie konta',
    accounts: 'Konta',
    notIncluded: 'nieuwzględnione (zaszyfrowane)',
    other: 'Inne',
    notes: { planned: 'Zaplanowane', splitReceivable: 'Podzielone z innymi', internalTransfer: 'Przelew między własnymi kontami' },
  },
  ru: {
    allAccounts: 'Все счета',
    accounts: 'Счета',
    notIncluded: 'не включён (зашифрован)',
    other: 'Прочее',
    notes: { planned: 'Запланировано', splitReceivable: 'Разделено с другими', internalTransfer: 'Перевод между своими счетами' },
  },
  ua: {
    allAccounts: 'Усі рахунки',
    accounts: 'Рахунки',
    notIncluded: 'не включено (зашифровано)',
    other: 'Інше',
    notes: { planned: 'Заплановано', splitReceivable: 'Розділено з іншими', internalTransfer: 'Переказ між власними рахунками' },
  },
  be: {
    allAccounts: 'Усе рахункі',
    accounts: 'Рахункі',
    notIncluded: 'не ўключаны (зашыфраваны)',
    other: 'Іншае',
    notes: { planned: 'Запланавана', splitReceivable: 'Падзелена з іншымі', internalTransfer: 'Перавод паміж уласнымі рахункамі' },
  },
  nl: {
    allAccounts: 'Alle rekeningen',
    accounts: 'Rekeningen',
    notIncluded: 'niet opgenomen (versleuteld)',
    other: 'Overig',
    notes: { planned: 'Gepland', splitReceivable: 'Gedeeld met anderen', internalTransfer: 'Overboeking tussen eigen rekeningen' },
  },
  // European Portuguese
  pt: {
    allAccounts: 'Todas as contas',
    accounts: 'Contas',
    notIncluded: 'não incluída (encriptada)',
    other: 'Outros',
    notes: { planned: 'Planeado', splitReceivable: 'Dividido com outros', internalTransfer: 'Transferência entre contas próprias' },
  },
  // Brazilian Portuguese
  br: {
    allAccounts: 'Todas as contas',
    accounts: 'Contas',
    notIncluded: 'não incluída (criptografada)',
    other: 'Outros',
    notes: { planned: 'Planejado', splitReceivable: 'Dividido com outros', internalTransfer: 'Transferência entre contas próprias' },
  },
};

export function consolidatedLabels(locale?: string): ConsolidatedLabels {
  return (locale && LABELS[locale]) || LABELS.en;
}
