import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import type { CsvImportMapping } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';

// Only banks whose parser has been validated against a real export are shown.
// ING / Millennium / Pekao are temporarily hidden (parsers still in the API
// registry) until validated against real CSVs. Alior / Revolut to be added
// once their parsers land. Erste accepts a PDF statement, the rest take CSV.
// See ABA-126.
const BANKS = [
  { id: 'wise', label: 'Wise' },
  { id: 'mbank', label: 'mBank' },
  { id: 'pko', label: 'PKO BP' },
  { id: 'erste', label: 'Erste Bank (PDF)' },
  { id: 'alior', label: 'Alior Bank (PDF)' },
  { id: 'universal', label: 'Other (custom CSV)' },
];

export default function ImportHubScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [mappings, setMappings] = useState<CsvImportMapping[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    reset();
    loadMappings();
  }, [loadMappings, reset]);

  const pickAndPreview = async (bankId?: string, mappingId?: string) => {
    if (bankId === 'wise') {
      router.push('/settings/wise-import');
      return;
    }

    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/pdf', '*/*'],
        copyToCacheDirectory: true,
      });
    } catch (err) {
      Alert.alert(
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
      type: isPdf ? 'application/pdf' : 'text/csv',
    };

    setFileAsset(file);
    setPickedBankId(bankId ?? null);
    setPickedMappingId(mappingId ?? null);

    try {
      const preview = await api.importBankPreview(file, { bankId, mappingId });
      useImportStore.getState().setPreview(preview);
      router.push('/settings/import/preview');
    } catch (err) {
      Alert.alert(
        t('bankImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const deleteMapping = (m: CsvImportMapping) => {
    Alert.alert(
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={[]}
        keyExtractor={() => 'no-data'}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionHeader}>{t('bankImport.quickImportHeader')}</Text>
            {BANKS.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={styles.row}
                onPress={() => pickAndPreview(b.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="business-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.rowLabel}>{b.label}</Text>
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
  loadingIndicator: {
    padding: theme.spacing[4],
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    padding: theme.spacing[4],
  },
});
