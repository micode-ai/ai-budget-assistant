import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useWhatsNewSpotlight } from '@/hooks/useWhatsNewSpotlight';

interface WhatsNewSpotlightProps {
  gateOpen: boolean;
}

/**
 * Self-contained one-time "What's New" nudge — mounted unconditionally in
 * `app/_layout.tsx` next to `<UpdatePrompt />`. Renders nothing until the
 * hook decides there is something to show; see
 * docs/contracts/whats-new-spotlight.md.
 *
 * Bottom-sheet, never a blocking center-screen modal — this is a low-friction
 * discovery nudge, not an interruption the user must resolve.
 */
export function WhatsNewSpotlight({ gateOpen }: WhatsNewSpotlightProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { activeEntry, dismiss, viewDetails } = useWhatsNewSpotlight(gateOpen);

  if (!activeEntry) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={dismiss}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.badgeRow}>
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{t('whatsNew.spotlightNewBadge')}</Text>
            </View>
            {activeEntry.tier && (
              <View style={[styles.tierBadge, { backgroundColor: theme.colors.warning + '20' }]}>
                <Text style={[styles.tierBadgeText, { color: theme.colors.warning }]}>
                  {t(activeEntry.tier === 'business' ? 'whatsNew.tierBusiness' : 'whatsNew.tierPro')}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{activeEntry.title}</Text>
          <Text style={styles.body}>{activeEntry.body}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={dismiss}
              style={styles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel={t('whatsNew.actionGotIt')}
            >
              <Text style={styles.secondaryButtonText}>{t('whatsNew.actionGotIt')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={viewDetails}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('whatsNew.actionLearnMore')}
            >
              <Text style={styles.primaryButtonText}>{t('whatsNew.actionLearnMore')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1 as const,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingBottom: theme.spacing[8],
    paddingTop: theme.spacing[3],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  badgeRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  newBadge: {
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    alignSelf: 'flex-start' as const,
  },
  newBadgeText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontFamily: theme.fonts.semiBold,
  },
  tierBadge: {
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    alignSelf: 'flex-start' as const,
  },
  tierBadgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[5],
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[3],
  },
  secondaryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  secondaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  primaryButton: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    borderRadius: theme.borderRadius.lg,
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#FFFFFF',
    fontFamily: theme.fonts.semiBold,
  },
});
