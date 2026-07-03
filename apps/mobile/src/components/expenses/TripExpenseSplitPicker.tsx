import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ShareType } from '@budget/shared-types';
import { useTheme } from '@/theme';

interface Member {
  userId: string;
  name: string;
}

export interface TripExpenseShareValue {
  userId: string;
  value: number;
}

interface Props {
  members: Member[];
  totalAmount: number;
  onChange: (splitType: ShareType, shares: TripExpenseShareValue[]) => void;
  /** Pre-select a split type on mount (e.g. when editing an expense that
   * already has shares). Omit for the default 'equal' / all-members-selected
   * behavior used by the create flow. */
  initialSplitType?: ShareType;
  /** Pre-populate member selection + values on mount from existing shares. */
  initialShares?: TripExpenseShareValue[];
}

const SPLIT_TYPES: ShareType[] = ['equal', 'exact', 'percentage', 'shares'];

function parseNumericInput(raw: string | undefined): number {
  if (!raw) return 0;
  // Accept comma as a decimal separator (matches SplitEditor's normalization).
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

// Same rounding tolerance the picker itself uses to decide whether to show
// the red mismatch hint (see showExactMismatch/showPercentageMismatch below).
const SPLIT_SUM_TOLERANCE = 0.01;

/**
 * Pure validity check for a manual trip split, mirroring the mismatch logic
 * rendered inline by the picker. Consumers (expense/new.tsx,
 * ExpenseDetailsCard.tsx) call this at submit time to BLOCK saving an invalid
 * manual split instead of letting the server reject it — `resolveShares()`
 * on the API throws for a mismatched sum, and the offline-retry path drops
 * `shares`/`splitType` entirely on resend, silently losing the split.
 *
 * - `equal` / `shares` (ratio) split types have no sum invariant — always valid.
 * - `exact`: sum of share values must equal totalAmount within tolerance.
 * - `percentage`: sum of share values must equal 100 within tolerance.
 */
export function validateTripSplit(
  splitType: ShareType,
  shares: TripExpenseShareValue[],
  totalAmount: number,
): boolean {
  if (splitType === 'exact') {
    const sum = shares.reduce((acc, s) => acc + s.value, 0);
    return Math.abs(sum - totalAmount) <= SPLIT_SUM_TOLERANCE;
  }
  if (splitType === 'percentage') {
    const sum = shares.reduce((acc, s) => acc + s.value, 0);
    return Math.abs(sum - 100) <= SPLIT_SUM_TOLERANCE;
  }
  return true;
}

/**
 * Lets the user pick which trip members share an expense and how (equal /
 * exact amounts / percentage / shares-ratio). Purely presentational + local
 * state — the parent screen (Task 28) owns persistence via `onChange`.
 *
 * `value` semantics per splitType:
 * - equal:      computed even amount (totalAmount / selected member count)
 * - exact:      user-entered currency amount
 * - percentage: user-entered percentage (0-100)
 * - shares:     user-entered share count (ratio units, e.g. 1, 2, 3)
 */
export function TripExpenseSplitPicker({
  members,
  totalAmount,
  onChange,
  initialSplitType,
  initialShares,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [splitType, setSplitType] = useState<ShareType>(initialSplitType ?? 'equal');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialShares && initialShares.length > 0
      ? initialShares.map((s) => s.userId)
      : members.map((m) => m.userId),
  );
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!initialShares || initialShares.length === 0 || (initialSplitType ?? 'equal') === 'equal') {
      return {};
    }
    const seeded: Record<string, string> = {};
    for (const s of initialShares) {
      seeded[s.userId] = String(s.value);
    }
    return seeded;
  });

  const shares = useMemo<TripExpenseShareValue[]>(() => {
    if (selectedIds.length === 0) return [];
    if (splitType === 'equal') {
      const equalValue = totalAmount / selectedIds.length;
      return selectedIds.map((userId) => ({ userId, value: Math.round(equalValue * 100) / 100 }));
    }
    return selectedIds.map((userId) => ({ userId, value: parseNumericInput(values[userId]) }));
  }, [splitType, selectedIds, values, totalAmount]);

  // Report the computed split to the parent whenever it changes (including on
  // mount, so the parent has a valid default equal-split before any interaction).
  useEffect(() => {
    onChange(splitType, shares);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitType, shares]);

  function toggleMember(userId: string) {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function setMemberValue(userId: string, raw: string) {
    setValues((prev) => ({ ...prev, [userId]: raw }));
  }

  const showExactMismatch =
    splitType === 'exact' && shares.length > 0 && !validateTripSplit(splitType, shares, totalAmount);
  const showPercentageMismatch =
    splitType === 'percentage' && shares.length > 0 && !validateTripSplit(splitType, shares, totalAmount);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.colors.textPrimary }]}>{t('trip.splitBetween')}</Text>

      <View style={styles.memberRow}>
        {members.map((member) => {
          const selected = selectedIds.includes(member.userId);
          return (
            <TouchableOpacity
              key={member.userId}
              onPress={() => toggleMember(member.userId)}
              style={[
                styles.memberChip,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSecondary },
                selected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
              ]}
            >
              <Text
                style={{
                  color: selected ? theme.colors.primary : theme.colors.textSecondary,
                  fontWeight: selected ? '600' : '400',
                  fontSize: 13,
                }}
              >
                {member.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.splitTypeRow}>
        {SPLIT_TYPES.map((type) => {
          const active = splitType === type;
          return (
            <TouchableOpacity
              key={type}
              onPress={() => setSplitType(type)}
              style={[
                styles.splitTypeChip,
                { backgroundColor: theme.colors.surfaceSecondary },
                active && { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                style={{
                  color: active ? theme.colors.textInverse : theme.colors.textSecondary,
                  fontWeight: '500',
                  fontSize: 13,
                }}
              >
                {t(`trip.split${type.charAt(0).toUpperCase()}${type.slice(1)}` as any)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {splitType === 'equal'
        ? selectedIds.map((userId) => {
            const member = members.find((m) => m.userId === userId);
            const share = shares.find((s) => s.userId === userId);
            return (
              <View key={userId} style={styles.valueRow}>
                <Text style={{ color: theme.colors.textPrimary }}>{member?.name}</Text>
                <Text style={{ color: theme.colors.textSecondary }}>{(share?.value ?? 0).toFixed(2)}</Text>
              </View>
            );
          })
        : selectedIds.map((userId) => {
            const member = members.find((m) => m.userId === userId);
            return (
              <View key={userId} style={styles.valueRow}>
                <Text style={{ color: theme.colors.textPrimary }}>{member?.name}</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  value={values[userId] ?? ''}
                  onChangeText={(text) => setMemberValue(userId, text)}
                  placeholder={splitType === 'shares' ? '1' : '0.00'}
                  placeholderTextColor={theme.colors.textTertiary}
                  style={[
                    styles.valueInput,
                    {
                      borderColor: theme.colors.border,
                      color: theme.colors.textPrimary,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                />
              </View>
            );
          })}

      {selectedIds.length === 0 && (
        <Text style={[styles.hint, { color: theme.colors.danger }]}>{t('trip.splitSelectMember')}</Text>
      )}
      {showExactMismatch && (
        <Text style={[styles.hint, { color: theme.colors.danger }]}>
          {t('trip.splitExactMismatch', { amount: totalAmount.toFixed(2) })}
        </Text>
      )}
      {showPercentageMismatch && (
        <Text style={[styles.hint, { color: theme.colors.danger }]}>{t('trip.splitPercentageMismatch')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  memberChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  splitTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  splitTypeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  valueInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 80,
    textAlign: 'right',
  },
  hint: { fontSize: 12, marginTop: 4 },
});
