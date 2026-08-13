import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Platform } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import type { CsvImportMapping, ImportBatchDto } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useIncomeStore } from '@/stores/incomeStore';
import { isTierRequiredError } from '@/services/importErrors';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { IMPORT_ENTRIES, MIGRATION_ENTRIES, importSourceLabel } from '@/features/import/importEntries';

// Only banks whose parser has been validated against a real export are shown.
// ING / Millennium / Pekao are temporarily hidden (parsers still in the API
// registry) until validated against real CSVs. Erste accepts a PDF statement,
// the rest take CSV. See ABA-126.
// Rows and their source labels live in src/features/import/importEntries.ts —
// see the comment there for why the first row deliberately carries no id.

export default function ImportHubScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [mappings, setMappings] = useState<CsvImportMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ImportBatchDto[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  // The preview request can take tens of seconds on the AI path — one LLM call
  // for a format we have never seen, plus the dedup queries. Without this the
  // screen sat completely inert after the file was chosen, so the only
  // reasonable reading was that the tap had done nothing.
  const [previewing, setPreviewing] = useState(false);
  const reset = useImportStore((s) => s.reset);
  const setFileAsset = useImportStore((s) => s.setFileAsset);
  const setPickedBankId = useImportStore((s) => s.setPickedBankId);
  const setPickedMappingId = useImportStore((s) => s.setPickedMappingId);

  const loadMappings = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listCsvImportMappings();
      setMappings(result);
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      setBatchesLoading(true);
      const result = await api.listImportBatches();
      setBatches(result.batches);
    } catch {
      setBatches([]);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    reset();
    loadMappings();
    loadBatches();
  }, [loadMappings, loadBatches, reset]);

  const pickAndPreview = async (bankId?: string, mappingId?: string) => {
    if (bankId === 'wise') {
      router.push('/settings/wise-import');
      return;
    }

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
    } catch (err) {
      showAlert(
        t('bankImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
      return;
    }

    if (picked.canceled) return;

    const asset = picked.assets[0];
    const isPdf =
      bankId === 'erste' ||
      bankId === 'alior' ||
      asset.mimeType === 'application/pdf' ||
      (asset.name ?? '').toLowerCase().endsWith('.pdf');
    const file = {
      uri: asset.uri,
      name: asset.name ?? (isPdf ? 'statement.pdf' : 'bank.csv'),
      // Server sniffs the buffer (XLSX zip magic) and never trusts this label, so we don't need to add XLSX MIME types here.
      type: isPdf ? 'application/pdf' : 'text/csv',
    };

    setFileAsset(file);
    setPickedBankId(bankId ?? null);
    setPickedMappingId(mappingId ?? null);

    setPreviewing(true);
    try {
      const preview = await api.importBankPreview(file, { bankId, mappingId });
      useImportStore.getState().setPreview(preview);
      router.push('/settings/import/preview');
    } catch (err) {
      if (isTierRequiredError(err)) {
        useUpgradeStore.getState().show(t('bankImport.aiPdfPaywall'), err.requiredTier ?? 'pro');
        return;
      }
      showAlert(
        t('bankImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setPreviewing(false);
    }
  };

  const deleteMapping = (m: CsvImportMapping) => {
    showAlert(
      t('bankImport.deleteMapping'),
      t('bankImport.deleteMappingConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await api.deleteCsvImportMapping(m.id);
            loadMappings();
          },
        },
      ],
    );
  };

  const handleUndo = (batch: ImportBatchDto) => {
    showAlert(
      t('bankImport.undoImportTitle'),
      t('bankImport.undoImportConfirm', { count: batch.rowCount }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('bankImport.undoImportAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.rollbackImportBatch(batch.id);
              await useExpenseStore.getState().loadExpenses({ force: true });
              await useIncomeStore.getState().loadIncomes({ force: true });
              loadBatches();
            } catch (err) {
              showAlert(
                t('common.error'),
                err instanceof Error ? err.message : String(err),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={[]}
        keyExtractor={() => 'no-data'}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionHeader}>{t('bankImport.quickImportHeader')}</Text>
            {previewing ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.rowLabel}>{t('bankImport.analysing')}</Text>
              </View>
            ) : (
              IMPORT_ENTRIES.map((e) => (
                <TouchableOpacity
                  key={e.id ?? 'auto'}
                  style={styles.row}
                  onPress={() => pickAndPreview(e.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={e.icon} size={20} color={theme.colors.primary} />
                  <Text style={styles.rowLabel}>{e.labelKey ? t(e.labelKey) : e.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              ))
            )}

            <Text style={styles.sectionHeader}>{t('bankImport.migrationHeader')}</Text>
            <Text style={styles.empty}>{t('bankImport.migrationHint')}</Text>
            {!previewing &&
              MIGRATION_ENTRIES.map((e) => (
                <TouchableOpacity
                  key={e.id}
                  style={styles.row}
                  onPress={() => pickAndPreview(e.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={e.icon} size={20} color={theme.colors.primary} />
                  <Text style={styles.rowLabel}>{e.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              ))}

            <Text style={styles.sectionHeader}>{t('bankImport.savedMappingsHeader')}</Text>
            {loading ? (
              <ActivityIndicator style={styles.loadingIndicator} color={theme.colors.primary} />
            ) : mappings.length === 0 ? (
              <Text style={styles.empty}>{t('bankImport.noSavedMappings')}</Text>
            ) : (
              mappings.map((m) => (
                <View key={m.id} style={styles.row}>
                  <TouchableOpacity
                    style={styles.mappingMain}
                    onPress={() => pickAndPreview(undefined, m.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
                    <Text style={styles.rowLabel}>{m.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMapping(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.requestCard}
                onPress={() => router.push('/settings/auto-capture' as any)}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
                <View style={styles.requestTextWrap}>
                  <Text style={styles.requestTitle}>{t('autoCapture.title')}</Text>
                  <Text style={styles.requestSubtitle}>{t('autoCapture.subtitle')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.requestCard}
              onPress={() => router.push('/settings/import/request-bank')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
              <View style={styles.requestTextWrap}>
                <Text style={styles.requestTitle}>{t('bankImport.requestCardTitle')}</Text>
                <Text style={styles.requestSubtitle}>{t('bankImport.requestCardSubtitle')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>

            <Text style={styles.sectionHeader}>{t('bankImport.pastImportsHeader')}</Text>
            {batchesLoading ? (
              <ActivityIndicator style={styles.loadingIndicator} color={theme.colors.primary} />
            ) : batches.length === 0 ? (
              <Text style={styles.empty}>{t('bankImport.noPastImports')}</Text>
            ) : (
              batches.map((batch) => (
                <View key={batch.id} style={styles.row}>
                  <View style={styles.mappingMain}>
                    <Ionicons
                      name={batch.status === 'rolled_back' ? 'close-circle-outline' : 'checkmark-circle-outline'}
                      size={20}
                      color={batch.status === 'rolled_back' ? theme.colors.textTertiary : theme.colors.success}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{importSourceLabel(batch.source)}</Text>
                      <Text style={styles.batchMeta}>
                        {new Date(batch.importedAt).toLocaleDateString()}
                        {' · '}
                        {t('bankImport.transactionCount', { count: batch.rowCount })}
                      </Text>
                    </View>
                  </View>
                  {batch.canRollback && (
                    <TouchableOpacity
                      onPress={() => handleUndo(batch)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="arrow-undo-outline" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  sectionHeader: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[2],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
    gap: theme.spacing[3],
  },
  mappingMain: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  rowLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  batchMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  loadingIndicator: {
    padding: theme.spacing[4],
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    padding: theme.spacing[4],
  },
  requestCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    margin: theme.spacing[4],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed' as const,
  },
  requestTextWrap: { flex: 1 },
  requestTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  requestSubtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
});
