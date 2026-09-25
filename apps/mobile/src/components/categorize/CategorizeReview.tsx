import { useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { categoryStyle, tintOf } from '@/features/categorize/categoryStyle';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CategoryTargetPicker } from './CategoryTargetPicker';

interface Props {
  onDone: () => void;
}

type PickerState = { mode: 'row' | 'group'; key: string } | null;

const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

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
 * (`app/expense/categorize.tsx`) and inside the desktop web dialog
 * (`CategorizeDialog.tsx`), so it owns no navigation of its own beyond
 * `onDone` — and no safe-area inset: the native route supplies that.
 */
export function CategorizeReview({ onDone }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const locale = getIntlLocale();

  const categories = useCategoryStore((s) => s.categories);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const expenseCategoryOptions = useMemo(
    () =>
      categories
        .filter((c) => c.type === 'expense' && !c.isDeleted)
        .map((c) => ({ id: c.id, name: getCategoryDisplayName(c, t), icon: c.icon, color: c.color })),
    [categories, t],
  );

  const { status, response, state, dispatch, groups, plan, apply, applying, retry } = useCategorizeSuggestions();
  const [picker, setPicker] = useState<PickerState>(null);
  // The "couldn't determine" group starts collapsed: it is the leftovers, and
  // expanded it can be longer than every suggestion above it combined.
  const [skipExpanded, setSkipExpanded] = useState(false);

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

  const renderIconCircle = (icon: string | null | undefined, color: string | null | undefined) => (
    <View style={[styles.iconCircle, { backgroundColor: tintOf(color, theme.colors.surfaceSecondary) }]}>
      <CategoryIcon
        icon={icon}
        size={16}
        color={isHex(color) ? color : theme.colors.textSecondary}
        fallback="folder-outline"
      />
    </View>
  );

  const renderExpenseRow = (id: string, isSkip: boolean) => {
    const e = expenseById.get(id);
    if (!e) return null;
    const label = e.merchant || e.description || '';
    const initial = label.trim().charAt(0).toLocaleUpperCase() || '?';
    return (
      <Pressable
        key={id}
        style={({ pressed }) => [styles.expenseRow, pressed && styles.expenseRowPressed]}
        onPress={() => setPicker({ mode: 'row', key: id })}
        accessibilityRole="button"
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseTitle} numberOfLines={1}>{label || '—'}</Text>
          <Text style={styles.expenseDate} numberOfLines={1}>
            {formatDate(fromDateInputValue(e.date, new Date()) ?? e.date, undefined, locale)}
          </Text>
        </View>
        <Text style={styles.expenseAmount}>{formatCurrency(e.amount, e.currencyCode)}</Text>
        {isSkip && (
          <View style={styles.choosePill}>
            <Text style={styles.choosePillText}>{t('categorize.choose')}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const renderGroup = (group: ReviewGroup) => {
    const { count, amountLabel } = summarizeGroup(group.expenseIds, expenseById);

    let title: ReactNode;
    let icon: ReactNode;
    const isNew = group.target.kind === 'new';
    if (group.target.kind === 'new') {
      const draftKey = group.target.draftKey;
      const name = state.drafts[draftKey] ?? '';
      const style = categoryStyle(name, t);
      icon = renderIconCircle(style.icon, style.color);
      title = (
        <DraftTitle
          value={name}
          onChangeText={(next) => dispatch({ type: 'renameDraft', draftKey, name: next })}
          placeholder={t('categorize.newNamePlaceholder')}
          styles={styles}
          theme={theme}
        />
      );
    } else if (group.target.kind === 'existing') {
      const category = categoryById.get(group.target.categoryId);
      icon = renderIconCircle(category?.icon, category?.color);
      title = (
        <Text style={styles.groupTitleText} numberOfLines={1}>
          {category ? getCategoryDisplayName(category, t) : group.target.categoryId}
        </Text>
      );
    } else {
      return renderSkipGroup(group);
    }

    return (
      <View key={group.key} style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Pressable
            style={styles.checkbox}
            hitSlop={10}
            onPress={() => dispatch({ type: 'toggleGroup', groupKey: group.key })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: group.included }}
          >
            <Ionicons
              name={group.included ? 'checkbox' : 'square-outline'}
              size={24}
              color={group.included ? theme.colors.primary : theme.colors.textTertiary}
            />
          </Pressable>
          {icon}
          <View style={styles.groupTitleColumn}>
            <View style={styles.groupTitleRow}>{title}</View>
            {/* The badge sits on the meta line, not beside the title: at 360px
                a Polish/Russian name plus pencil plus badge left the editable
                name too narrow to show in full. */}
            <View style={styles.groupMetaRow}>
              {isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>{t('categorize.newBadge')}</Text>
                </View>
              )}
              <Text style={styles.groupMetaText}>
                {amountLabel ? `${count} · ${amountLabel}` : `${count}`}
              </Text>
              <Pressable
                style={styles.changeButton}
                hitSlop={8}
                onPress={() => setPicker({ mode: 'group', key: group.key })}
                accessibilityRole="button"
              >
                <Text style={styles.changeButtonText}>{t('categorize.change')}</Text>
                <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={[styles.expenseList, !group.included && styles.expenseListExcluded]}>
          {group.expenseIds.map((id) => renderExpenseRow(id, false))}
        </View>
      </View>
    );
  };

  function renderSkipGroup(group: ReviewGroup) {
    return (
      <View key={group.key} style={styles.groupCard}>
        <Pressable
          style={styles.skipHeader}
          onPress={() => setSkipExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: skipExpanded }}
        >
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceSecondary }]}>
            <Ionicons name="help" size={16} color={theme.colors.textSecondary} />
          </View>
          <Text style={styles.skipTitle}>
            {`${t('categorize.unassigned')} (${group.expenseIds.length})`}
          </Text>
          <Ionicons
            name={skipExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.colors.textSecondary}
          />
        </Pressable>
        {skipExpanded && (
          <View style={styles.expenseList}>
            {group.expenseIds.map((id) => renderExpenseRow(id, true))}
          </View>
        )}
      </View>
    );
  }

  // assigned = what Apply will write; total = every candidate the pass offered.
  const total = response?.expenses.length ?? 0;
  const assigned = plan.expenseCount;
  const progress = total > 0 ? Math.min(1, assigned / total) : 0;
  const newCount = plan.newCategories.length;
  const applyDisabled = plan.expenseCount === 0 || applying;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>
            {t('categorize.summary', { assigned, total })}
            {newCount > 0 ? ` · ${t('categorize.summaryNew', { count: newCount })}` : ''}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
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
          <Text style={styles.cancelButtonText} numberOfLines={1}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.applyButton, plan.expenseCount === 0 && styles.applyButtonDisabled]}
          onPress={handleApply}
          disabled={applyDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: applyDisabled, busy: applying }}
        >
          {applying ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
          )}
          <Text style={styles.applyButtonText} numberOfLines={1}>
            {t('categorize.applyShort', { count: plan.expenseCount })}
          </Text>
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

