import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ImportRow } from '@budget/shared-types';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { getIntlLocale } from '@/i18n';

export default function ImportPreviewScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const preview = useImportStore((s) => s.previewData);
  const file = useImportStore((s) => s.fileAsset);
  const setPreview = useImportStore((s) => s.setPreview);
  const setBankId = useImportStore((s) => s.setPickedBankId);
  const [committing, setCommitting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() =>
    new Set(preview?.rows?.filter((r) => !r.alreadyImported).map((r) => r.idx) ?? []),
  );

  const locale = getIntlLocale();

  if (!preview) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.rowLabel}>—</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (preview.status === 'needs_picker') {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.pickerTitle}>{t('bankImport.pickBankTitle')}</Text>
        <Text style={styles.pickerSubtitle}>{t('bankImport.pickBankSubtitle')}</Text>
        {preview.supportedBanks?.map((b) => (
          <TouchableOpacity
            key={b.id}
            style={styles.pickerRow}
            activeOpacity={0.7}
            onPress={async () => {
              if (!file) return;
              setBankId(b.id);
              if (b.id === 'universal') {
                router.replace('/settings/import/mapper');
                return;
              }
              try {
                const res = await api.importBankPreview(file, { bankId: b.id });
                setPreview(res);
              } catch (err) {
                showAlert(
                  t('bankImport.error.parseFailed'),
                  err instanceof Error ? err.message : String(err),
                );
              }
            }}
          >
            <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.rowLabel}>{b.displayName}</Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </SafeAreaView>
    );
  }

  if (preview.status === 'needs_mapping') {
    router.replace('/settings/import/mapper');
    return null;
  }

  // status === 'parsed'
  const rows = preview.rows ?? [];

  const toggle = (idx: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });

  const handleImport = async () => {
    setCommitting(true);
    try {
      const rowsToCommit = rows.filter((r) => selected.has(r.idx) && !r.alreadyImported);
      const state = useImportStore.getState();
      const pending = state.pendingMapping;
      const fp = preview.headerFingerprint;
      const bankId = state.pickedBankId;

      const result = await api.importBankCommit({
        rows: rowsToCommit,
        ...(pending && fp
          ? {
              bankId: (bankId ?? 'universal') as 'mbank' | 'pko' | 'ing' | 'millennium' | 'pekao' | 'universal',
              headerFingerprint: fp,
              mapping: pending.mapping,
              delimiter: pending.delimiter,
              encoding: pending.encoding,
              amountFormat: pending.amountFormat,
              dateFormat: pending.dateFormat,
            }
          : {}),
      });

      await useExpenseStore.getState().loadExpenses({ force: true });
      await useIncomeStore.getState().loadIncomes({ force: true });

      showAlert(
        t('common.done'),
        t('bankImport.summary', {
          expenses: result.createdExpenses,
          incomes: result.createdIncomes,
          exchanges: result.createdExchanges,
        }),
        [{ text: t('common.ok'), onPress: () => router.replace('/settings') }],
      );
    } catch (err) {
      showAlert(
        t('bankImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setCommitting(false);
    }
  };

  const renderRow = ({ item }: { item: ImportRow }) => {
    const checked = selected.has(item.idx);
    const isDisabled = item.alreadyImported;
    // A possibleMerge row has at least one candidate in a different currency.
    // Default action = import as new (row stays selected). The user can open the
    // merge screen to merge with an existing record instead.
    const hasPossibleMerge = !isDisabled && item.kind === 'expense' && (item as any).possibleMerge === true;

    let kindIcon: React.ComponentProps<typeof Ionicons>['name'];
    let kindColor: string;
    if (item.kind === 'expense') {
      kindIcon = 'arrow-down-circle-outline';
      kindColor = theme.colors.danger;
    } else if (item.kind === 'income') {
      kindIcon = 'trending-up-outline';
      kindColor = theme.colors.success;
    } else {
      kindIcon = 'swap-horizontal-outline';
      kindColor = theme.colors.info;
    }

    return (
      <TouchableOpacity
        style={[styles.row, isDisabled && styles.rowDisabled]}
        onPress={() => !isDisabled && toggle(item.idx)}
        activeOpacity={isDisabled ? 1 : 0.7}
      >
        <Ionicons
          name={checked ? 'checkbox-outline' : 'square-outline'}
          size={22}
          color={isDisabled ? theme.colors.textDisabled : theme.colors.primary}
          style={styles.checkbox}
        />

        <View style={[styles.kindIconContainer, { backgroundColor: kindColor + '18' }]}>
          <Ionicons name={kindIcon} size={18} color={kindColor} />
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTopLine}>
            <Text style={[styles.rowDescription, isDisabled && styles.rowTextDim]} numberOfLines={1}>
              {item.merchant || item.description}
            </Text>
            <Text
              style={[
                styles.rowAmount,
                item.kind === 'expense'
                  ? styles.amountExpense
                  : item.kind === 'income'
                    ? styles.amountIncome
                    : styles.amountFx,
                isDisabled && styles.rowTextDim,
              ]}
            >
              {item.kind === 'expense' ? '-' : item.kind === 'income' ? '+' : ''}
              {formatCurrency(Math.abs(item.amount), item.currencyCode)}
            </Text>
          </View>

          <View style={styles.rowBottomLine}>
            <Text style={[styles.rowDate, isDisabled && styles.rowTextDim]}>
              {formatDate(item.date, undefined, locale)}
            </Text>

            {item.suggestedCategoryName && !isDisabled && (
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText} numberOfLines={1}>
                  {item.suggestedCategoryName}
                </Text>
              </View>
            )}

            {isDisabled && (
              <View style={styles.alreadyImportedPill}>
                <Text style={styles.alreadyImportedText}>
                  {t('wiseImport.preview.alreadyImported')}
                </Text>
              </View>
            )}

            {hasPossibleMerge && (
              <View style={styles.possibleMergePill}>
                <Text style={styles.possibleMergeText}>
                  {t('bankImport.possibleMerge')}
                </Text>
              </View>
            )}
          </View>

          {/* Possible-merge action row: offered only when a cross-currency match exists. */}
          {hasPossibleMerge && (
            <View style={styles.mergeActionRow}>
              <TouchableOpacity
                style={styles.mergeActionBtn}
                activeOpacity={0.7}
                onPress={() => {
                  const candidateIds: string[] = (item as any).mergeCandidateIds ?? [];
                  if (candidateIds.length === 0) return;
                  // Navigate to the merge screen with the first candidate.
                  // The import row doesn't yet have a local id, so we exclude it
                  // from commit by de-selecting it first.
                  setSelected((prev) => {
                    const next = new Set(prev);
                    next.delete(item.idx);
                    return next;
                  });
                  router.push({
                    pathname: '/expense/merge' as any,
                    params: {
                      // bId = the existing server-side candidate; aId left blank (row not yet created)
                      bId: candidateIds[0],
                      aId: '',
                    },
                  });
                }}
              >
                <Ionicons name="git-merge-outline" size={14} color={theme.colors.primary} />
                <Text style={styles.mergeActionText}>{t('bankImport.mergeWithExisting')}</Text>
              </TouchableOpacity>
              <Text style={styles.mergeOrText}>{t('common.or', 'or')}</Text>
              <Text style={styles.importAsNewText}>{t('bankImport.importAsNew')}</Text>
            </View>
          )}

        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Parse errors warning banner */}
      {(preview.parseErrors ?? 0) > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning-outline" size={18} color={theme.colors.warning} />
          <Text style={styles.warningText}>
            {t('bankImport.parseErrorsBanner', { count: preview.parseErrors })}
          </Text>
        </View>
      )}

      {/* Preview header with selection count */}
      <View style={styles.previewHeader}>
        <Text style={styles.previewHeaderText}>
          {t('wiseImport.preview.selected', { count: selected.size })}
        </Text>
        {(preview.skipped ?? 0) > 0 && (
          <Text style={styles.previewHeaderSkipped}>
            {t('wiseImport.preview.skipped', { count: preview.skipped })}
          </Text>
        )}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.idx)}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={styles.previewFooter}>
        <TouchableOpacity
          style={[styles.primaryButton, (selected.size === 0 || committing) && styles.primaryButtonDisabled]}
          onPress={handleImport}
          disabled={selected.size === 0 || committing}
          activeOpacity={0.8}
        >
          {committing ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {t('common.import')} ({selected.size})
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },

  // needs_picker branch
  pickerTitle: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    padding: theme.spacing[4],
  },
  pickerSubtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  pickerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    gap: theme.spacing[3],
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.warningLight,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  warningText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.warning,
    flex: 1,
  },

  // Preview header
  previewHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  previewHeaderText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  previewHeaderSkipped: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },

  // Row list
  listContent: {
    paddingVertical: theme.spacing[2],
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginLeft: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.background,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    marginRight: theme.spacing[2],
    marginTop: 2,
    flexShrink: 0,
  },
  kindIconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: theme.spacing[3],
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTopLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  rowDescription: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  rowTextDim: {
    color: theme.colors.textDisabled,
  },
  rowAmount: {
    ...theme.textStyles.bodyMedium,
    flexShrink: 0,
  },
  amountExpense: {
    color: theme.colors.danger,
  },
  amountIncome: {
    color: theme.colors.success,
  },
  amountFx: {
    color: theme.colors.info,
  },
  rowBottomLine: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[1],
    gap: theme.spacing[2],
    flexWrap: 'wrap' as const,
  },
  rowDate: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  categoryChip: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  categoryChipText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  alreadyImportedPill: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  alreadyImportedText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  possibleMergePill: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  possibleMergeText: {
    ...theme.textStyles.caption,
    color: theme.colors.warning,
  },
  mergeActionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
    gap: theme.spacing[2],
    flexWrap: 'wrap' as const,
  },
  mergeActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
  },
  mergeActionText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
    fontFamily: theme.fonts.medium,
  },
  mergeOrText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  importAsNewText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },

  // Footer / commit button
  previewFooter: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  rowLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
