/**
 * Android implementation of the NotificationCapture bridge.
 * Wraps the legacy (Old-Arch) NativeModule registered by NotificationCapturePackage.
 * No TurboModule spec — avoids Windows MAX_PATH / Fabric codegen (CLAUDE.md constraint).
 */
import { NativeModules, DeviceEventEmitter } from 'react-native';

const { NotificationCaptureModule } = NativeModules;

if (!NotificationCaptureModule) {
  // This can happen in tests or if the Gradle build didn't pick up the Kotlin file.
  // Fail loudly in dev so the engineer notices immediately.
  if (__DEV__) {
    console.warn(
      '[NotificationCapture] NativeModule "NotificationCaptureModule" not found. ' +
        'Ensure NotificationCapturePackage is registered in MainApplication.kt and the ' +
        'app was rebuilt (not just Metro-restarted).',
    );
  }
}

/** Payload emitted by BankNotificationListenerService via DeviceEventEmitter. */
export interface BankNotificationPayload {
  packageName: string;
  title: string;
  text: string;
  /** Unix timestamp (ms) from StatusBarNotification.postTime */
  postedAt: number;
}

/** Check whether the OS-level notification listener permission is granted. */
export async function isPermissionGranted(): Promise<boolean> {
  if (!NotificationCaptureModule) return false;
  return NotificationCaptureModule.isPermissionGranted();
}

/** Open the OS Notification Listener Settings screen so the user can grant the permission. */
export async function openPermissionSettings(): Promise<void> {
  if (!NotificationCaptureModule) return;
  return NotificationCaptureModule.openPermissionSettings();
}

/**
 * Set whether the native service should forward notification events to JS.
 * Persisted across app restarts via SharedPreferences.
 */
export async function setEnabled(enabled: boolean): Promise<void> {
  if (!NotificationCaptureModule) return;
  return NotificationCaptureModule.setEnabled(enabled);
}

/** Read the persisted enabled flag (for restoring toggle state). */
export async function isEnabled(): Promise<boolean> {
  if (!NotificationCaptureModule) return false;
  return NotificationCaptureModule.isEnabled();
}

/**
 * Subscribe to bank notification events forwarded by BankNotificationListenerService.
 * Returns an unsubscribe function — call it from a cleanup effect.
 */
export function addBankNotificationListener(
  handler: (payload: BankNotificationPayload) => void,
): () => void {
  const sub = DeviceEventEmitter.addListener('onBankNotification', handler);
  return () => sub.remove();
}

/**
 * Display map for the auto-capture settings screen.
 * Must stay in sync with BANK_PACKAGES in BankNotificationListenerService.kt.
 * Grouped by country for readability.
 *
 * Banks are grouped into sections using the `section` field (informational
 * only — the UI renders them as flat rows scrolled inside the card).
 */
export const BANK_PACKAGES_DISPLAY: ReadonlyArray<{
  packageName: string;
  label: string;
  /** ISO 3166-1 alpha-2 country/region tag, for grouping UI. */
  country: string;
}> = [
  // Poland
  { packageName: 'pl.pkobp.iko', label: 'PKO BP', country: 'PL' },
  { packageName: 'pl.mbank', label: 'mBank', country: 'PL' },
  { packageName: 'eu.eleader.mobilebanking.pekao', label: 'Pekao', country: 'PL' },
  { packageName: 'pl.ing.mojeing', label: 'ING Bank Śląski', country: 'PL' },
  { packageName: 'wit.android.bcpBankingApp.millenniumPL', label: 'Millennium Bank', country: 'PL' },
  { packageName: 'pl.bzwbk.bzwbk24', label: 'Santander PL', country: 'PL' },
  { packageName: 'pl.aliorbank.aib', label: 'Alior Bank', country: 'PL' },
  { packageName: 'com.finanteq.finance.bgz', label: 'BNP Paribas PL', country: 'PL' },
  { packageName: 'pl.ca.mobile', label: 'Crédit Agricole PL', country: 'PL' },
  { packageName: 'pl.nestbank.nestbank', label: 'Nest Bank', country: 'PL' },
  { packageName: 'pl.toyota.bank', label: 'Toyota Bank', country: 'PL' },
  // Cross-border neobanks
  { packageName: 'com.revolut.revolut', label: 'Revolut', country: 'EU' },
  { packageName: 'de.number26.android', label: 'N26', country: 'EU' },
  { packageName: 'com.bunq.android', label: 'bunq', country: 'EU' },
  // Germany / Austria
  { packageName: 'com.db.pbc.mbank', label: 'Deutsche Bank', country: 'DE' },
  { packageName: 'de.commerzbanking.mobil', label: 'Commerzbank', country: 'DE' },
  { packageName: 'de.dkb.portalapp', label: 'DKB', country: 'DE' },
  { packageName: 'de.ingdiba.bankingapp', label: 'ING-DiBa', country: 'DE' },
  { packageName: 'com.starfinanz.smob.android.sfinanzstatus', label: 'Sparkasse', country: 'DE' },
  { packageName: 'de.fiduciagad.android.vrbanking', label: 'VR Banking', country: 'DE' },
  { packageName: 'de.comdirect.android', label: 'Comdirect', country: 'DE' },
  { packageName: 'at.erstebank.george', label: 'George (Erste)', country: 'AT' },
  // France
  { packageName: 'net.bnpparibas.mescomptes', label: 'BNP Paribas', country: 'FR' },
  { packageName: 'fr.creditagricole.androidapp', label: 'Crédit Agricole', country: 'FR' },
  { packageName: 'com.boursorama.android.clients', label: 'Boursorama', country: 'FR' },
  { packageName: 'mobi.societegenerale.mobile.lappli', label: 'Société Générale', country: 'FR' },
  { packageName: 'fr.lcl.android.customerarea', label: 'LCL', country: 'FR' },
  { packageName: 'fr.banquepopulaire.cyberplus', label: 'Banque Populaire', country: 'FR' },
  // Spain
  { packageName: 'com.bbva.bbvacontigo', label: 'BBVA', country: 'ES' },
  { packageName: 'es.bancosantander.apps', label: 'Santander ES', country: 'ES' },
  { packageName: 'es.lacaixa.mobile.android.newwapicon', label: 'CaixaBank', country: 'ES' },
  { packageName: 'com.bankinter.launcher', label: 'Bankinter', country: 'ES' },
  // Netherlands
  { packageName: 'com.ing.mobile', label: 'ING NL', country: 'NL' },
  { packageName: 'nl.rabomobiel', label: 'Rabobank', country: 'NL' },
  { packageName: 'com.abnamro.nl.mobile.payments', label: 'ABN AMRO', country: 'NL' },
  // Ukraine
  { packageName: 'ua.privatbank.ap24', label: 'PrivatBank', country: 'UA' },
  { packageName: 'com.ftband.mono', label: 'monobank', country: 'UA' },
  { packageName: 'ua.oschadbank.m.oschadmobile', label: 'Oschadbank', country: 'UA' },
  // Russia
  { packageName: 'ru.sberbankmobile', label: 'Sberbank', country: 'RU' },
  { packageName: 'com.idamob.tinkoff.android', label: 'Tinkoff / T-Bank', country: 'RU' },
  { packageName: 'ru.alfabank.mobile.android', label: 'Alfa-Bank', country: 'RU' },
  // Belarus
  { packageName: 'by.bsb.mobile', label: 'BelGazpromBank', country: 'BY' },
];
