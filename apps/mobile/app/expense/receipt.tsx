import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ReceiptExpenseView } from '@/components/receipt/ReceiptExpenseView';
import { useTheme, useStyles, type Theme } from '@/theme';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { useShareIntakeStore } from '@/stores/shareIntakeStore';
import { position, remaining } from '@/features/share-intake/shareIntakeQueue';
import { deleteSharedFile } from '@/services/shareIntake';
import { showAlert } from '@/utils/alert';

/**
 * The routed receipt scanner. Its body lives in `ReceiptExpenseView` so a
 * desktop dialog can host the same flow (`src/` cannot import from `app/`).
 *
 * **This screen's chrome is its own, not `_layout.tsx`'s.** The `expense/receipt`
 * `Stack.Screen` sets `headerShown: false`, so the header row below — close,
 * `receipt.title`, and the `AiUsageBadge` that is this flow's only remaining-quota
 * indicator — is the whole of it. Anything hosting `ReceiptExpenseView` elsewhere
 * has to reproduce all three; there is nothing in `_layout.tsx` to copy.
 *
 * `?source=share` is share-to-capture: the title becomes "Receipt n of N" and
 * closing asks before discarding the files still waiting in the queue.
 */
export default function ReceiptExpenseScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { source } = useLocalSearchParams<{ source?: string }>();
  const shareMode = source === 'share';
  const sharePosition = useShareIntakeStore((s) => position(s.queue));

  const discardQueue = () => {
    useShareIntakeStore.getState().discardAll().forEach((f) => void deleteSharedFile(f.uri));
  };

  const close = () => {
    if (!shareMode) {
      router.back();
      return;
    }
    const left = remaining(useShareIntakeStore.getState().queue).length;
    if (left <= 1) {
      discardQueue();
      router.back();
      return;
    }
    showAlert(t('shareIntake.discardTitle'), t('shareIntake.discardBody', { count: left }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('shareIntake.discard'),
        style: 'destructive',
        onPress: () => {
          discardQueue();
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={close} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {shareMode && sharePosition
            ? t('shareIntake.progress', { n: sharePosition.n, of: sharePosition.of })
            : t('receipt.title')}
        </Text>
        <AiUsageBadge />
      </View>

      <ReceiptExpenseView onDone={() => router.back()} shareMode={shareMode} />
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
