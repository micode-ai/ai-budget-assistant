import type { Theme } from '@/theme';

/**
 * The style slice shared by most `ActionResultCard` result renderers (card
 * shell, header, list rows, totals, the deposit/discount "Recent" section).
 * A handful of components (`BudgetStatusResult`, `AffordabilityResult`) have
 * enough unique layout that they keep a small local `createStyles` alongside
 * this one instead of growing this shared sheet with single-use styles.
 */
export const createSharedResultStyles = (theme: Theme) => ({
  card: {
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  errorCard: {
    borderColor: theme.colors.dangerLight,
  },
  successCard: {
    borderColor: theme.colors.primaryLight,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginBottom: theme.spacing[2],
  },
  headerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  listItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  listItemText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  listItemAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  // `DepositTotalResult`/`DiscountTotalResult`'s "Recent" section — mirrors
  // `SavingsDetailSheet.tsx`'s `recentTextWrap`/`rowDate` (merchant + date
  // stacked on the left, amount + chevron on the right, same `listItem` row).
  recentTextWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  recentDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  // Design's "The action cards" — Q5, point 2: money that lines up in a
  // column carries `tabular-nums`. Gated behind `desktop` so the phone's
  // rendering is untouched (it does not have this today, on either
  // platform — see the design's Findings section for why the phone should
  // get it too, separately, not folded into this branch).
  listItemAmountDesktop: {
    fontVariant: ['tabular-nums' as const],
  },
  moreText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingTop: theme.spacing[1],
  },
  sectionLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[1],
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingTop: theme.spacing[2],
    marginTop: theme.spacing[1],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  totalValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  totalValueDesktop: {
    fontVariant: ['tabular-nums' as const],
  },
  successDetail: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
});
