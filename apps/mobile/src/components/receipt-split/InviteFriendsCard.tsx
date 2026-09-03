import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  onInvite: () => void;
  onDismiss: () => void;
}

/**
 * The one place the app asks anyone to use the referral programme.
 *
 * Deliberately an inline card and not a modal: it appears under a split whose
 * friend has just paid, where the user is reading rather than mid-task, and it
 * can be ignored by scrolling past. The prompts that do interrupt (the
 * store-rating sheet) live on other paths on purpose — see `shouldOfferInvite`.
 *
 * Whether it appears at all is `shouldOfferInvite`'s decision; this component
 * only renders.
 */
export function InviteFriendsCard({ onInvite, onDismiss }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="gift-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.title}>{t('referral.inviteCardTitle')}</Text>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={t('common.cancel')}
        >
          <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.body}>{t('referral.inviteCardBody')}</Text>

      <TouchableOpacity style={styles.action} onPress={onInvite} activeOpacity={0.7}>
        <Text style={styles.actionText}>{t('referral.inviteCardAction')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  body: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  action: {
    alignSelf: 'flex-start' as const,
    paddingVertical: theme.spacing[2],
  },
  actionText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
});
