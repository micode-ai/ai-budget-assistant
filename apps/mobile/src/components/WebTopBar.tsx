import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { AccountSwitcher, CurrencyPill } from '@/components/AccountSwitcher';
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
      {title ? (
        <Text style={[styles.title, { color: theme.colors.textInverse }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}

      <View style={styles.spacer} />

      <View style={styles.controls}>
        <AccountSwitcher compact showCurrency={false} />
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
