import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ReceiptExpenseView } from '@/components/receipt/ReceiptExpenseView';
import { useTheme, useStyles, type Theme } from '@/theme';
import { AiUsageBadge } from '@/components/AiUsageBadge';

/**
 * The routed receipt scanner. Its body lives in `ReceiptExpenseView` so a
 * desktop dialog can host the same flow (`src/` cannot import from `app/`).
 *
 * **This screen's chrome is its own, not `_layout.tsx`'s.** The `expense/receipt`
 * `Stack.Screen` sets `headerShown: false`, so the header row below — close,
 * `receipt.title`, and the `AiUsageBadge` that is this flow's only remaining-quota
 * indicator — is the whole of it. Anything hosting `ReceiptExpenseView` elsewhere
 * has to reproduce all three; there is nothing in `_layout.tsx` to copy.
 */
export default function ReceiptExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('receipt.title')}</Text>
        <AiUsageBadge />
      </View>

      <ReceiptExpenseView onDone={() => router.back()} />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    padding: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
});
