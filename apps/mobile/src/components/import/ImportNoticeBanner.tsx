import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { Notice } from '@/features/import/previewNotices';

interface Props {
  notice: Notice;
  /** Rendered as a trailing action; used by the assumed-currency notice. */
  actionLabel?: string;
  onAction?: () => void;
}

export default function ImportNoticeBanner({ notice, actionLabel, onAction }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const isWarning = notice.tone === 'warning';
  const tint = isWarning ? theme.colors.warning : theme.colors.textSecondary;

  return (
    <View style={[styles.banner, isWarning && styles.bannerWarning]}>
      <Ionicons
        name={isWarning ? 'warning-outline' : 'information-circle-outline'}
        size={18}
        color={tint}
      />
      <View style={styles.textWrap}>
        <Text style={styles.text}>{t(notice.key, notice.params)}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    gap: theme.spacing[2],
  },
  bannerWarning: {
    backgroundColor: theme.colors.warningLight,
  },
  textWrap: {
    flex: 1,
    gap: theme.spacing[1],
  },
  text: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  action: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
    fontFamily: theme.fonts.medium,
  },
});
