import { useMemo, useState, type ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { CategorizeCandidateExpense } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { fromDateInputValue } from '@/utils/dateInput';
import { useCategoryStore } from '@/stores/categoryStore';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useCategorizeSuggestions } from '@/features/categorize/useCategorizeSuggestions';
import type { ReviewGroup, Target } from '@/features/categorize/categorizeReview';
import { CategoryTargetPicker } from './CategoryTargetPicker';

interface Props {
  onDone: () => void;
}

type PickerState = { mode: 'row' | 'group'; key: string } | null;

function markerFor(kind: Target['kind']): string {
  if (kind === 'new') return '✚';
  if (kind === 'existing') return '●';
  return '?';
}

/** Sums a group's amounts when every row shares one currency; count-only otherwise. */
function summarizeGroup(expenseIds: string[], expenseById: Map<string, CategorizeCandidateExpense>) {
  let sum = 0;
  let currency: string | null = null;
  let mixed = false;
  let count = 0;
  for (const id of expenseIds) {
    const e = expenseById.get(id);
    if (!e) continue;
    count += 1;
    if (currency === null) currency = e.currencyCode;
    else if (currency !== e.currencyCode) mixed = true;
    sum += e.amount;
  }
  return { count, amountLabel: !mixed && currency ? formatCurrency(sum, currency) : null };
}

/**
 * The "categorize uncategorized expenses" review — one scrollable list of
 * suggested groups, each retargetable to an existing category, a new one, or
 * left unassigned, plus a per-row override. Rendered both as the native route
 * (`app/expense/categorize.tsx`) and inside the desktop web dialog (Task 10),
 * so it owns no navigation of its own beyond `onDone`.
 */
