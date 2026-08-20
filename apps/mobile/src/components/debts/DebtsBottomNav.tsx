import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface DebtsBottomNavProps {
  bottomInset: number;
}

export function DebtsBottomNav({ bottomInset }: DebtsBottomNavProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.bottomTabBar, { paddingBottom: 8 + bottomInset }]}>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)')}>
        <Ionicons name="home-outline" size={22} color={theme.colors.tabBarInactive} />
        <Text style={styles.tabLabel}>{t('nav.dashboard')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/expenses')}>
        <Ionicons name="receipt-outline" size={22} color={theme.colors.tabBarInactive} />
        <Text style={styles.tabLabel}>{t('nav.expenses')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/budgets')}>
        <Ionicons name="wallet-outline" size={22} color={theme.colors.tabBarInactive} />
        <Text style={styles.tabLabel}>{t('nav.budgets')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/analytics')}>
        <Ionicons name="bar-chart-outline" size={22} color={theme.colors.tabBarInactive} />
        <Text style={styles.tabLabel}>{t('nav.analytics')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tabItem} onPress={() => router.replace('/(tabs)/chat')}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.tabBarInactive} />
        <Text style={styles.tabLabel}>{t('nav.aiChat')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  bottomTabBar: {
    flexDirection: 'row' as const,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 2,
  },
  tabLabel: {
    ...theme.textStyles.tabLabel,
    color: theme.colors.tabBarInactive,
  },
});
