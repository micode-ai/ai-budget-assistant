import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import type { WiseImportPreviewResponse, WiseImportRow, WiseImportCommitResponse } from '@budget/shared-types';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { getIntlLocale } from '@/i18n';

type ScreenState = 'idle' | 'parsing' | 'preview' | 'committing' | 'done';

export default function WiseImportScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [previewData, setPreviewData] = useState<WiseImportPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [commitResult, setCommitResult] = useState<WiseImportCommitResponse | null>(null);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setScreenState('parsing');

      try {
        const preview = await api.importWisePreview({
          uri: asset.uri,
          name: asset.name ?? 'wise-export.csv',
          type: 'text/csv',
        });

        const importableIdxs = new Set(
          preview.rows.filter((r) => !r.alreadyImported).map((r) => r.idx),
        );
        setPreviewData(preview);
        setSelected(importableIdxs);
        setScreenState('preview');
      } catch (err) {
        setScreenState('idle');
        Alert.alert(
          t('wiseImport.error.parseFailed'),
          err instanceof Error ? err.message : String(err),
        );
      }
    } catch (err) {
      Alert.alert(
        t('wiseImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const toggleRow = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!previewData) return;

    const rowsToCommit = previewData.rows.filter(
      (r) => selected.has(r.idx) && !r.alreadyImported,
    );

    setScreenState('committing');

    try {
      const result = await api.importWiseCommit({ rows: rowsToCommit });
      setCommitResult(result);

      await useExpenseStore.getState().loadExpenses({ force: true });
      await useIncomeStore.getState().loadIncomes({ force: true });

      setScreenState('done');
    } catch (err) {
      setScreenState('preview');
      Alert.alert(
        t('wiseImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const handleReset = () => {
    setScreenState('idle');
    setPreviewData(null);
    setSelected(new Set());
    setCommitResult(null);
  };

  const renderRow = ({ item }: { item: WiseImportRow }) => {
    const isChecked = selected.has(item.idx);
    const isDisabled = item.alreadyImported;
    const locale = getIntlLocale();

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
        onPress={() => !isDisabled && toggleRow(item.idx)}
        activeOpacity={isDisabled ? 1 : 0.7}
      >
        <Ionicons
          name={isChecked ? 'checkbox-outline' : 'square-outline'}
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
            <Text style={[
              styles.rowAmount,
              item.kind === 'expense' ? styles.amountExpense : item.kind === 'income' ? styles.amountIncome : styles.amountFx,
              isDisabled && styles.rowTextDim,
            ]}>
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
          </View>

          {item.kind === 'fx' && item.fxFromCurrency && item.fxToCurrency && (
            <View style={styles.fxRow}>
              <Ionicons name="swap-horizontal-outline" size={12} color={theme.colors.info} style={styles.fxIcon} />
              <Text style={styles.fxLabel}>{t('wiseImport.preview.fxPair')}: </Text>
              <Text style={styles.fxValue}>
                {formatCurrency(item.fxFromAmount ?? 0, item.fxFromCurrency)}
                {' → '}
                {formatCurrency(item.fxToAmount ?? 0, item.fxToCurrency)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (screenState === 'idle') {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.idleContent}>
          <View style={styles.iconHero}>
            <Ionicons name="swap-horizontal-outline" size={48} color="#00b9ff" />
          </View>

          <Text style={styles.title}>{t('wiseImport.title')}</Text>
          <Text style={styles.subtitle}>{t('wiseImport.subtitle')}</Text>

          <View style={styles.helpCard}>
            <Ionicons name="information-circle-outline" size={20} color={theme.colors.info} style={styles.helpIcon} />
            <Text style={styles.helpText}>{t('wiseImport.help.where')}</Text>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile} activeOpacity={0.8}>
            <Ionicons name="document-outline" size={20} color={theme.colors.textInverse} style={styles.buttonIcon} />
            <Text style={styles.primaryButtonText}>{t('wiseImport.pickFile')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'parsing' || screenState === 'committing') {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingLabel}>{t('wiseImport.parsing')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (screenState === 'done' && commitResult) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.doneContent}>
          <View style={styles.successIconContainer}>
            <Ionicons name="checkmark-circle" size={72} color={theme.colors.success} />
          </View>

          <Text style={styles.doneTitle}>{t('wiseImport.success')}</Text>

          <Text style={styles.doneSummary}>
            {t('wiseImport.summary', {
              expenses: commitResult.createdExpenses,
              incomes: commitResult.createdIncomes,
              exchanges: commitResult.createdExchanges,
            })}
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleReset} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>{t('wiseImport.importAnother')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewHeaderText}>
          {t('wiseImport.preview.selected', { count: selected.size })}
        </Text>
        {(previewData?.skipped ?? 0) > 0 && (
          <Text style={styles.previewHeaderSkipped}>
            {t('wiseImport.preview.skipped', { count: previewData!.skipped })}
          </Text>
        )}
      </View>

      <FlatList
        data={previewData?.rows ?? []}
        keyExtractor={(item) => String(item.idx)}
        renderItem={renderRow}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <View style={styles.previewFooter}>
        <TouchableOpacity
          style={[styles.primaryButton, selected.size === 0 && styles.primaryButtonDisabled]}
          onPress={handleImport}
          disabled={selected.size === 0}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>{t('wiseImport.importButton')}</Text>
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
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[3],
  },
  loadingLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },

  idleContent: {
    flex: 1,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  iconHero: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#00b9ff18',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: theme.spacing[5],
  },
  title: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  subtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[6],
  },
  helpCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[6],
    gap: theme.spacing[2],
    alignSelf: 'stretch' as const,
  },
  helpIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  helpText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },

  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
    gap: theme.spacing[2],
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    alignSelf: 'stretch' as const,
    marginTop: theme.spacing[2],
  },
  secondaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  buttonIcon: {
    flexShrink: 0,
  },

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
  fxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: theme.spacing[1],
  },
  fxIcon: {
    marginRight: 3,
  },
  fxLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  fxValue: {
    ...theme.textStyles.caption,
    color: theme.colors.info,
  },

  previewFooter: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },

  doneContent: {
    flex: 1,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  successIconContainer: {
    marginBottom: theme.spacing[5],
  },
  doneTitle: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  doneSummary: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[6],
  },
});
