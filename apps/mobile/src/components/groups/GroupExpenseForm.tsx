import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import { DatePicker } from '@/components/DatePicker';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useGroupExpenseForm } from '@/hooks/useGroupExpenseForm';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { MAX_DESCRIPTION_LENGTH, type SplitIssue } from '@/features/groups/groupSplit';
import type { GroupDetail, GroupExpense } from '@budget/shared-types';
import { GroupButton } from './GroupButton';
import { GroupOfflineBanner } from './GroupOfflineBanner';
import { GroupSplitEditor } from './GroupSplitEditor';
import type { GroupFormHandle, GroupFormState } from './groupFormHandle';

interface GroupExpenseFormProps {
  detail: GroupDetail;
  /** The expense being edited; null for a new one. */
  existing: GroupExpense | null;
  /**
   * Desktop dialog hosting (ABA-646). All three are optional and the phone passes none, so its
   * rendering and its `router.back()` are unchanged: `hideActions` drops the in-scroll Save and
   * Delete buttons (the dialog's footer drives the form through the ref handle instead),
   * `onStateChange` reports what that footer's buttons render from (must be a stable callback),
   * and `onDone` replaces `router.back()`, which a dialog is not a route to go back from.
   */
  hideActions?: boolean;
  onStateChange?: (state: GroupFormState) => void;
  onDone?: () => void;
}

