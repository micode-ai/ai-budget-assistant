import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { useStyles, type Theme } from '@/theme';
import { useTranslation } from 'react-i18next';
import { useGamificationStore } from '@/stores/gamificationStore';
import { ACHIEVEMENT_DEFINITIONS } from './achievementData';

const GOLD_ACCENT = '#F5A623';
const GOLD_BG_LIGHT = '#FFF9EE';
const GOLD_BG_DARK = '#3D2E0A';

export function NewBadgeModal() {
  const styles = useStyles(createStyles);
  const { t } = useTranslation();
  const { newBadgeToShow, dismissNewBadge } = useGamificationStore();

  const def = newBadgeToShow
    ? ACHIEVEMENT_DEFINITIONS.find((d) => d.id === newBadgeToShow.achievementId)
    : null;

  if (!def || !newBadgeToShow) return null;

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={dismissNewBadge}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.shimmerTopLeft} />
          <View style={styles.shimmerBottomRight} />
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{def.icon}</Text>
          </View>
          <Text style={styles.title}>{t('gamification.badges.unlocked')}</Text>
          <Text style={styles.achievementTitle}>
            {t(`gamification.achievements.${def.i18nKey}.title` as any)}
          </Text>
          <Text style={styles.achievementDescription}>
            {t(`gamification.achievements.${def.i18nKey}.description` as any)}
          </Text>
          <Text style={styles.xpText}>{t('gamification.badges.xpEarned', { xp: def.xpReward })}</Text>
          <TouchableOpacity style={styles.button} onPress={dismissNewBadge}>
            <Text style={styles.buttonText}>{t('common.ok')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => {
  const isDark = theme.colors.background === '#0F1117';
  const goldBg = isDark ? GOLD_BG_DARK : GOLD_BG_LIGHT;

  return {
    overlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: theme.spacing[6],
    },
    container: {
      backgroundColor: goldBg,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 2,
      borderColor: GOLD_ACCENT,
      padding: theme.spacing[6],
      alignItems: 'center' as const,
      width: '100%' as const,
      maxWidth: 320,
      overflow: 'hidden' as const,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: theme.spacing[4],
      borderWidth: 3,
      borderColor: GOLD_ACCENT,
    },
    icon: {
      fontSize: 40,
      lineHeight: 48,
    },
    title: {
      ...theme.textStyles.h3,
      color: GOLD_ACCENT,
      textAlign: 'center' as const,
      marginBottom: theme.spacing[2],
    },
    achievementTitle: {
      ...theme.textStyles.bodyLargeSemiBold,
      color: theme.colors.textPrimary,
      textAlign: 'center' as const,
      marginBottom: theme.spacing[1],
    },
    achievementDescription: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textSecondary,
      textAlign: 'center' as const,
      marginBottom: theme.spacing[3],
    },
    xpText: {
      ...theme.textStyles.bodyMedium,
      color: GOLD_ACCENT,
      fontWeight: '700' as const,
      marginBottom: theme.spacing[4],
    },
    button: {
      backgroundColor: GOLD_ACCENT,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[8],
    },
    buttonText: {
      ...theme.textStyles.bodyMedium,
      color: '#FFFFFF',
      fontWeight: '600' as const,
    },
    shimmerTopLeft: {
      position: 'absolute' as const,
      top: -20,
      left: -20,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: GOLD_ACCENT,
      opacity: 0.08,
    },
    shimmerBottomRight: {
      position: 'absolute' as const,
      bottom: -20,
      right: -20,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: GOLD_ACCENT,
      opacity: 0.08,
    },
  };
};
