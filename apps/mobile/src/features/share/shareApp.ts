import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { showAlert } from '@/utils/alert';
import { buildTaggedPlayUrl, buildTaggedWebUrl, toLangTag } from './appShareLink';

/** Link for a share surface that has no `t` at hand (image-card text fallbacks). */
export function playLinkFor(src: string, loc: string): string {
  return buildTaggedPlayUrl({ src, loc, lang: toLangTag(i18n.language) });
}

/** The message of the Settings "Share AI Budget" row. Link lines end the line so messengers linkify them. */
export function buildShareAppMessage(t: TFunction, lang: string): string {
  const tags = { src: 'share', loc: 'settings', lang: toLangTag(lang) };
  return [
    t('shareApp.message'),
    '',
    buildTaggedPlayUrl(tags),
    '',
    t('shareApp.webLine'),
    buildTaggedWebUrl(tags),
  ].join('\n');
}

/** Opens the share sheet; on a browser without `navigator.share`, copies the message instead. */
export async function shareApp(t: TFunction): Promise<void> {
  const message = buildShareAppMessage(t, i18n.language);
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }) : undefined;
      if (nav?.share) {
        await nav.share({ text: message });
        return;
      }
      await Clipboard.setStringAsync(message);
      showAlert(t('shareApp.title'), t('shareApp.copied'));
      return;
    }
    await Share.share({ message });
  } catch {
    // user dismissed the sheet / share unavailable - no-op
  }
}