type Styles = ReturnType<typeof createStyles>;

/**
 * A new category's name: editable, but it reads as a title, not a form field —
 * no underline at rest, a pencil after it (tapping it focuses the field), and
 * a subtle bottom border only while focused.
 */
function DraftTitle({
  value,
  onChangeText,
  placeholder,
  styles,
  theme,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  styles: Styles;
  theme: Theme;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.draftTitle}>
      <TextInput
        ref={inputRef}
        style={[styles.groupTitleInput, focused && styles.groupTitleInputFocused]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={placeholder}
      />
      {!focused && (
        <Pressable
          onPress={() => inputRef.current?.focus()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
        >
          <Ionicons name="pencil" size={14} color={theme.colors.textTertiary} />
        </Pressable>
      )}
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
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    ...theme.shadows.sm,
  },
  summaryText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.progressTrack,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
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
    ...theme.shadows.sm,
  },
  groupHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2.5],
  },
  // 24px glyph + hitSlop 10 on every side = a 44px target without widening the row.
  checkbox: {
    width: 24,
    height: 32,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  groupTitleColumn: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  groupTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    minHeight: 32,
  },
  groupTitleText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  draftTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  groupTitleInput: {
    flex: 1,
    minWidth: 0,
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing[0.5],
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  groupTitleInputFocused: {
    borderBottomColor: theme.colors.border,
  },
  newBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  newBadgeText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.primary,
  },
  // Wraps rather than truncating the sum: on a narrow phone "Change" drops
  // below it, still right-aligned.
  groupMetaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    columnGap: theme.spacing[2],
  },
  groupMetaText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  changeButton: {
    marginLeft: 'auto' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[0.5],
    paddingVertical: theme.spacing[1],
  },
  changeButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  expenseList: {
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[1],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  expenseListExcluded: {
    opacity: 0.5,
  },
  // Negative margin + matching padding: the pressed highlight reaches the
  // card's inner edge while the content stays aligned with the header.
  expenseRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
    minHeight: 48,
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    marginHorizontal: -theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  expenseRowPressed: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  avatarText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  expenseInfo: {
    flex: 1,
    minWidth: 0,
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
    textAlign: 'right' as const,
  },
  choosePill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  choosePillText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.medium,
    color: theme.colors.primary,
  },
  skipHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2.5],
    minHeight: 44,
  },
  skipTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  footer: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  // Cancel takes its own width and Apply the rest: a fixed flex ratio left
  // "Скасувати" / "Застосувати · 19" each a few px short at 360px.
  cancelButton: {
    minWidth: 96,
    minHeight: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
  },
  cancelButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  applyButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[2],
    backgroundColor: theme.colors.primary,
  },
  applyButtonDisabled: {
    opacity: 0.4,
  },
  applyButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    flexShrink: 1,
  },
});
