import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useStyles, type Theme } from '@/theme';

// 1..31 — every possible financial-month anchor day. "Calendar month" (null)
// is rendered as its own row above this list, not as a 0th entry here.
const ANCHOR_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface FinancialMonthSheetProps {
  visible: boolean;
  onClose: () => void;
  pendingAnchorDay: number | null;
  onSelectDay: (day: number | null) => void;
  onSave: () => void;
  saving: boolean;
}

export function FinancialMonthSheet({
  visible,
  onClose,
  pendingAnchorDay,
  onSelectDay,
  onSave,
  saving,
}: FinancialMonthSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.anchorOverlay}>
        <TouchableOpacity style={styles.anchorBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.anchorSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          <View style={styles.anchorHandle} />
          <Text style={styles.anchorTitle}>{t('accounts.financialMonthPickerTitle')}</Text>
          <Text style={styles.anchorHint}>{t('accounts.financialMonthHint')}</Text>
          {pendingAnchorDay !== null && pendingAnchorDay > 28 && (
            <Text style={styles.anchorClamped}>{t('accounts.financialMonthClamped')}</Text>
          )}
          <ScrollView style={styles.anchorList} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.anchorOption}
              onPress={() => onSelectDay(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.anchorOptionText}>{t('accounts.financialMonthCalendar')}</Text>
              {pendingAnchorDay === null && (
                <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
            {ANCHOR_DAYS.map((day) => (
              <React.Fragment key={day}>
                <TouchableOpacity
                  style={styles.anchorOption}
                  onPress={() => onSelectDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.anchorOptionText}>{day}</Text>
                  {pendingAnchorDay === day && (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
                {day < 31 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </ScrollView>
          <View style={styles.anchorActions}>
            <TouchableOpacity style={styles.anchorCancelButton} onPress={onClose}>
              <Text style={styles.anchorCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.anchorSaveButton, saving && styles.anchorSaveButtonDisabled]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.anchorSaveText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  anchorOverlay: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  anchorBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  anchorSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    maxHeight: '80%' as const,
  },
  anchorHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  anchorTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  anchorHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  anchorClamped: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    marginBottom: theme.spacing[3],
  },
  anchorList: {
    marginBottom: theme.spacing[4],
  },
  anchorOption: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
  },
  anchorOptionText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  anchorActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  anchorCancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  anchorCancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: theme.colors.textSecondary,
  },
  anchorSaveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  anchorSaveButtonDisabled: {
    opacity: 0.6,
  },
  anchorSaveText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
});
