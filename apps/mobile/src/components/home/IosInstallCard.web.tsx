import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { trackAction } from '@/services/telemetry';
import {
  DISMISS_KEY,
  SESSION_COMPLETED_KEY,
  isInAppBrowser,
  isIosDevice,
  isStandalone,
  shouldShowIosPrompt,
} from '@/features/install/iosInstall';

function readDismissedAt(): number | null {
  try {
    const v = window.localStorage.getItem(DISMISS_KEY);
    return v == null ? null : Number(v);
  } catch {
    return null; // private mode / blocked storage: behave as never dismissed
  }
}

/**
 * The iOS "Add to Home Screen" card on the web dashboard (ABA-645 phase 1). Shown only on an iPhone/iPad
 * that is not already running the installed web app; dismissible for 14 days. In a social-app webview it
 * asks to open the page in Safari first (those webviews cannot add to the home screen).
 *
 * Telemetry (flow `ios_install`): `started` once per mount when the card is shown, `completed` once per
 * browser session when the app is launched standalone on iOS — together they show whether the guide leads
 * to installs. Abandoned is derived on read, never emitted (web-telemetry.md).
 */
export function IosInstallCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const [inApp, setInApp] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const ios = isIosDevice(navigator.userAgent || '', navigator.platform || '', navigator.maxTouchPoints || 0);
    const standalone = isStandalone(
      (navigator as Navigator & { standalone?: unknown }).standalone,
      typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches,
    );
    if (ios && standalone) {
      try {
        if (!window.sessionStorage.getItem(SESSION_COMPLETED_KEY)) {
          window.sessionStorage.setItem(SESSION_COMPLETED_KEY, '1');
          trackAction('ios_install', 'completed');
        }
      } catch {
        /* storage blocked: skip the report rather than double-count */
      }
    }
    const show = shouldShowIosPrompt({ ios, standalone, dismissedAt: readDismissedAt(), now: Date.now() });
    setInApp(isInAppBrowser(navigator.userAgent || ''));
    setVisible(show);
    if (show && !startedRef.current) {
      startedRef.current = true;
      trackAction('ios_install', 'started');
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* the card simply comes back next visit */
    }
  };

  const steps: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    { icon: 'share-outline', text: t('iosInstall.step1') },
    { icon: 'add-circle-outline', text: t('iosInstall.step2') },
    { icon: 'checkmark-circle-outline', text: t('iosInstall.step3') },
  ];

  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait-outline" size={22} color={theme.colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('iosInstall.title')}</Text>
          <Text style={styles.body}>{inApp ? t('iosInstall.inAppBrowser') : t('iosInstall.body')}</Text>
        </View>
        <TouchableOpacity onPress={dismiss} accessibilityRole="button" accessibilityLabel={t('iosInstall.dismiss')} hitSlop={12}>
          <Ionicons name="close" size={22} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>
      {!inApp &&
        steps.map((s, i) => (
          <View key={s.icon} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Ionicons name={s.icon} size={20} color={theme.colors.primary} />
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        ))}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: 16,
    marginBottom: 16,
  },
  header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700' as const, color: theme.colors.textPrimary },
  body: { marginTop: 4, fontSize: 14, color: theme.colors.textSecondary },
  step: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginTop: 12, paddingLeft: 4 },
  stepNum: { width: 18, fontSize: 14, fontWeight: '700' as const, color: theme.colors.textTertiary },
  stepText: { flex: 1, fontSize: 14, color: theme.colors.textPrimary },
});
