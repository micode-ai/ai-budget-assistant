import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { AccountSwitcher, CurrencyPill } from '@/components/AccountSwitcher';
import { WebSidebar } from '@/components/WebSidebar';
import { TOP_BAR_HEIGHT } from '@/components/webLayout.constants';

/** Active-section title shown next to the brand for the 5 main tabs. */
function sectionTitle(pathname: string, t: (k: string) => string): string {
  if (pathname === '/' || pathname === '/index') return t('nav.dashboard');
  if (pathname.startsWith('/expenses')) return t('nav.expenses');
  if (pathname.startsWith('/budgets')) return t('nav.budgets');
  if (pathname.startsWith('/analytics')) return t('nav.analytics');
  if (pathname.startsWith('/chat')) return t('nav.aiChat');
  return '';
}

/**
 * Full-width desktop top bar: brand + active-section title on the left, global
 * controls (account, display currency, alerts, settings) on the right. Mounted
 * only by WebShell on desktop web; it replaces the per-screen tab header there.
 */
/**
 * Width cap for the account pill in this bar only.
 *
 * Chosen to be generous enough for a real account name at `compact`'s 12px
 * (roughly 22 characters) while still leaving the horizontal nav its room at
 * the narrowest desktop width, 1024. It is a cap and not a removal: an
 * arbitrarily long name must still truncate rather than push the nav around.
 */
const ACCOUNT_TRIGGER_MAX_WIDTH = 180;

export function WebTopBar() {
  const theme = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();
  const unreadAlertCount = useAlertStore((s) => s.unreadCount);
  const title = sectionTitle(pathname, t);

  const btn = {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.18)',
  };

  return (
    <View style={[styles.bar, { height: TOP_BAR_HEIGHT, backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.brand, { color: theme.colors.textInverse, fontFamily: theme.fonts.bold }]}>
        AI Budget
      </Text>
      <WebSidebar orientation="horizontal" />

      <View style={styles.spacer} />

      <View style={styles.controls}>
        {/* `compact` is kept for its smaller type and tighter padding, which
            suit this bar — but its 110px width cap is a phone-header
            constraint and truncated an ordinary account name to "Investm…"
            here, where the bar carries a `flex: 1` spacer and has room to
            spare at every desktop width. Overridden per caller rather than
            raised in `AccountSwitcher`, which the phone also renders. */}
        <AccountSwitcher compact showCurrency={false} maxTriggerWidth={ACCOUNT_TRIGGER_MAX_WIDTH} />
        <CurrencyPill compact />
        <TouchableOpacity onPress={() => router.push('/alerts')} style={btn}>
          <Ionicons name="notifications-outline" size={20} color={theme.colors.textInverse} />
          {unreadAlertCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadAlertCount > 9 ? '9+' : unreadAlertCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/settings')} style={btn}>
          <Ionicons name="settings-outline" size={20} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  brand: { fontSize: 18 },
  title: { fontSize: 15, marginLeft: 16, opacity: 0.85 },
  spacer: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    position: 'absolute',
    top: -1,
    right: -1,
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
});