export function CategorizeReview({ onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();

  const categories = useCategoryStore((s) => s.categories);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const expenseCategoryOptions = useMemo(
    () => categories.filter((c) => c.type === 'expense' && !c.isDeleted).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
    [categories],
  );

  const { status, response, state, dispatch, groups, plan, apply, applying, retry } = useCategorizeSuggestions();
  const [picker, setPicker] = useState<PickerState>(null);

  const expenseById = useMemo(
    () => new Map((response?.expenses ?? []).map((e) => [e.id, e])),
    [response],
  );

  const setTargetForPicker = (target: Target) => {
    if (!picker) return;
    if (picker.mode === 'row') {
      dispatch({ type: 'setRowTarget', expenseId: picker.key, target });
    } else {
      dispatch({ type: 'setGroupTarget', groupKey: picker.key, target });
    }
  };

  const handleSelect = (target: Target) => {
    setTargetForPicker(target);
    setPicker(null);
  };

  const handleCreate = (name: string) => {
    if (!picker) return;
    const draftKey = `u${Date.now()}`;
    dispatch({ type: 'addDraft', draftKey, name });
    setTargetForPicker({ kind: 'new', draftKey });
    setPicker(null);
  };

  const handleApply = async () => {
    try {
      const r = await apply();
      showAlert(t('categorize.done', { count: r.categorized, created: r.created }));
      onDone();
    } catch (e: any) {
      console.warn('[categorize] apply failed:', e?.message || e);
      showAlert(t('categorize.error'));
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.centeredText}>{t('categorize.analyzing')}</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>{t('categorize.error')}</Text>
        <Pressable style={styles.retryButton} onPress={() => retry()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>{t('categorize.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>{t('categorize.nothingToSuggest')}</Text>
        {response?.limitReached ? (
          <Text style={styles.centeredText}>{t('categorize.limitReached')}</Text>
        ) : null}
        {response && response.skippedEncrypted > 0 ? (
          <Text style={styles.centeredText}>
            {t('categorize.skippedEncrypted', { count: response.skippedEncrypted })}
          </Text>
        ) : null}
      </View>
    );
  }

  const renderGroup = (group: ReviewGroup) => {
    const kind = group.target.kind;
    const { count, amountLabel } = summarizeGroup(group.expenseIds, expenseById);

    let title: ReactNode;
    if (kind === 'new') {
      const target = group.target;
      title = (
        <TextInput
          style={styles.groupTitleInput}
          value={state.drafts[target.draftKey] ?? ''}
          onChangeText={(name) => dispatch({ type: 'renameDraft', draftKey: target.draftKey, name })}
          placeholder={t('categorize.newNamePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
        />
      );
    } else if (kind === 'existing') {
      const target = group.target;
      title = (
        <Text style={styles.groupTitleText} numberOfLines={1}>
          {categoryById.get(target.categoryId)?.name ?? target.categoryId}
        </Text>
      );
    } else {
      title = <Text style={styles.groupTitleText}>{t('categorize.unassigned')}</Text>;
    }

    return (
      <View key={group.key} style={styles.groupCard}>
        <View style={styles.groupHeader}>
          {kind !== 'skip' && (
            <Pressable
              style={styles.checkbox}
              onPress={() => dispatch({ type: 'toggleGroup', groupKey: group.key })}
              accessibilityRole="button"
            >
              {group.included && <View style={styles.checkboxInner} />}
            </Pressable>
          )}
          <Text style={styles.groupMarker}>{markerFor(kind)}</Text>
          <View style={styles.groupTitleColumn}>
            {title}
            {kind !== 'skip' && (
              <Text style={styles.groupCaption}>
                {t(kind === 'new' ? 'categorize.newCategory' : 'categorize.existingCategory')}
              </Text>
            )}
          </View>
          <View style={styles.groupSummary}>
            <Text style={styles.groupSummaryText}>
              {amountLabel ? `${count} · ${amountLabel}` : `${count}`}
            </Text>
          </View>
          <Pressable
            style={styles.groupChevron}
            onPress={() => setPicker({ mode: 'group', key: group.key })}
            accessibilityRole="button"
          >
            <Text style={styles.groupChevronText}>▾</Text>
          </Pressable>
        </View>

        {group.expenseIds.map((id) => {
          const e = expenseById.get(id);
          if (!e) return null;
          return (
            <View key={id} style={styles.expenseRow}>
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseTitle} numberOfLines={1}>
                  {e.merchant || e.description || '—'}
                </Text>
                <Text style={styles.expenseDate}>
                  {formatDate(fromDateInputValue(e.date, new Date()) ?? e.date, undefined, locale)}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>{formatCurrency(e.amount, e.currencyCode)}</Text>
              <Pressable
                style={styles.expenseChooseButton}
                onPress={() => setPicker({ mode: 'row', key: id })}
                accessibilityRole="button"
              >
                <Text style={styles.expenseChooseText}>
                  {kind === 'skip' ? t('categorize.choose') : '▾'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {response?.limitReached ? (
          <Text style={styles.notice}>{t('categorize.limitReached')}</Text>
        ) : null}
        {response && response.skippedEncrypted > 0 ? (
          <Text style={styles.notice}>
            {t('categorize.skippedEncrypted', { count: response.skippedEncrypted })}
          </Text>
        ) : null}

        {groups.map(renderGroup)}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cancelButton} onPress={onDone} accessibilityRole="button">
          <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.applyButton, (plan.expenseCount === 0 || applying) && styles.applyButtonDisabled]}
          onPress={handleApply}
          disabled={plan.expenseCount === 0 || applying}
          accessibilityRole="button"
        >
          {applying ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.applyButtonText}>
              {plan.newCategories.length > 0
                ? t('categorize.applyWithNew', { count: plan.expenseCount, created: plan.newCategories.length })
                : t('categorize.apply', { count: plan.expenseCount })}
            </Text>
          )}
        </Pressable>
      </View>

      <CategoryTargetPicker
        visible={picker !== null}
        categories={expenseCategoryOptions}
        drafts={state.drafts}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onClose={() => setPicker(null)}
      />
    </View>
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
  centeredText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  retryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  scrollContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[3],
  },
  notice: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    ...theme.shadows.sm,
  },
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  groupMarker: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  groupTitleColumn: {
    flex: 1,
    gap: theme.spacing[0.5],
  },
  groupTitleText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  groupTitleInput: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: theme.spacing[0.5],
  },
  groupCaption: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  groupSummary: {
    alignItems: 'flex-end' as const,
  },
  groupSummaryText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  groupChevron: {
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  groupChevronText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  expenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingLeft: theme.spacing[6],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  expenseDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  expenseAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  expenseChooseButton: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  expenseChooseText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  footer: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  cancelButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  applyButton: {
    flex: 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.primary,
  },
  applyButtonDisabled: {
    opacity: 0.4,
  },
  // Centred: in Polish/Russian the label wraps to two lines on a phone.
  applyButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    textAlign: 'center' as const,
  },
});
