import { TouchableOpacity } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { TransferCreateView } from '@/components/wallet/TransferCreateView';

export default function TransferScreen() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/wallet/transfers')}
              accessibilityLabel={t('transfer.allTransfers')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ paddingHorizontal: 12 }}
            >
              <Ionicons name="time-outline" size={24} color={theme.colors.textInverse} />
            </TouchableOpacity>
          ),
        }}
      />
      <TransferCreateView onSaved={() => router.back()} />
    </>
  );
}
