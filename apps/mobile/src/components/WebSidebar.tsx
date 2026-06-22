import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { usePathname, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { SIDEBAR_WIDTH } from '@/components/webLayout.constants';

const tabIcons = {
  home: require('../../assets/widget-icons/home.png'),
  transactions: require('../../assets/widget-icons/transactions.png'),
  budget: require('../../assets/widget-icons/budget.png'),
  analytics: require('../../assets/widget-icons/analytics.png'),
  ai_chat: require('../../assets/widget-icons/ai_chat.png'),
};

/**
 * Desktop left navigation rail — the 5 primary sections only. Brand and the
 * global controls (account/currency/alerts/settings) live in WebTopBar, so the
 * sidebar stays focused on section navigation. Mounted only by WebShell on
 * desktop web.
 */
export function WebSidebar() {
  const theme = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();

  // route base used for both navigation and active-state matching
  const primary = [
    { key: 'home', route: '/(tabs)', match: ['/', '/index'], label: t('nav.dashboard'), img: tabIcons.home },
    { key: 'expenses', route: '/(tabs)/expenses', match: ['/expenses'], label: t('nav.expenses'), img: tabIcons.transactions },
    { key: 'budgets', route: '/(tabs)/budgets', match: ['/budgets'], label: t('nav.budgets'), img: tabIcons.budget },
    { key: 'analytics', route: '/(tabs)/analytics', match: ['/analytics'], label: t('nav.analytics'), img: tabIcons.analytics },
    { key: 'chat', route: '/(tabs)/chat', match: ['/chat'], label: t('nav.aiChat'), img: tabIcons.ai_chat },
  ] as const;

  const isActive = (match: readonly string[]) =>
    match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m)));

  return (
    <View style={[styles.sidebar, { width: SIDEBAR_WIDTH, backgroundColor: theme.colors.primary }]}>
      {primary.map((item) => {
        const active = isActive(item.match);
        return (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, active && { backgroundColor: 'rgba(255,255,255,0.18)' }]}
            onPress={() => router.push(item.route as never)}
          >
            <Image
              source={item.img}
              style={{ width: 22, height: 22, resizeMode: 'contain', tintColor: theme.colors.textInverse, opacity: active ? 1 : 0.8 }}
            />
            <Text style={[styles.label, { color: theme.colors.textInverse, opacity: active ? 1 : 0.85, fontFamily: theme.fonts.regular }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { height: '100%', paddingTop: 16, paddingHorizontal: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  label: { fontSize: 15 },
});
