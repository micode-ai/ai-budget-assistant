import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface AddPersonRowProps {
  value: string;
  onChangeText: (text: string) => void;
  onConfirm: () => void;
  recentNames: string[];
  onSelectRecent: (name: string) => void;
}

/**
 * The name-entry row + "people you've split with before" suggestion chips
 * for the receipt-split creation form. State/logic lives in
 * `useAddParticipant` (`src/hooks/`); this component is purely presentational.
 * Rendered by `AssignmentEditor.tsx` only while its add-person sub-flow is
 * open.
 */
export function AddPersonRow({ value, onChangeText, onConfirm, recentNames, onSelectRecent }: AddPersonRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <>
      <View style={styles.addPersonRow}>
        <TextInput
          style={styles.addPersonInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={t('receiptSplit.personName')}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onConfirm}
        />
        <TouchableOpacity style={styles.addPersonConfirm} onPress={onConfirm}>
          <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>

      {/* "People you've split with before" — shown empty-box (all available
          recents) and narrowed while typing, same UX as the "Recent" list in
          app/expense/location.tsx. */}
      {recentNames.length > 0 && (
        <View style={styles.recentNamesWrap}>
          <Text style={styles.recentNamesLabel}>{t('receiptSplit.recentPeople')}</Text>
          <View style={styles.recentNamesRow}>
            {recentNames.map((name) => (
              <TouchableOpacity
                key={name}
                style={styles.recentNameChip}
                onPress={() => onSelectRecent(name)}
                activeOpacity={0.7}
              >
                <Ionicons name="time-outline" size={12} color={theme.colors.textTertiary} />
                <Text style={styles.recentNameChipText} numberOfLines={1}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  addPersonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  addPersonInput: {
    flex: 1,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
  },
  addPersonConfirm: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  recentNamesWrap: {
    gap: theme.spacing[1.5],
  },
  recentNamesLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  recentNamesRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  recentNameChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  recentNameChipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
});
