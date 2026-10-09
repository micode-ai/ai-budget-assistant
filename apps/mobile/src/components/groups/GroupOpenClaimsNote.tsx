import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { GroupDetail } from '@budget/shared-types';

/**
 * ABA-656: shown on the settle surfaces while `GroupDetail.hasOpenItemClaims` (an itemised expense is
 * still open for claims). A claim change never voids a settlement, so a payment made now may leave a
 * small balance once the receipt is divided; this says so before the user pays, not after.
 */
export function GroupOpenClaimsNote({
  detail,
  style,
}: {
  detail: Pick<GroupDetail, 'hasOpenItemClaims'>;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  if (!detail.hasOpenItemClaims) return null;
  return (
    <View style={[styles.note, style]} accessibilityRole="text">
      <Ionicons name="receipt-outline" size={16} color={theme.colors.textSecondary} />
      <Text style={styles.text}>{t('groups.openClaimsNote')}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  note: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  text: {
    flex: 1,
    color: theme.colors.textPrimary,
    ...theme.textStyles.bodySm,
  },
});
