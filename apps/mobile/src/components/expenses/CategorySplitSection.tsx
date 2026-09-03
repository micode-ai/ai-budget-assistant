import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SplitEditor } from '@/components/SplitEditor';
import { useStyles, useTheme, type Theme } from '@/theme';
import type { Currency } from '@budget/shared-types';
import type { CategorySplitEditorState } from '@/hooks/useCategorySplitEditor';

interface Props extends CategorySplitEditorState {
  totalAmount: number;
  currencyCode: Currency;
}

/**
 * The manual category-split UI for expense/new.tsx (tech-debt
 * expense-new-screen-god-file) — extracted verbatim from the screen, no
 * behavior change. State lives in `useCategorySplitEditor` (owned by the
 * screen, since `handleSubmit` turns `pendingSplits` into the create
 * payload); this component is purely presentational, switching between the
 * open editor, the built-splits summary, and the "split expense" prompt.
 */
export function CategorySplitSection({
  totalAmount,
  currencyCode,
  showSplitEditor,
  setShowSplitEditor,
  pendingSplits,
  setPendingSplits,
}: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (showSplitEditor && totalAmount > 0) {
    return (
      <View style={styles.fieldContainer}>
        <SplitEditor
          totalAmount={totalAmount}
          currencyCode={currencyCode}
          initialSplits={pendingSplits}
          onSplitsChange={(splits) => {
            setPendingSplits(splits);
            setShowSplitEditor(false);
          }}
          onCancel={() => setShowSplitEditor(false)}
        />
      </View>
    );
  }

  if (pendingSplits.length >= 2) {
    return (
      <View style={styles.fieldContainer}>
        <View style={styles.splitHeader}>
          <Text style={styles.fieldLabel}>{t('splits.title')}</Text>
          <TouchableOpacity onPress={() => setPendingSplits([])}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
        {pendingSplits.map((s, i) => (
          <View key={i} style={styles.splitRow}>
            <Text style={styles.splitName}>{s.categoryName}</Text>
            <Text style={styles.splitAmount}>
              {currencyCode} {s.amount.toFixed(2)}
            </Text>
            <Text style={styles.splitPercent}>{s.percentage.toFixed(0)}%</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.splitEditBtn} onPress={() => setShowSplitEditor(true)}>
          <Text style={styles.splitEditText}>{t('common.edit')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.splitButton} onPress={() => setShowSplitEditor(true)}>
      <Ionicons name="git-branch-outline" size={18} color={theme.colors.primary} />
      <Text style={styles.splitButtonText}>{t('splits.splitExpense')}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  fieldLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  splitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginBottom: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
  },
  splitButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  splitHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  splitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1.5],
    gap: theme.spacing[2],
  },
  splitName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  splitAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  splitPercent: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    width: 36,
    textAlign: 'right' as const,
  },
  splitEditBtn: {
    alignSelf: 'flex-start' as const,
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  splitEditText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
});
