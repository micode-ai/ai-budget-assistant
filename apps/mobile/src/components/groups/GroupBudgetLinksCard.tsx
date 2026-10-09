import React, { useEffect } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useGroupBudgetStore } from '@/stores/groupBudgetStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { doubleCountLegs, pausedReasonKey, showBudgetLinksCard } from '@/features/groups/groupBudgetMirror';
import { GroupButton } from './GroupButton';

/**
 * The "may be counted twice" summary on the group page (ABA-661): phone, under the hero; desktop, a
 * rail card. Drawn only once the links view has answered and only while the mirror is on, so a group
 * without it shows nothing and nothing is ever stated about links not yet loaded. `onReview` opens the
 * full list (a route on the phone, a dialog on desktop).
 */
export function GroupBudgetLinksCard({
  groupId,
  onReview,
  style,
}: {
  groupId: string;
  onReview: () => void;
  /** Spacing from the caller; applied to the card itself, so a hidden card leaves no gap. */
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const view = useGroupBudgetStore((s) => s.links[groupId]);
  const loadLinks = useGroupBudgetStore((s) => s.loadLinks);
  const accounts = useAccountStore((s) => s.accounts);

  useEffect(() => {
    void loadLinks(groupId).catch(() => undefined);
  }, [groupId, loadLinks]);

  if (!view || !showBudgetLinksCard(view)) return null;

  const legs = doubleCountLegs(view);
  const accountName = accounts.find((a) => a.id === view.mirror.accountId)?.name ?? t('groupBudget.unknownAccount');
  const open = legs.length;
  const suggestions = view.suggestions.length;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <Ionicons
          name={open > 0 ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          size={18}
          color={open > 0 ? theme.colors.warning : theme.colors.success}
        />
        <Text style={styles.title}>{t('groupBudget.linksTitle')}</Text>
      </View>
      <Text style={styles.meta}>{t('groupBudget.cardCounting', { account: accountName })}</Text>
      {view.mirror.status === 'paused' ? (
        <Text style={styles.body}>{t(pausedReasonKey(view.mirror.pausedReason))}</Text>
      ) : open > 0 ? (
        <Text style={styles.body}>
          {t('groupBudget.cardUnlinked', { count: open })}
          {suggestions > 0 ? ` ${t('groupBudget.cardSuggestions', { count: suggestions })}` : ''}
        </Text>
      ) : (
        <Text style={styles.body}>{t('groupBudget.linksAllClear')}</Text>
      )}
      <GroupButton label={t('groupBudget.linksReview')} onPress={onReview} variant="secondary" style={styles.button} />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[1.5],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  meta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  body: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  button: {
    marginTop: theme.spacing[2],
  },
});
