import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface ChatEmptyStateProps {
  onSendMessage: (text: string) => void;
}

/**
 * One entry per already-translated `chat.action*` label (design's "The empty
 * state" — Q4): every icon here is copied from where that action already
 * shows one — `ACTION_ICONS` in `ActionConfirmationCard` for the four
 * `create_*` types, and each `ActionResultCard` sub-component's own header
 * icon for the seven read types. This is the WHOLE list — there is no
 * twelfth `chat.action*` key to add, and the zero-new-i18n-key constraint is
 * why this is a static legend and not a fourth interactive suggestion chip
 * (only three `*Q` keys exist).
 */
const LEGEND_ITEMS: ReadonlyArray<{ icon: keyof typeof Ionicons.glyphMap; labelKey: string }> = [
  { icon: 'receipt-outline', labelKey: 'chat.actionGetExpenses' },
  { icon: 'pie-chart-outline', labelKey: 'chat.actionGetBudgetStatus' },
  { icon: 'stats-chart-outline', labelKey: 'chat.actionGetCategoryBreakdown' },
  { icon: 'receipt-outline', labelKey: 'chat.actionCreateExpense' },
  { icon: 'cash-outline', labelKey: 'chat.actionCreateIncome' },
  { icon: 'pie-chart-outline', labelKey: 'chat.actionCreateBudget' },
  { icon: 'folder-outline', labelKey: 'chat.actionCreateCategory' },
  { icon: 'cart', labelKey: 'chat.actionAddShoppingList' },
  { icon: 'remove-circle-outline', labelKey: 'chat.actionRemoveShoppingList' },
  { icon: 'basket-outline', labelKey: 'chat.actionShoppingSuggestions' },
  { icon: 'shield-checkmark-outline', labelKey: 'chat.actionInflationShield' },
];

/**
 * The desktop empty state (design spec "The empty state" — Q4). A REAL
 * module, not a copy of `ChatMobile`'s inline `EmptyChat`/`QuickActions`
 * (those stay declared inside that component's body — a pre-existing,
 * separately-tracked smell this design does not inherit).
 *
 * Deliberately stays inside the SAME `CHAT_COLUMN_MAX_WIDTH` column as the
 * transcript (the caller's `contentContainerStyle` already caps it) — so
 * sending the first message moves nothing horizontally, and because this is
 * the one screen where a wider pitch reads worse, not better (a legend meant
 * to be read in five seconds, not a dashboard of figures).
 */
export function ChatEmptyState({ onSendMessage }: ChatEmptyStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="chatbubble-ellipses-outline" size={44} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>{t('chat.title')}</Text>
      <Text style={styles.subtitle}>{t('chat.subtitle')}</Text>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onSendMessage(t('chat.topExpensesQ'))}
        >
          <Text style={styles.quickActionText}>{t('chat.topExpenses')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onSendMessage(t('chat.budgetStatusQ'))}
        >
          <Text style={styles.quickActionText}>{t('chat.budgetStatus')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => onSendMessage(t('chat.savingTipsQ'))}
        >
          <Text style={styles.quickActionText}>{t('chat.savingTips')}</Text>
        </TouchableOpacity>
      </View>

      {/* The capability legend: static, non-interactive — a legend, not a
          control surface. A quiet top border (the `ConversationRail`
          divider idiom) separates it from the three real chips above rather
          than a heading, since no existing key names this section. */}
      <View style={styles.legend}>
        {LEGEND_ITEMS.map((item) => (
          <View key={item.labelKey} style={styles.legendItem}>
            <View style={styles.legendIconContainer}>
              <Ionicons name={item.icon} size={15} color={theme.colors.textSecondary} />
            </View>
            <Text style={styles.legendText} numberOfLines={1}>
              {t(item.labelKey)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexGrow: 1,
    paddingVertical: theme.spacing[6],
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  title: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
    textAlign: 'center' as const,
  },
  subtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 24,
    marginBottom: theme.spacing[6],
    maxWidth: 520,
  },
  quickActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
  },
  quickActionButton: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  quickActionText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  legend: {
    width: '100%' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    marginTop: theme.spacing[6],
    paddingTop: theme.spacing[5],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  legendItem: {
    width: '50%' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingRight: theme.spacing[3],
  },
  legendIconContainer: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  legendText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
});
