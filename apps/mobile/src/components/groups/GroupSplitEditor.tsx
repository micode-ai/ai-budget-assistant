import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  GROUP_SPLIT_TYPES,
  equalShare,
  splitRemainder,
  type SplitDraft,
  type SplitIssue,
} from '@/features/groups/groupSplit';
import type { GroupMember, ShareType } from '@budget/shared-types';

interface GroupSplitEditorProps {
  members: GroupMember[];
  draft: SplitDraft;
  amount: number;
  currencyCode: string;
  issue: SplitIssue | null;
  onSplitType: (type: ShareType) => void;
  onToggleMember: (memberId: string) => void;
  onValue: (memberId: string, value: string) => void;
}

/** Split type chips, a checkbox per member, and a value field per member for non-equal splits. */
export function GroupSplitEditor({
  members,
  draft,
  amount,
  currencyCode,
  issue,
  onSplitType,
  onToggleMember,
  onValue,
}: GroupSplitEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const unit =
    draft.splitType === 'exact' ? currencyCode : draft.splitType === 'percentage' ? '%' : t('groups.sharesUnit');
  const remainder = splitRemainder(draft, amount);

  return (
    <View>
      <Text style={styles.label}>{t('groups.splitLabel')}</Text>
      <View style={styles.chipRow}>
        {GROUP_SPLIT_TYPES.map((type) => {
          const active = draft.splitType === type;
          return (
            <TouchableOpacity
              key={type}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSplitType(type)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(`groups.split_${type}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{t('groups.splitBetween')}</Text>
      {members.map((member) => {
        const selected = draft.selectedIds.includes(member.id);
        return (
          <View key={member.id} style={styles.memberRow}>
            <TouchableOpacity
              style={styles.memberToggle}
              onPress={() => onToggleMember(member.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.displayName}
              </Text>
            </TouchableOpacity>
            {selected && draft.splitType === 'equal' && (
              <Text style={styles.equalAmount}>
                {formatCurrency(equalShare(amount, draft.selectedIds.length), currencyCode)}
              </Text>
            )}
            {selected && draft.splitType !== 'equal' && (
              <View style={styles.valueBox}>
                <TextInput
                  style={styles.valueInput}
                  value={draft.values[member.id] ?? ''}
                  onChangeText={(v) => onValue(member.id, v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <Text style={styles.unit}>{unit}</Text>
              </View>
            )}
          </View>
        );
      })}

      {draft.splitType === 'exact' && draft.selectedIds.length > 0 && (
        <Text style={[styles.hint, Math.abs(remainder) >= 0.01 && styles.hintWarn]}>
          {t('groups.exactLeft', { amount: formatCurrency(remainder, currencyCode) })}
        </Text>
      )}
      {draft.splitType === 'percentage' && draft.selectedIds.length > 0 && (
        <Text style={[styles.hint, Math.abs(remainder) >= 0.01 && styles.hintWarn]}>
          {t('groups.percentLeft', { percent: remainder })}
        </Text>
      )}
      {issue && <Text style={styles.error}>{t(`groups.issue_${issue}`)}</Text>}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  memberRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  memberToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
    flex: 1,
  },
  memberName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  equalAmount: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  valueBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  valueInput: {
    width: 84,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: 15,
    color: theme.colors.textPrimary,
    textAlign: 'right' as const,
  },
  unit: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    minWidth: 32,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  hintWarn: {
    color: theme.colors.warning,
  },
  error: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[2],
  },
});
