import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@budget/shared-utils';
import type { Category } from '@budget/shared-types';
import { getIntlLocale } from '@/i18n';
import { api } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';
import { useGroupBudgetStore } from '@/stores/groupBudgetStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import {
  mirrorAccountCandidates,
  mirrorErrorReason,
  pausedReasonKey,
  splitByEncryption,
} from '@/features/groups/groupBudgetMirror';
import { GroupButton } from './GroupButton';

/**
 * "Count my share in my budget" (ABA-661), in the members screen's "my settings" (so the desktop
 * members dialog shows it too): off / active / paused, the target account (mine to own, or my own
 * single-member personal account; not an archived trip, not end-to-end encrypted) and an optional category, and turning it off. States the
 * two honest limits: an unlinked captured payment is counted twice, and while balances are open the
 * wallet balance differs from the bank. Nothing is drawn as a status before the server answered.
 */
export function GroupBudgetMirrorCard({ groupId, canTurnOn }: { groupId: string; canTurnOn: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const mirror = useGroupBudgetStore((s) => s.mirrors[groupId]);
  const failed = useGroupBudgetStore((s) => s.failed[groupId]);
  const loadMirror = useGroupBudgetStore((s) => s.loadMirror);
  const enable = useGroupBudgetStore((s) => s.enable);
  const disable = useGroupBudgetStore((s) => s.disable);
  const accounts = useAccountStore((s) => s.accounts);
  const membersByAccount = useAccountStore((s) => s.members);

  // Owner of the account, or an editor's personal account with no other member (403
  // MIRROR_ACCOUNT_SHARED_NEEDS_OWNER otherwise). Member lists the device has loaded inform it.
  const candidates = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [id, list] of Object.entries(membersByAccount)) counts[id] = list.length;
    return mirrorAccountCandidates(accounts, counts);
  }, [accounts, membersByAccount]);
  const [tiers, setTiers] = useState<Record<string, number | null> | null>(null);
  const [editing, setEditing] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadMirror(groupId).catch(() => undefined);
  }, [groupId, loadMirror]);

  // Encryption tiers are not on the local account rows: ask once per candidate when the picker opens.
  const candidateKey = candidates.map((a) => a.id).join(',');
  useEffect(() => {
    if (!editing) return;
    let alive = true;
    setTiers(null);
    void Promise.all(
      candidates.map((a) =>
        api
          .getAccountEncryptionStatus(a.id)
          .then((r) => [a.id, Number(r.encryptionTier) || 0] as const)
          .catch(() => [a.id, null] as const),
      ),
    ).then((pairs) => {
      if (alive) setTiers(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, candidateKey]);

  useEffect(() => {
    if (!editing || !accountId) return;
    let alive = true;
    setCategories(null);
    setCategoriesFailed(false);
    api
      .getAccountCategoriesFor(accountId)
      .then((list) => {
        if (alive) setCategories(list.filter((c) => c.type === 'expense' && !c.isDeleted));
      })
      .catch((e) => {
        console.warn('[groupBudget] categories failed', e);
        if (alive) setCategoriesFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [editing, accountId]);

  const errorText = (e: unknown) => {
    const reason = mirrorErrorReason(e);
    return reason ? t(`groupBudget.error_${reason}`) : e instanceof Error ? e.message : t('errors.unknown');
  };

  if (!mirror) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('groupBudget.title')}</Text>
        {failed ? (
          <TouchableOpacity onPress={() => void loadMirror(groupId).catch(() => undefined)} accessibilityRole="button">
            <Text style={styles.hint}>{t('groupBudget.loadError')}</Text>
            <Text style={styles.link}>{t('groups.retry')}</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
        )}
      </View>
    );
  }

  const on = mirror.status !== 'off';
  const accountName = accounts.find((a) => a.id === mirror.accountId)?.name ?? t('groupBudget.unknownAccount');
  const split = tiers ? splitByEncryption(candidates, tiers) : null;

  const startEditing = () => {
    const keep = mirror.accountId && candidates.some((a) => a.id === mirror.accountId) ? mirror.accountId : null;
    setAccountId(keep ?? (candidates.length === 1 ? candidates[0].id : null));
    setCategoryId(keep ? mirror.categoryId : null);
    setEditing(true);
  };

  const save = async () => {
    if (!accountId) return;
    setSaving(true);
    try {
      const view = await enable(groupId, { accountId, categoryId });
      setEditing(false);
      const name = accounts.find((a) => a.id === view.accountId)?.name ?? '';
      showAlert(t('groupBudget.turnedOn', { account: name }));
    } catch (e) {
      showAlert(t('errors.error'), errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmOff = () =>
    showAlert(t('groupBudget.turnOffTitle'), t('groupBudget.turnOffBody', { count: mirror.shareRowCount }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('groupBudget.turnOff'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setSaving(true);
            try {
              await disable(groupId);
              setEditing(false);
            } catch (e) {
              showAlert(t('errors.error'), errorText(e));
            } finally {
              setSaving(false);
            }
          })(),
      },
    ]);

  const statusLabel =
    mirror.status === 'active'
      ? t('groupBudget.statusActive')
      : mirror.status === 'paused'
        ? t('groupBudget.statusPaused')
        : t('groupBudget.statusOff');
  const statusColor =
    mirror.status === 'active'
      ? theme.colors.success
      : mirror.status === 'paused'
        ? theme.colors.warning
        : theme.colors.textTertiary;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.title, styles.flex]}>{t('groupBudget.title')}</Text>
        <View style={[styles.pill, { borderColor: statusColor }]}>
          <Text style={[styles.pillText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {!on && <Text style={styles.body}>{t('groupBudget.intro')}</Text>}
      {mirror.status === 'active' && (
        <Text style={styles.body}>
          {t('groupBudget.activeSummary', {
            account: accountName,
            date: mirror.from ? formatDate(mirror.from, undefined, getIntlLocale()) : '—',
            count: mirror.shareRowCount,
          })}
        </Text>
      )}
      {mirror.status === 'paused' && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{t(pausedReasonKey(mirror.pausedReason))}</Text>
        </View>
      )}

      <View style={styles.limit}>
        <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
        <Text style={[styles.hint, styles.flex]}>{t('groupBudget.tradeOff')}</Text>
      </View>
      <View style={styles.limit}>
        <Ionicons name="copy-outline" size={16} color={theme.colors.textSecondary} />
        <Text style={[styles.hint, styles.flex]}>{t('groupBudget.doubleCountNote')}</Text>
      </View>

      {editing && (
        <View style={styles.editor}>
          <Text style={styles.label}>{t('groupBudget.accountLabel')}</Text>
          {!split ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
          ) : split.offered.length === 0 ? (
            <Text style={styles.hint}>{t('groupBudget.noAccounts')}</Text>
          ) : (
            split.offered.map((a) => {
              const selected = a.id === accountId;
              return (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => {
                    if (a.id !== accountId) setCategoryId(null);
                    setAccountId(a.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={selected ? theme.colors.primary : theme.colors.textTertiary}
                  />
                  <Text style={[styles.optionText, styles.flex]} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={styles.hint}>{a.currencyCode}</Text>
                </TouchableOpacity>
              );
            })
          )}
          <Text style={styles.hint}>{t('groupBudget.accountRule')}</Text>
          {split && split.encrypted.length > 0 && (
            <Text style={styles.hint}>
              {t('groupBudget.encryptedNotOffered', { names: split.encrypted.map((a) => a.name).join(', ') })}
            </Text>
          )}

          {accountId && (
            <>
              <Text style={styles.label}>{t('groupBudget.categoryLabel')}</Text>
              {categoriesFailed ? (
                <Text style={styles.hint}>{t('groupBudget.loadError')}</Text>
              ) : !categories ? (
                <ActivityIndicator color={theme.colors.primary} style={styles.spinner} />
              ) : (
                <View style={styles.chipRow}>
                  {[{ id: null as string | null, name: t('groupBudget.noCategory') }, ...categories].map((c) => {
                    const active = categoryId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id ?? 'none'}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setCategoryId(c.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <Text style={styles.hint}>{t('groupBudget.categoryHint')}</Text>
            </>
          )}

          <View style={styles.buttons}>
            <GroupButton
              label={on ? t('groupBudget.save') : t('groupBudget.turnOn')}
              onPress={() => void save()}
              loading={saving}
              disabled={!accountId || !split}
              write
              style={styles.flex}
            />
            <GroupButton
              label={t('common.cancel')}
              onPress={() => setEditing(false)}
              variant="secondary"
              disabled={saving}
              style={styles.flex}
            />
          </View>
        </View>
      )}

      {!editing && (
        <View style={styles.buttons}>
          {!on && canTurnOn && (
            <GroupButton label={t('groupBudget.turnOnStart')} onPress={startEditing} write style={styles.flex} />
          )}
          {on && canTurnOn && (
            <GroupButton
              label={t('groupBudget.change')}
              onPress={startEditing}
              variant="secondary"
              write
              style={styles.flex}
            />
          )}
          {/* Off is always offered while on, even in an archived group (the server allows it). */}
          {on && (
            <GroupButton
              label={t('groupBudget.turnOff')}
              onPress={confirmOff}
              variant="danger"
              loading={saving}
              write
              style={styles.flex}
            />
          )}
        </View>
      )}
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
    gap: theme.spacing[2],
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
  flex: {
    flex: 1,
  },
  pill: {
    borderWidth: 1,
    borderRadius: theme.borderRadius['2xl'],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: 2,
  },
  pillText: {
    ...theme.textStyles.caption,
    fontWeight: '600' as const,
  },
  body: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  link: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
    marginTop: theme.spacing[1],
  },
  spinner: {
    alignSelf: 'flex-start' as const,
    marginVertical: theme.spacing[2],
  },
  warning: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  limit: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
  },
  editor: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  optionText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
    maxWidth: 220,
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
  buttons: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
});
