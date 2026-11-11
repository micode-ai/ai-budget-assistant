import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { droppedPages } from '@/features/leaflets/leafletDisplay';
import type { LeafletReader, LeafletReaderError } from '@/features/leaflets/useLeafletReader';

/** Full-area message for a read that could not start; shared by the phone and desktop bodies. */
export function LeafletErrorState({ error, onRetry }: { error: Exclude<LeafletReaderError, null>; onRetry: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const content = {
    empty_basket: { icon: 'receipt-outline', title: 'leaflets.emptyBasketTitle', body: 'leaflets.emptyBasketBody' },
    encrypted: { icon: 'lock-closed-outline', title: 'leaflets.encryptedTitle', body: 'leaflets.encryptedBody' },
    failed: { icon: 'alert-circle-outline', title: 'leaflets.failedTitle', body: 'leaflets.failedBody' },
  }[error];

  return (
    <View style={styles.state}>
      <Ionicons name={content.icon as 'receipt-outline'} size={44} color={theme.colors.textTertiary} />
      <Text style={styles.stateTitle}>{t(content.title)}</Text>
      <Text style={styles.stateBody}>{t(content.body)}</Text>
      {error === 'empty_basket' && (
        <Pressable
          onPress={() => router.push('/expense/receipt' as never)}
          accessibilityRole="link"
          style={styles.action}
        >
          <Text style={styles.actionText}>{t('leaflets.scanReceipt')}</Text>
        </Pressable>
      )}
      {error === 'failed' && (
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.action}>
          <Text style={styles.actionText}>{t('common.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Inline warnings (never a dialog): unreadable pages, pages not read, a PDF over 10 MB. */
export function LeafletNoticeBanners({ reader }: { reader: LeafletReader }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const unreadable = reader.result?.pagesUnreadable ?? 0;
  const dropped = droppedPages(reader);

  const lines: string[] = [];
  if (reader.tooLargePdf) lines.push(t('leaflets.tooLargePdf'));
  if (unreadable > 0) lines.push(t('leaflets.unreadable', { count: unreadable }));
  if (dropped > 0) lines.push(t('leaflets.dropped', { count: dropped }));
  if (lines.length === 0) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
      <View style={styles.bannerLines}>
        {lines.map((line) => (
          <Text key={line} style={styles.bannerText}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  state: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[6],
  },
  stateTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  stateBody: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    maxWidth: 420,
  },
  action: {
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  actionText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
  },
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.warningLight,
  },
  bannerLines: {
    flex: 1,
    gap: theme.spacing[1],
  },
  bannerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
});