/** Add or edit one group expense. */
export const GroupExpenseForm = forwardRef<GroupFormHandle, GroupExpenseFormProps>(function GroupExpenseForm(
  { detail, existing, hideActions = false, onStateChange, onDone },
  ref,
) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const form = useGroupExpenseForm(detail, existing);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const splitIssue: SplitIssue | null =
    form.amount > 0 &&
    form.validity.issue !== null &&
    !['amount', 'description', 'payer', 'rate'].includes(form.validity.issue)
      ? (form.validity.issue as SplitIssue)
      : null;

  const onDateChange = (selected?: Date) => {
    // `!== 'ios'` so web closes too; iOS keeps the inline calendar behind its own Done button.
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (selected) form.setDate(selected);
  };

  const pickScanSource = () => {
    showAlert(t('groups.scanReceipt'), undefined, [
      { text: t('groups.scanFromCamera'), onPress: () => void form.scan('camera') },
      { text: t('groups.scanFromGallery'), onPress: () => void form.scan('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const finish = () => (onDone ? onDone() : router.back());

  const onSave = async () => {
    if (await form.submit()) finish();
  };

  const onDelete = () => {
    showAlert(t('groups.deleteExpense'), t('groups.deleteExpenseConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (await form.remove()) finish();
        },
      },
    ]);
  };

  // Re-created every render so the handle never holds a stale `form`.
  useImperativeHandle(ref, () => ({ submit: onSave, remove: form.isEditing ? onDelete : undefined }));

  const { isEditing, submitting } = form;
  const canSubmit = form.validity.ok;
  useEffect(() => {
    onStateChange?.({ canSubmit, submitting, isEditing });
  }, [onStateChange, canSubmit, submitting, isEditing]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen style={styles.scroll} contentContainerStyle={styles.content}>
        <GroupOfflineBanner />
        {!form.isEditing && (
          <GroupButton
            label={t('groups.scanReceipt')}
            onPress={pickScanSource}
            variant="secondary"
            loading={form.isScanning}
          />
        )}

        <Text style={styles.label}>{t('groups.amountLabel')}</Text>
        <View style={styles.amountRow}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            value={form.amountText}
            onChangeText={form.setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.colors.textTertiary}
          />
          {/* ABA-654: the entry currency. Another one is converted ONCE by the server when saved. */}
          <TouchableOpacity
            style={[styles.currencyChip, form.isForeign && styles.chipActive]}
            onPress={() => setShowCurrencyPicker((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={t('groups.fxCurrencyLabel')}
          >
            <Text style={[styles.currencyChipText, form.isForeign && styles.chipTextActive]}>{form.currency}</Text>
            <Ionicons name="chevron-down" size={14} color={form.isForeign ? theme.colors.primary : theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {showCurrencyPicker && (
          <View style={styles.pickerContainer}>
            {form.currencies.map((code) => {
              const active = form.currency === code;
              const meta = SUPPORTED_CURRENCIES.find((c) => c.code === code);
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.pickerItem, active && styles.pickerItemSelected]}
                  onPress={() => {
                    form.setCurrency(code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.pickerSymbol}>{meta?.symbol ?? code}</Text>
                  <Text style={styles.pickerLabel}>
                    {code}
                    {code === detail.currencyCode ? ` · ${t('groups.fxGroupCurrency')}` : ''}
                  </Text>
                  {active && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {form.isForeign && (
          <View style={styles.rateBox}>
            <Text style={styles.rateLabel}>{t('groups.fxRateLabel')}</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>{t('groups.fxRatePrefix', { currency: form.currency })}</Text>
              <TextInput
                style={[styles.input, styles.amountInput]}
                value={form.rateText}
                onChangeText={form.setRateText}
                keyboardType="decimal-pad"
                placeholder={form.rateLoading ? t('groups.fxRateLoading') : '0.0000'}
                placeholderTextColor={theme.colors.textTertiary}
                accessibilityLabel={t('groups.fxRateLabel')}
              />
              <Text style={styles.currency}>{detail.currencyCode}</Text>
            </View>
            <Text style={styles.rateHint}>
              {form.rateUnavailable && form.validity.issue === 'rate'
                ? t('groups.fxRateMissing')
                : t('groups.fxConvertedPreview', { amount: formatCurrency(form.convertedAmount, detail.currencyCode) })}
            </Text>
          </View>
        )}

        <Text style={styles.label}>{t('groups.descriptionLabel')}</Text>
        <TextInput
          style={styles.input}
          value={form.description}
          onChangeText={form.setDescription}
          placeholder={t('groups.descriptionPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          maxLength={MAX_DESCRIPTION_LENGTH}
        />

        <Text style={styles.label}>{t('groups.dateLabel')}</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.dateText}>
            {form.date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </TouchableOpacity>
        {showDatePicker && <DatePicker value={form.date} iosDisplay="inline" onChange={onDateChange} />}
        {Platform.OS === 'ios' && showDatePicker && (
          <TouchableOpacity style={styles.dateDone} onPress={() => setShowDatePicker(false)}>
            <Text style={styles.dateDoneText}>{t('common.done')}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>{t('groups.paidByLabel')}</Text>
        <View style={styles.chipRow}>
          {form.members.map((m) => {
            const active = form.paidByMemberId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => form.setPaidByMemberId(m.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.displayName}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <GroupSplitEditor
          members={form.members}
          draft={form.draft}
          amount={form.amount}
          currencyCode={form.currency}
          issue={splitIssue}
          onSplitType={form.setSplitType}
          onToggleMember={form.toggleMember}
          onValue={form.setMemberValue}
        />

        {!hideActions && (
          <GroupButton
            label={t('groups.saveExpense')}
            onPress={onSave}
            loading={form.submitting}
            write
            disabled={!form.validity.ok}
            style={styles.save}
          />
        )}
        {!hideActions && form.isEditing && (
          <GroupButton
            label={t('groups.deleteExpense')}
            onPress={onDelete}
            variant="danger"
            write
            disabled={form.submitting}
            style={styles.gap}
          />
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
});

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
    paddingBottom: theme.spacing[8],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  amountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  amountInput: {
    flex: 1,
  },
  currency: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  currencyChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  currencyChipText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  pickerContainer: {
    marginTop: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  },
  pickerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  pickerItemSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  pickerSymbol: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    width: 28,
  },
  pickerLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  rateBox: {
    marginTop: theme.spacing[3],
  },
  rateLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  rateHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  dateButton: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  dateText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  dateDone: {
    marginTop: theme.spacing[3],
    alignSelf: 'flex-end' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  dateDoneText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textInverse,
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
  save: {
    marginTop: theme.spacing[6],
  },
  gap: {
    marginTop: theme.spacing[3],
  },
});
