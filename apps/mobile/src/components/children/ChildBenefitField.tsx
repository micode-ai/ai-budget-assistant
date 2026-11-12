import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { isChildBenefitDescription } from '@budget/shared-utils';
import type { Income } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountChildren } from '@/hooks/useAccountChildren';
import { ChildLinePicker } from './ChildLinePicker';

interface Props {
  income: Income;
}

/**
 * The 800+ mark on an income: which child this benefit payment is for (it
 * feeds that child's benefit coverage). Hosted by `IncomeDetailsCard`, so the
 * phone screen and the desktop income dialog both draw it.
 *
 * When the description looks like a child benefit (`isChildBenefitDescription`,
 * deterministic, on the device) and the income is not marked yet, a one-line
 * suggestion offers to mark it — the user confirms with a tap; nothing is
 * marked by itself. An account without children shows nothing; viewers see an
 * existing mark read-only.
 */
export function ChildBenefitField({ income }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const kids = useAccountChildren();
  const updateIncome = useIncomeStore((s) => s.updateIncome);

  // A loan, a repayment or a split receivable is never a benefit payment.
  if (income.isDebt || income.isDebtRepayment || income.isSplitReceivable) return null;

  const mark = income.childBenefitChildId ?? null;
  if (kids.activeChildren.length === 0 && !mark) return null;
  if (!canEdit && !mark) return null;

  const setMark = (childId: string | null) => updateIncome(income.id, { childBenefitChildId: childId });
  const suggest = canEdit && !mark && isChildBenefitDescription(income.description);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t('children.benefitFor')}</Text>
      {suggest ? (
        <View style={styles.suggestion}>
          <View style={styles.suggestionText}>
            <Ionicons name="sparkles-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.suggestionLabel}>{t('children.benefitSuggestion')}</Text>
          </View>
          <View style={styles.chips}>
            {kids.activeChildren.map((child) => (
              <Pressable
                key={child.id}
                onPress={() => setMark(child.id)}
                accessibilityRole="button"
                accessibilityLabel={t('children.benefitMarkA11y', { name: child.name || t('children.unnamed') })}
                style={styles.chip}
              >
                <View style={[styles.dot, { backgroundColor: child.color || theme.colors.primary }]} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {child.name || t('children.unnamed')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <ChildLinePicker
          children={kids.activeChildren}
          allChildren={kids.children}
          value={mark}
          onChange={setMark}
          disabled={!canEdit}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  label: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  suggestion: {
    gap: theme.spacing[1.5],
  },
  suggestionText: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  suggestionLabel: {
    fontSize: 13,
    color: theme.colors.primary,
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[1.5],
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    maxWidth: 180,
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
});
