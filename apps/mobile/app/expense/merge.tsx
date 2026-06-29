/**
 * Expense merge screen — Tier 2 suggest-merge UX.
 *
 * Receives two expense ids via query params:
 *   /expense/merge?keepId=<id>&mergeId=<id>    (from alert deep-link)
 *   /expense/merge?aId=<id>&bId=<id>            (from import preview "Merge")
 *
 * Shows a side-by-side card of both expenses so the user can choose which record
 * to keep (the survivor), and which fields to carry over from the merged row.
 *
 * On confirm → expenseStore.mergeExpenses(keepId, mergeId, fieldChoices)
 *
 * canEdit-gated: viewers can't merge.
 * Reference: docs/superpowers/specs/2026-06-29-notification-capture-dedup-design.md §3b
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { showAlert } from '@/utils/alert';
import { getIntlLocale } from '@/i18n';
import type { MergeExpensesFieldChoices, Expense } from '@budget/shared-types';

function resolveExpense(
  expenses: Expense[],
  id: string,
): Expense | undefined {
  return expenses.find(
    (e) =>
      !e.isDeleted &&
      (e.id === id || e.localId === id || (e as any).clientId === id || (e as any).serverId === id),
  );
}

export default function ExpenseMergeScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();

  const params = useLocalSearchParams<{
    keepId?: string;
    mergeId?: string;
    aId?: string;
    bId?: string;
  }>();

  const canEdit = useAccountStore((s) => s.canEdit());
  const { expenses, mergeExpenses } = useExpenseStore();
  const { getCategoryById } = useCategoryStore();

  // Accept both param shapes
  const paramA = params.keepId ?? params.aId ?? '';
  const paramB = params.mergeId ?? params.bId ?? '';

  const expenseA = useMemo(() => resolveExpense(expenses, paramA), [expenses, paramA]);
  const expenseB = useMemo(() => resolveExpense(expenses, paramB), [expenses, paramB]);

  // Survivor selection: default to the import side or higher-confidence row.
  // Heuristic: prefer the row whose source is 'import' (bank settlement currency);
  // fall back to expenseA if neither is import.
  const [survivorId, setSurvivorId] = useState<string>(() => {
    if (!expenseA || !expenseB) return paramA;
    if (expenseB.source === 'import' || expenseB.source === 'notification' ? false : expenseA.source === 'notification') {
      return expenseB.id;
    }
    if (expenseA.source === 'import') return expenseA.id;
    if (expenseB.source === 'import') return expenseB.id;
    // Default to A (keepId param)
    return expenseA.id;
  });

  // Per-field toggle: null = auto (gap-fill), true = force copy from merged
  const [fieldChoices, setFieldChoices] = useState<MergeExpensesFieldChoices>({});
  const [isMerging, setIsMerging] = useState(false);

  const toggleField = useCallback((field: keyof MergeExpensesFieldChoices) => {
    setFieldChoices((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  if (!expenseA || !expenseB) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('expenseDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const survivor = survivorId === expenseA.id ? expenseA : expenseB;
  const mergedRow = survivorId === expenseA.id ? expenseB : expenseA;

  const handleConfirm = async () => {
    if (!canEdit) return;
    if (survivor.id === mergedRow.id) {
      showAlert(t('common.error'), t('expenses.merge.cannotMergeSelf'));
      return;
    }
    setIsMerging(true);
    try {
      await mergeExpenses(survivor.id, mergedRow.id, fieldChoices);
      showAlert(t('common.done'), t('expenses.merge.merged'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      showAlert(t('common.error'), t('errors.saveFailed'));
    } finally {
      setIsMerging(false);
    }
  };

  const renderExpenseCard = (
    exp: Expense,
    label: string,
    isSelected: boolean,
    onSelect: () => void,
  ) => {
    const categoryName = exp.categoryId
      ? getCategoryById(exp.categoryId)?.name ?? exp.categoryId
      : t('common.uncategorized');
    const dateStr = formatDate(exp.date, undefined, locale);

    return (
      <TouchableOpacity
        style={[styles.expenseCard, isSelected && styles.expenseCardSelected]}
        onPress={canEdit ? onSelect : undefined}
        activeOpacity={canEdit ? 0.7 : 1}
      >
        <View style={styles.cardHeaderRow}>
          <View
            style={[
              styles.radioCircle,
              isSelected && { borderColor: theme.colors.primary },
            ]}
          >
            {isSelected && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
            {label}
          </Text>
        </View>

        <Text style={styles.amountText}>
          {formatCurrency(exp.amount, exp.currencyCode)}
        </Text>
        <Text style={styles.cardDate}>{dateStr}</Text>
        {exp.merchant ? (
          <Text style={styles.cardDetail}>{exp.merchant}</Text>
        ) : null}
        {exp.description ? (
          <Text style={styles.cardDetail} numberOfLines={2}>{exp.description}</Text>
        ) : null}
        <Text style={styles.cardMeta}>{categoryName}</Text>

        <View style={styles.badgeRow}>
          {exp.source ? (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{exp.source}</Text>
            </View>
          ) : null}
          {exp.notes ? (
            <Ionicons name="document-text-outline" size={14} color={theme.colors.textTertiary} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // Only show field toggles when both rows have differing non-null values
  type FieldKey = keyof MergeExpensesFieldChoices;
  const diffFields: { field: FieldKey; label: string; survivorVal: string; mergedVal: string }[] = [];

  const sVal = (f: FieldKey) => {
    if (f === 'merchant') return survivor.merchant?.trim() || '';
    if (f === 'notes') return survivor.notes?.trim() || '';
    if (f === 'categoryId') {
      return survivor.categoryId
        ? getCategoryById(survivor.categoryId)?.name ?? survivor.categoryId
        : '';
    }
    if (f === 'projectId') return survivor.projectId ?? '';
    return '';
  };
  const mVal = (f: FieldKey) => {
    if (f === 'merchant') return mergedRow.merchant?.trim() || '';
    if (f === 'notes') return mergedRow.notes?.trim() || '';
    if (f === 'categoryId') {
      return mergedRow.categoryId
        ? getCategoryById(mergedRow.categoryId)?.name ?? mergedRow.categoryId
        : '';
    }
    if (f === 'projectId') return mergedRow.projectId ?? '';
    return '';
  };

  const fieldDefs: { field: FieldKey; labelKey: string }[] = [
    { field: 'merchant', labelKey: 'expenses.merge.fieldMerchant' },
    { field: 'notes', labelKey: 'expenses.merge.fieldNotes' },
    { field: 'categoryId', labelKey: 'expenses.merge.fieldCategory' },
    { field: 'projectId', labelKey: 'expenses.merge.fieldProject' },
  ];

  for (const { field, labelKey } of fieldDefs) {
    const sv = sVal(field);
    const mv = mVal(field);
    if (sv && mv && sv !== mv) {
      diffFields.push({ field, label: t(labelKey), survivorVal: sv, mergedVal: mv });
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Subtitle / currency note */}
        <Text style={styles.subtitle}>{t('expenses.merge.subtitle')}</Text>
        {expenseA.currencyCode !== expenseB.currencyCode && (
          <View style={styles.currencyNoteBox}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
            <Text style={styles.currencyNoteText}>{t('expenses.merge.currencyNote')}</Text>
          </View>
        )}

        {/* Survivor selection */}
        <Text style={styles.sectionTitle}>{t('expenses.merge.survivorQuestion')}</Text>
        <View style={styles.cardsRow}>
          {renderExpenseCard(
            expenseA,
            'A',
            survivorId === expenseA.id,
            () => setSurvivorId(expenseA.id),
          )}
          {renderExpenseCard(
            expenseB,
            'B',
            survivorId === expenseB.id,
            () => setSurvivorId(expenseB.id),
          )}
        </View>

        {/* Field keep toggles */}
        {diffFields.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('expenses.merge.keepFields')}</Text>
            {diffFields.map(({ field, label, survivorVal, mergedVal }) => (
              <View key={field} style={styles.fieldRow}>
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <Text style={styles.fieldValues}>
                    {survivorVal} → {mergedVal}
                  </Text>
                </View>
                <Switch
                  value={fieldChoices[field] === true}
                  onValueChange={() => toggleField(field)}
                  disabled={!canEdit}
                  trackColor={{ false: theme.colors.borderLight, true: theme.colors.primaryLight }}
                  thumbColor={fieldChoices[field] === true ? theme.colors.primary : theme.colors.surface}
                />
              </View>
            ))}
          </>
        )}

        {/* Keep label */}
        <View style={styles.keepHintRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.success} />
          <Text style={styles.keepHint}>
            {t('expenses.merge.keep')}: {formatCurrency(survivor.amount, survivor.currencyCode)}
            {survivor.merchant ? ` · ${survivor.merchant}` : ''}
          </Text>
        </View>
      </ScrollView>

      {/* Footer confirm button */}
      {canEdit && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, isMerging && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={isMerging}
            activeOpacity={0.8}
          >
            {isMerging ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.confirmBtnText}>{t('expenses.merge.confirm')}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[3],
  },
  notFoundText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  backBtn: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  backBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[3],
  },
  subtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  currencyNoteBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  currencyNoteText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  cardsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  expenseCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing[1],
    ...theme.shadows.sm,
  },
  expenseCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  cardHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  cardLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontFamily: theme.fonts.semiBold,
  },
  cardLabelSelected: {
    color: theme.colors.primary,
  },
  amountText: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  cardDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  cardDetail: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  cardMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  badgeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
    flexWrap: 'wrap' as const,
  },
  sourceBadge: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  sourceBadgeText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing[3],
  },
  fieldInfo: {
    flex: 1,
    gap: theme.spacing[0.5],
  },
  fieldLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldValues: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  keepHintRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  keepHint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.success,
    flex: 1,
  },
  footer: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  confirmBtn: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
