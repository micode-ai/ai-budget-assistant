import { View, Text, Pressable, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { LeafletConsentNoticeState } from '@/features/leaflets/useLeafletConsentNotice';

interface LeafletConsentNoticeProps {
  notice: LeafletConsentNoticeState;
  /** Desktop web (>= 1024): a centred dialog instead of a bottom sheet. */
  centered?: boolean;
}

/**
 * One-time notice for users who already share community prices: leaflet promo prices are now
 * shared the same anonymous way. Shown once (see `useLeafletConsentNotice`); a scrim tap or the
 * back button counts as "OK" - the notice informs, it does not block reading the leaflet.
 */
export function LeafletConsentNotice({ notice, centered = false }: LeafletConsentNoticeProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  if (!notice.visible) return null;

  return (
    <Modal visible transparent animationType={centered ? 'fade' : 'slide'} onRequestClose={notice.acknowledge}>
      <View style={[styles.backdrop, centered && styles.backdropCentered]}>
        <Pressable
          style={styles.scrim}
          onPress={notice.acknowledge}
          accessibilityRole="button"
          accessibilityLabel={t('leaflets.consentOk')}
        />
        {/* Edge-to-edge: the system nav bar overlays this window, so the sheet clears it (ABA-483). */}
        <View
          style={[styles.sheet, centered ? styles.dialog : { paddingBottom: theme.spacing[8] + insets.bottom }]}
          accessibilityViewIsModal
        >
          {!centered && <View style={styles.handle} />}
          <View style={styles.titleRow}>
            <Ionicons name="people-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.title} accessibilityRole="header">
              {t('leaflets.consentTitle')}
            </Text>
          </View>
          <Text style={styles.body}>{t('leaflets.consentBody')}</Text>
          <View style={styles.actions}>
            <Pressable onPress={notice.decline} accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('leaflets.consentDecline')}</Text>
            </Pressable>
            <Pressable onPress={notice.acknowledge} accessibilityRole="button" style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{t('leaflets.consentOk')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1 as const,
    justifyContent: 'flex-end' as const,
  },
  backdropCentered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  scrim: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  dialog: {
    width: 480,
    maxWidth: '90%' as const,
    borderRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing[5],
    paddingBottom: theme.spacing[5],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1 as const,
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
    flexWrap: 'wrap' as const,
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
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    fontFamily: theme.fonts.semiBold,
  },
});
