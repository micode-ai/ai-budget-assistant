import { TouchableOpacity } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { ExchangeView } from '@/components/wallet/ExchangeView';

export default function ExchangeScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  // Populated when this screen was opened from a rate_watch_hit push deep-link
  // (see src/services/notifications.ts) so the pair the alert fired for is prefilled.
  const params = useLocalSearchParams<{ fromCurrency?: string; toCurrency?: string }>();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/wallet/exchanges')}
              accessibilityLabel={t('exchange.allExchanges')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="time-outline" size={24} color={theme.colors.textInverse} />
            </TouchableOpacity>
          ),
        }}
      />
      <ExchangeView
        initialFromCurrency={params.fromCurrency}
        initialToCurrency={params.toCurrency}
        onSaved={() => router.back()}
      />
    </>
  );
}
