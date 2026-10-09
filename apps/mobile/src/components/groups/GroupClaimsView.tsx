import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useGroupDetail } from '@/hooks/useGroupDetail';
import { useGroupExpenseItems } from '@/hooks/useGroupExpenseItems';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { canModifyExpense, isGroupWritable, liveMembers, memberName } from '@/features/groups/groupDisplay';
import {
  assignmentsFromView,
  buildManagedClaims,
  claimWindow,
  isClaimShareInvalid,
  isClaimsBusy,
  isClaimsClosed,
  isHandSplit,
  itemNet,
  myClaimedIds,
  previewMyParts,
  sameIdSet,
  toggleId,
} from '@/features/groups/groupItems';
import { toggleItemAssignment, type ItemAssignments } from '@/components/split/itemAssignments';
import {
  clearShares,
  overAllocatedItemIds,
  removeShare,
  setShare,
  type ItemShares,
} from '@/components/split/itemShares';
import { LineShareEditor } from '@/components/receipt-split/LineShareEditor';
import { GroupButton } from './GroupButton';
import { GroupErrorState } from './GroupErrorState';
import { GroupOfflineBanner } from './GroupOfflineBanner';

interface GroupClaimsViewProps {
  groupId: string;
  expenseId: string;
  /** Desktop dialog hosting: false keeps the route underneath its own header title. Default true. */
  withStackTitle?: boolean;
  /** Replaces the phone's `router.push` to the edit form (a desktop dialog switches dialogs instead). */
  onEditExpense?: (expenseId: string) => void;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Divide one itemised group expense by its receipt lines (ABA-656). Every live member ticks the
 * lines they had while the claim window is open ("My lines", `PUT .../claims/me` with the full set);
 * the payer, the creator and the owner may also set anyone's lines and percentages at any time
 * ("Everyone", `PUT .../claims`) and close or reopen the window. The server resolves the shares
 * (receipt-split's math, the payer keeps whatever nobody claimed) and answers with the fresh view.
 *
 * Nothing is drawn before both the group and the lines have answered: the "your part" figure of a
 * receipt we have not loaded would be a made-up zero. Every write is a `GroupButton write`, so the
 * offline gate applies. Hosted unchanged by `desktop/GroupClaimsDialog.tsx`.
 */
export function GroupClaimsView({ groupId, expenseId, withStackTitle = true, onEditExpense }: GroupClaimsViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { detail, loadFailed, reload } = useGroupDetail(groupId);
  const claims = useGroupExpenseItems(groupId, expenseId);
  const view = claims.view;

  const [mode, setMode] = useState<'mine' | 'manage'>('mine');
  /** My draft line set; null = what is stored. */
  const [mineDraft, setMineDraft] = useState<string[] | null>(null);
  /** The managers' draft; null = what is stored. */
  const [manageDraft, setManageDraft] = useState<{ assignments: ItemAssignments; shares: ItemShares } | null>(null);
  const [shareLineId, setShareLineId] = useState<string | null>(null);

  // A fresh view (after a save, or a reload on 409) is the new starting point.
  useEffect(() => {
    setMineDraft(null);
    setManageDraft(null);
  }, [view]);

  // The group reloads on focus (coming back from the edit form) and after every write; when its
  // ledger moved, the lines may have too, so fetch them again. Not on the first answer: the hook
  // has just loaded them.
  const ledgerVersion = detail?.ledgerVersion;
  const seenVersion = useRef<number | undefined>(undefined);
  const reloadItems = claims.reload;
  useEffect(() => {
    if (ledgerVersion === undefined) return;
    if (seenVersion.current !== undefined && seenVersion.current !== ledgerVersion) void reloadItems();
    seenVersion.current = ledgerVersion;
  }, [ledgerVersion, reloadItems]);

  const stored = useMemo(() => (view ? assignmentsFromView(view) : null), [view]);

  const title = t('groups.claimsTitle');
  if (!detail || !view || !stored) {
    const failed = loadFailed || claims.loadFailed;
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        {withStackTitle && <Stack.Screen options={{ title }} />}
        {failed ? (
          <GroupErrorState
            onRetry={() => {
              void reload();
              void claims.reload();
            }}
          />
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const me = detail.myMemberId;
  const cur = view.itemCurrency;
  const writable = isGroupWritable(detail);
  const payerName = memberName(detail, view.paidByMemberId);
  const claimWin = claimWindow({ itemized: true, claimsOpenUntil: view.claimsOpenUntil });
  const canEditExpense = writable && canModifyExpense(detail, view);
  const manager = view.canManageClaims && writable;

  const storedMine = myClaimedIds(view, me);
  const mine = mineDraft ?? storedMine;
  const mineDirty = !sameIdSet(mine, storedMine);
  const preview = previewMyParts(view, me, mine);
  const storedTotal = Math.round(view.items.reduce((s, i) => s + i.myPart * 100, 0)) / 100;
  const myTotal = mineDirty ? preview.total : storedTotal;

  const draft = manageDraft ?? stored;
  const overAllocated = overAllocatedItemIds(draft.shares);
  const live = liveMembers(detail);
  const nameById = new Map(detail.members.map((m) => [m.id, m.displayName]));

  const refusal = (e: unknown) => {
    if (isClaimsClosed(e)) showAlert(t('groups.claimsClosedError'));
    else if (isClaimsBusy(e)) showAlert(t('groups.claimsBusy'));
    else if (isClaimShareInvalid(e)) showAlert(t('errors.error'), t('groups.claimShareInvalid'));
    else showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
  };

  const saveMine = async () => {
    try {
      await claims.setMine(mine);
      showAlert(t('groups.claimsSaved'));
    } catch (e) {
      refusal(e);
    }
  };

  const saveAll = async () => {
    // Every live member, plus a live member who already holds a claim. A removed member is never
    // listed (the server refuses them), so their stored claims stay as they are.
    const ids = live.map((m) => m.id);
    try {
      await claims.setClaims({ claims: buildManagedClaims(ids, draft.assignments, draft.shares) });
      setShareLineId(null);
      showAlert(t('groups.claimsSaved'));
    } catch (e) {
      refusal(e);
    }
  };

  const closeOrReopen = () => {
    if (!view.claimsOpen) {
      void claims.close(true).catch(refusal);
      return;
    }
    showAlert(t('groups.claimsClose'), t('groups.claimsCloseConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('groups.claimsClose'), onPress: () => void claims.close(false).catch(refusal) },
    ]);
  };

  const editExpense = () =>
    onEditExpense
      ? onEditExpense(expenseId)
      : router.push({ pathname: `/groups/${groupId}/expense`, params: { expenseId } } as never);

  const toggleManaged = (itemId: string, memberId: string) => {
    const assignments = toggleItemAssignment(draft.assignments, itemId, memberId);
    const removed = !(assignments[itemId] ?? []).includes(memberId);
    setManageDraft({ assignments, shares: removed ? removeShare(draft.shares, itemId, memberId) : draft.shares });
  };

  const sortedItems = [...view.items].sort((a, b) => a.position - b.position);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {withStackTitle && <Stack.Screen options={{ title }} />}
      <ScrollView contentContainerStyle={styles.content}>
        <GroupOfflineBanner />

        <View style={styles.card}>
          <Text style={styles.description} numberOfLines={2}>
            {view.description}
          </Text>
          <Text style={styles.amount}>
            {view.originalAmount !== null && cur !== view.groupCurrency
              ? `${formatCurrency(view.originalAmount, cur)} → ${formatCurrency(view.amount, view.groupCurrency)}`
              : formatCurrency(view.amount, view.groupCurrency)}
          </Text>
          <Text style={styles.meta}>{t('groups.paidBy', { payer: payerName })}</Text>
          <View style={[styles.statusPill, claimWin.open ? styles.statusOpen : styles.statusClosed]}>
            <Ionicons
              name={claimWin.open ? 'time-outline' : 'lock-closed-outline'}
              size={14}
              color={claimWin.open ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text style={[styles.statusText, claimWin.open && styles.statusTextOpen]}>
              {claimWin.open && claimWin.until
                ? `${t('groups.claimsOpenUntil', { date: formatDay(claimWin.until) })} · ${t('groups.claimsDaysLeft', { count: claimWin.daysLeft })}`
                : t('groups.claimsClosed')}
            </Text>
          </View>
          {cur !== view.groupCurrency && <Text style={styles.meta}>{t('groups.claimsItemCurrency', { currency: cur })}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('groups.claimsYourTotal')}</Text>
          <Text style={styles.myTotal}>{formatCurrency(myTotal, cur)}</Text>
          {mineDirty && <Text style={styles.meta}>{t('groups.claimsPreviewHint')}</Text>}
        </View>

        {manager && (
          <View style={styles.tabs}>
            {(['mine', 'manage'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.tab, mode === m && styles.tabActive]}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}
              >
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                  {t(m === 'mine' ? 'groups.claimsMineTab' : 'groups.claimsManageTab')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {mode === 'mine' || !manager ? (
          <>
            <Text style={styles.hint}>
              {view.canClaim ? t('groups.claimsMineHint', { payer: payerName }) : t('groups.claimsReadOnly')}
            </Text>
            {sortedItems.map((item) => {
              const ticked = mine.includes(item.id);
              const hand = isHandSplit(item);
              const others = item.claims.filter((c) => c.memberId !== me).length;
              const count = others + (ticked ? 1 : 0);
              const disabled = !view.canClaim || hand;
              const part = mineDirty ? (preview.parts[item.id] ?? 0) : item.myPart;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.lineRow}
                  disabled={disabled}
                  onPress={() => setMineDraft(toggleId(mine, item.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked, disabled }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={ticked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={disabled ? theme.colors.textTertiary : ticked ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {count > 0 ? t('groups.claimsSharedBy', { count }) : t('groups.claimsUnclaimed')}
                      {hand ? ` · ${t('groups.claimsHandSplit')}` : ''}
                    </Text>
                  </View>
                  <View style={styles.lineAmounts}>
                    <Text style={styles.linePrice}>{formatCurrency(itemNet(item), cur)}</Text>
                    {ticked && (
                      <Text style={styles.linePart}>{t('groups.claimsYourPart', { amount: formatCurrency(part, cur) })}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {view.canClaim && (
              <GroupButton
                label={t('groups.claimsSaveMine')}
                onPress={() => void saveMine()}
                loading={claims.busy}
                write
                disabled={!mineDirty}
                style={styles.gap}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.hint}>{t('groups.claimsManageHint', { payer: payerName })}</Text>
            {sortedItems.map((item) => {
              const claimants = draft.assignments[item.id] ?? [];
              const net = itemNet(item);
              return (
                <View key={item.id} style={styles.manageCard}>
                  <View style={styles.manageHeader}>
                    <Text style={styles.lineName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.linePrice}>{formatCurrency(net, cur)}</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {live.map((m) => {
                      const active = claimants.includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => toggleManaged(item.id, m.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: active }}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.displayName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {claimants.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setShareLineId((cur2) => (cur2 === item.id ? null : item.id))}
                      accessibilityRole="button"
                      style={styles.linkButton}
                    >
                      <Text style={styles.linkText}>{t('groups.claimsSplitByPercent')}</Text>
                    </TouchableOpacity>
                  )}
                  {shareLineId === item.id && claimants.length > 0 && (
                    <LineShareEditor
                      item={{ id: item.id, description: item.name, totalPrice: net }}
                      claimants={claimants.map((id) => ({ id, name: nameById.get(id) ?? '' }))}
                      shares={draft.shares}
                      currencyCode={cur}
                      canEdit
                      onChangeShare={(memberId, bp) =>
                        setManageDraft({ assignments: draft.assignments, shares: setShare(draft.shares, item.id, memberId, bp) })
                      }
                      onReset={() => setManageDraft({ assignments: draft.assignments, shares: clearShares(draft.shares, item.id) })}
                      remainderLabel={t('groups.claimsRemainderOf', { name: payerName })}
                    />
                  )}
                </View>
              );
            })}
            {overAllocated.length > 0 && <Text style={styles.error}>{t('groups.claimShareInvalid')}</Text>}
            <GroupButton
              label={t('groups.claimsSaveAll')}
              onPress={() => void saveAll()}
              loading={claims.busy}
              write
              disabled={manageDraft === null || overAllocated.length > 0}
              style={styles.gap}
            />
          </>
        )}

        {manager && (
          <GroupButton
            label={view.claimsOpen ? t('groups.claimsClose') : t('groups.claimsReopen')}
            onPress={closeOrReopen}
            variant="secondary"
            write
            disabled={claims.busy}
            style={styles.gap}
          />
        )}
        {canEditExpense && (
          <GroupButton
            label={t('groups.expenseEditTitle')}
            onPress={editExpense}
            variant="secondary"
            write
            style={styles.gap}
          />
        )}
      </ScrollView>
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  description: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  amount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[1],
  },
  meta: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  statusPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  statusOpen: {
    backgroundColor: theme.colors.primaryLight,
  },
  statusClosed: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  statusText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  statusTextOpen: {
    color: theme.colors.primary,
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  myTotal: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[1],
  },
  tabs: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  tab: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tabActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  tabText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primary,
  },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  lineRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  lineInfo: {
    flex: 1,
  },
  lineName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  lineAmounts: {
    alignItems: 'flex-end' as const,
  },
  linePrice: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  linePart: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    marginTop: theme.spacing[0.5],
  },
  manageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  manageHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    backgroundColor: theme.colors.background,
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
  linkButton: {
    paddingTop: theme.spacing[2],
    alignSelf: 'flex-start' as const,
  },
  linkText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  error: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[2],
  },
  gap: {
    marginTop: theme.spacing[3],
  },
});
