import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { GroupCashLegView, GroupCashLinkView, GroupCashPersonalRowView } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { api } from '@/services/api';
import { useGroupBudgetStore } from '@/stores/groupBudgetStore';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import {
  addedByOtherName,
  buildManualLinkDto,
  doubleCountLegs,
  legSide,
  manualLinkCandidates,
  manualLinkWindow,
  mirrorErrorReason,
  pausedReasonKey,
  type DoubleCountLeg,
  type LinkCandidateRow,
} from '@/features/groups/groupBudgetMirror';
import { GroupButton } from './GroupButton';
import { GroupErrorState } from './GroupErrorState';
import { GroupOfflineBanner } from './GroupOfflineBanner';

/**
 * "May be counted twice" (ABA-661): my group payments that are not linked to a transaction in the
 * mirror's account, the suggestions for each (Link / Not this), a manual pick, and the links already
 * made (Unlink). Hosted unchanged by the desktop dialog (`desktop/GroupBudgetLinksDialog.tsx`), so
 * every change here is on both. Online-only: every write is a `GroupButton write`.
 */
export function GroupBudgetLinksView({ groupId, withStackTitle = true }: { groupId: string; withStackTitle?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const view = useGroupBudgetStore((s) => s.links[groupId]);
  const failed = useGroupBudgetStore((s) => s.failed[groupId]);
  const loadLinks = useGroupBudgetStore((s) => s.loadLinks);
  const unlink = useGroupBudgetStore((s) => s.unlink);
  const accounts = useAccountStore((s) => s.accounts);
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadLinks(groupId).catch(() => undefined);
  }, [groupId, loadLinks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadLinks(groupId);
    } catch {
      // The failed flag carries it.
    } finally {
      setRefreshing(false);
    }
  }, [groupId, loadLinks]);

  const title = t('groupBudget.linksTitle');

  if (!view) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {withStackTitle && <Stack.Screen options={{ title }} />}
        {failed ? (
          <GroupErrorState onRetry={() => void onRefresh()} />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const mirror = view.mirror;
  const accountName = accounts.find((a) => a.id === mirror.accountId)?.name ?? t('groupBudget.unknownAccount');
  const legs = doubleCountLegs(view);
  // ABA-660 review H1: shares that exist because ANOTHER member recorded the expense.
  const othersShares = (view.shareRows ?? []).filter((r) => r.addedByOther);

  const confirmUnlink = (link: GroupCashLinkView) =>
    showAlert(t('groupBudget.unlinkTitle'), t('groupBudget.unlinkBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupBudget.unlink'),
        style: 'destructive',
        onPress: () =>
          void unlink(groupId, link.id).catch((e) => showAlert(t('errors.error'), errorText(t, e))),
      },
    ]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {withStackTitle && <Stack.Screen options={{ title }} />}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <GroupOfflineBanner />
        {mirror.status === 'off' ? (
          <View style={styles.card}>
            <Text style={styles.body}>{t('groupBudget.mirrorOffHint')}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.body}>{t('groupBudget.linksIntro', { account: accountName })}</Text>
            <Text style={styles.hint}>{t('groupBudget.tradeOff')}</Text>
          </View>
        )}
        {/* Paused: the server sends no links at all, so an empty list here would be a false "all
            clear". Only the pause and what to do about it. */}
        {mirror.status === 'paused' && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{t(pausedReasonKey(mirror.pausedReason))}</Text>
            <Text style={styles.warningText}>{t('groupBudget.pausedLinksHint')}</Text>
          </View>
        )}
        {mirror.status === 'active' && (
          <>
            <Text style={styles.section}>{t('groupBudget.unlinkedTitle', { count: legs.length })}</Text>
            {legs.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.body}>{t('groupBudget.linksAllClear')}</Text>
              </View>
            ) : (
              legs.map((entry) => (
                <UnlinkedLegCard
                  key={entry.key}
                  groupId={groupId}
                  entry={entry}
                  accountId={mirror.accountId}
                  canWrite
                />
              ))
            )}

            {view.links.length > 0 && (
              <>
                <Text style={styles.section}>{t('groupBudget.linkedTitle', { count: view.links.length })}</Text>
                {view.links.map((link) => (
                  <View key={link.id} style={styles.card}>
                    <LegLine leg={link.leg} />
                    <PersonalLine row={link.personal} />
                    <View style={styles.linkFooter}>
                      <View style={styles.originPill}>
                        <Ionicons name="link-outline" size={12} color={theme.colors.textSecondary} />
                        <Text style={styles.originText}>
                          {link.origin === 'auto' ? t('groupBudget.linkedAuto') : t('groupBudget.linkedByYou')}
                        </Text>
                      </View>
                      <GroupButton
                        label={t('groupBudget.unlink')}
                        onPress={() => confirmUnlink(link)}
                        variant="danger"
                        write
                        style={styles.smallButton}
                      />
                    </View>
                  </View>
                ))}
              </>
            )}

            {othersShares.length > 0 && (
              <>
                <Text style={styles.section}>{t('groupBudget.othersSharesTitle', { count: othersShares.length })}</Text>
                <View style={styles.card}>
                  <Text style={styles.hint}>{t('groupBudget.othersSharesHint')}</Text>
                  {othersShares.map((r) => {
                    const name = addedByOtherName(r);
                    const openable = mirror.accountId === currentAccountId;
                    return (
                      <TouchableOpacity
                        key={r.expenseId}
                        style={styles.personal}
                        disabled={!openable}
                        onPress={() => router.push(`/expense/${r.expenseId}` as never)}
                        accessibilityRole={openable ? 'link' : undefined}
                      >
                        <Ionicons name="people-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={[styles.personalTitle, styles.flex]} numberOfLines={1}>
                          {name ? t('groupBudget.addedBy', { name }) : t('groupBudget.addedByOther')}
                        </Text>
                        <Text style={styles.personalAmount}>{formatCurrency(r.amount, r.currencyCode)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function errorText(t: TFn, e: unknown): string {
  const reason = mirrorErrorReason(e);
  if (reason) return t(`groupBudget.error_${reason}`);
  return e instanceof Error ? e.message : t('errors.unknown');
}

/** One leg the mirror could not link: its suggestions and the manual pick. */
function UnlinkedLegCard({
  groupId,
  entry,
  accountId,
  canWrite,
}: {
  groupId: string;
  entry: DoubleCountLeg;
  accountId: string | null;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accept = useGroupBudgetStore((s) => s.acceptSuggestion);
  const reject = useGroupBudgetStore((s) => s.rejectSuggestion);
  const link = useGroupBudgetStore((s) => s.link);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<LinkCandidateRow[] | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);

  const run = async (id: string, call: () => Promise<void>) => {
    setBusy(id);
    try {
      await call();
    } catch (e) {
      showAlert(t('errors.error'), errorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  const openPicker = async () => {
    if (picking) {
      setPicking(false);
      return;
    }
    setPicking(true);
    if (!accountId) return;
    setCandidates(null);
    setCandidatesFailed(false);
    const { startDate, endDate } = manualLinkWindow(entry.leg.date);
    try {
      const page =
        legSide(entry.leg.kind) === 'income'
          ? await api.getAccountIncomesFor(accountId, startDate, endDate)
          : await api.getAccountExpensesFor(accountId, startDate, endDate);
      const rows = (page.data as unknown as LinkCandidateRow[]).map((r) => ({
        ...r,
        date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString(),
      }));
      setCandidates(manualLinkCandidates(entry.leg, rows, { userId, accountId }));
    } catch (e) {
      console.warn('[groupBudget] candidates failed', e);
      setCandidatesFailed(true);
    }
  };

  return (
    <View style={styles.card}>
      <LegLine leg={entry.leg} />
      {entry.suggestions.map((s) => (
        <View key={s.id} style={styles.suggestion}>
          <Text style={styles.suggestionLabel}>{suggestionQuestion(t, s.leg)}</Text>
          <PersonalLine row={s.personal} />
          {canWrite && (
            <View style={styles.buttonRow}>
              <GroupButton
                label={t('groupBudget.accept')}
                onPress={() => void run(s.id, () => accept(groupId, s.id))}
                loading={busy === s.id}
                disabled={busy !== null}
                write
                style={styles.flex}
              />
              <GroupButton
                label={t('groupBudget.reject')}
                onPress={() => void run(`r:${s.id}`, () => reject(groupId, s.id))}
                loading={busy === `r:${s.id}`}
                disabled={busy !== null}
                variant="secondary"
                write
                style={styles.flex}
              />
            </View>
          )}
        </View>
      ))}

      {canWrite && accountId && (
        <TouchableOpacity
          style={styles.pickToggle}
          onPress={() => void openPicker()}
          accessibilityRole="button"
          accessibilityState={{ expanded: picking }}
        >
          <Ionicons name={picking ? 'chevron-up' : 'search-outline'} size={16} color={theme.colors.primary} />
          <Text style={styles.pickToggleText}>{t('groupBudget.linkManually')}</Text>
        </TouchableOpacity>
      )}

      {picking && (
        <View style={styles.picker}>
          {candidatesFailed ? (
            <Text style={styles.hint}>{t('groupBudget.loadError')}</Text>
          ) : candidates === null ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : candidates.length === 0 ? (
            <Text style={styles.hint}>{t('groupBudget.noCandidates')}</Text>
          ) : (
            candidates.map((row) => (
              <View key={row.id} style={styles.candidate}>
                <View style={styles.flex}>
                  <PersonalLine
                    row={{
                      expenseId: row.id,
                      incomeId: null,
                      amount: Number(row.amount),
                      currencyCode: row.currencyCode,
                      date: String(row.date),
                      description: row.description ?? null,
                      merchant: row.merchant ?? null,
                      source: row.source ?? 'manual',
                    }}
                  />
                </View>
                <GroupButton
                  label={t('groupBudget.accept')}
                  onPress={() =>
                    void run(`m:${row.id}`, async () => {
                      await link(groupId, buildManualLinkDto(entry.leg, row.id));
                      setPicking(false);
                    })
                  }
                  loading={busy === `m:${row.id}`}
                  disabled={busy !== null}
                  variant="secondary"
                  write
                  style={styles.smallButton}
                />
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/**
 * The question over a suggestion. A leg another member created is never auto-linked (ABA-660 review
 * H1), so the copy names them and asks plainly whether the card payment or transfer is this one.
 */
function suggestionQuestion(t: TFn, leg: GroupCashLegView): string {
  const name = addedByOtherName(leg);
  if (name === undefined) return t('groupBudget.suggestionLabel');
  const who = name ?? t('groupBudget.anotherMember');
  switch (leg.kind) {
    case 'settlement_in':
      return t('groupBudget.suggestOtherIn', { name: who });
    case 'settlement_out':
      return t('groupBudget.suggestOtherOut', { name: who });
    default:
      return t('groupBudget.suggestOtherPaid', { name: who });
  }
}

/** The group side: "You paid · Pizza · 120.00 PLN · 5 Oct", and who added it when it was not me. */
function LegLine({ leg }: { leg: GroupCashLegView }) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const addedBy = addedByOtherName(leg);
  return (
    <View style={styles.line}>
      <View style={styles.flex}>
        <Text style={styles.lineKind}>{t(`groupBudget.kind_${leg.kind}`)}</Text>
        <Text style={styles.lineTitle} numberOfLines={1}>
          {leg.label}
        </Text>
        <Text style={styles.lineMeta}>
          {formatDate(leg.date, undefined, getIntlLocale())}
          {addedBy !== undefined
            ? ` · ${addedBy ? t('groupBudget.addedBy', { name: addedBy }) : t('groupBudget.addedByOther')}`
            : ''}
        </Text>
      </View>
      <Text style={styles.lineAmount}>{formatCurrency(leg.amount, leg.currencyCode)}</Text>
    </View>
  );
}

/** My side: the transaction in the account. */
function PersonalLine({ row }: { row: GroupCashPersonalRowView }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const title = row.merchant || row.description || t('groupBudget.untitledRow');
  return (
    <View style={styles.personal}>
      <Ionicons
        name={row.incomeId ? 'arrow-down-circle-outline' : 'card-outline'}
        size={16}
        color={theme.colors.textSecondary}
      />
      <View style={styles.flex}>
        <Text style={styles.personalTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.lineMeta}>{formatDate(row.date, undefined, getIntlLocale())}</Text>
      </View>
      <Text style={styles.personalAmount}>{formatCurrency(row.amount, row.currencyCode)}</Text>
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  warning: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  body: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  section: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  line: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  lineKind: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  lineTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  lineMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  lineAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  suggestion: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[2],
    gap: theme.spacing[2],
  },
  suggestionLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  personal: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2.5],
  },
  personalTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  personalAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  flex: {
    flex: 1,
  },
  smallButton: {
    minHeight: 40,
    paddingVertical: theme.spacing[2],
  },
  pickToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[2],
  },
  pickToggleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  picker: {
    gap: theme.spacing[2],
  },
  candidate: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  linkFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
  },
  originPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  originText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
