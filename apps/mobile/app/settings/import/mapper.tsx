import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColumnMapping } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { useImportStore } from '@/stores/importStore';
import { isTierRequiredError } from '@/services/importErrors';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { resolveMapperInitialState } from '@/features/import/resolveMapperInitialState';
import type { MapperAmountFormat as AmountFormat, MapperDateFormat as DateFormat, MapperEncoding as Encoding } from '@/features/import/resolveMapperInitialState';

export default function ColumnMapperScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const preview = useImportStore((s) => s.previewData);
  const file = useImportStore((s) => s.fileAsset);
  const setPreview = useImportStore((s) => s.setPreview);
  const setPendingMapping = useImportStore((s) => s.setPendingMapping);

  const headers = preview?.headers ?? [];
  const sample = preview?.sampleRows ?? [];

  // Computed fresh each render (cheap, pure) but only ever CONSUMED by the
  // useState calls below, which — like any React state initializer — use it
  // once, at mount, and ignore it on every later render.
  const initial = resolveMapperInitialState(preview, headers);

  const [dateCol, setDateCol] = useState(initial.dateCol);
  const [splitDebitCredit, setSplitDebitCredit] = useState(initial.splitDebitCredit);
  const [amountCol, setAmountCol] = useState(initial.amountCol);
  const [debitCol, setDebitCol] = useState(initial.debitCol);
  const [creditCol, setCreditCol] = useState(initial.creditCol);
  const [descCol, setDescCol] = useState(initial.descCol);
  const [currencyCol, setCurrencyCol] = useState(initial.currencyCol);
  const [counterpartyCol, setCounterpartyCol] = useState(initial.counterpartyCol);
  const [delimiter, setDelimiter] = useState(initial.delimiter);
  const [encoding, setEncoding] = useState<Encoding>(initial.encoding);
  const [amountFormat, setAmountFormat] = useState<AmountFormat>(initial.amountFormat);
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.dateFormat);

  const mapping = useMemo<ColumnMapping>(
    () => ({
      date: dateCol,
      amount: splitDebitCredit ? { debit: debitCol, credit: creditCol } : amountCol,
      description: descCol,
      currency: currencyCol || undefined,
      counterparty: counterpartyCol || undefined,
    }),
    [dateCol, splitDebitCredit, debitCol, creditCol, amountCol, descCol, currencyCol, counterpartyCol],
  );

  const isValid = useMemo(() => {
    if (!dateCol || !descCol) return false;
    return splitDebitCredit ? !!(debitCol && creditCol) : !!amountCol;
  }, [dateCol, descCol, splitDebitCredit, debitCol, creditCol, amountCol]);

  const handleContinue = async () => {
    if (!file || !isValid) return;
    setPendingMapping({ mapping, delimiter, encoding, amountFormat, dateFormat });
    try {
      const res = await api.importBankPreview(file, {
        bankId: 'universal',
        mapping: JSON.stringify(mapping),
        delimiter,
        amountFormat,
        dateFormat,
      });
      setPreview(res);
      router.replace('/settings/import/preview');
    } catch (err) {
      // The AI-consent decline flow routes here with the original file still
      // in the store — if it was a PDF, the server re-detects it by magic
      // bytes regardless of the `bankId: 'universal'` sent below, and can
      // still 403 with TIER_REQUIRED (see ImportBankService.parsePreview).
      if (isTierRequiredError(err)) {
        useUpgradeStore.getState().show(t('bankImport.aiPdfPaywall'), err.requiredTier ?? 'pro');
        return;
      }
      showAlert(
        t('bankImport.error.parseFailed'),
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing[4],
          gap: theme.spacing[3],
        }}
      >
        <Text style={styles.h2}>{t('bankImport.mapperTitle')}</Text>
        <Text style={styles.sub}>{t('bankImport.mapperSubtitle')}</Text>

        {sample.length > 0 ? (
          <View style={styles.sample}>
            {sample.slice(0, 3).map((row, i) => (
              <Text key={i} style={styles.sampleRow} numberOfLines={1}>
                {row.join(' | ')}
              </Text>
            ))}
          </View>
        ) : null}

        <ColumnPicker
          label={t('bankImport.mapperDate')}
          value={dateCol}
          options={headers}
          onChange={setDateCol}
          theme={theme}
          styles={styles}
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>{t('bankImport.mapperSplitDebitCredit')}</Text>
          <Switch value={splitDebitCredit} onValueChange={setSplitDebitCredit} />
        </View>

        {splitDebitCredit ? (
          <>
            <ColumnPicker
              label={t('bankImport.mapperDebit')}
              value={debitCol}
              options={headers}
              onChange={setDebitCol}
              theme={theme}
              styles={styles}
            />
            <ColumnPicker
              label={t('bankImport.mapperCredit')}
              value={creditCol}
              options={headers}
              onChange={setCreditCol}
              theme={theme}
              styles={styles}
            />
          </>
        ) : (
          <ColumnPicker
            label={t('bankImport.mapperAmount')}
            value={amountCol}
            options={headers}
            onChange={setAmountCol}
            theme={theme}
            styles={styles}
          />
        )}

        <ColumnPicker
          label={t('bankImport.mapperDescription')}
          value={descCol}
          options={headers}
          onChange={setDescCol}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperCurrency')}
          value={currencyCol}
          options={['', ...headers]}
          onChange={setCurrencyCol}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperCounterparty')}
          value={counterpartyCol}
          options={['', ...headers]}
          onChange={setCounterpartyCol}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperDelimiter')}
          value={delimiter}
          options={[';', ',', '\t']}
          onChange={setDelimiter}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperEncoding')}
          value={encoding}
          options={['auto', 'utf-8', 'windows-1250']}
          onChange={(v) => setEncoding(v as Encoding)}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperAmountFormat')}
          value={amountFormat}
          options={['polish', 'standard']}
          onChange={(v) => setAmountFormat(v as AmountFormat)}
          theme={theme}
          styles={styles}
        />
        <ColumnPicker
          label={t('bankImport.mapperDateFormat')}
          value={dateFormat}
          options={['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD']}
          onChange={(v) => setDateFormat(v as DateFormat)}
          theme={theme}
          styles={styles}
        />
      </ScrollView>

      <TouchableOpacity
        style={[styles.primary, !isValid && styles.primaryDisabled]}
        disabled={!isValid}
        onPress={handleContinue}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryText}>{t('bankImport.mapperContinue')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

interface PickerProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  theme: ReturnType<typeof useTheme>;
  styles: ReturnType<typeof createStyles>;
}

function ColumnPicker({ label, value, options, onChange, theme, styles }: PickerProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 6 }}
      >
        {options.map((o) => (
          <TouchableOpacity
            key={o === '' ? '__empty' : o}
            onPress={() => onChange(o)}
            style={[
              styles.chip,
              value === o ? styles.chipSelected : styles.chipUnselected,
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.chipText,
                value === o ? styles.chipTextSelected : styles.chipTextUnselected,
              ]}
            >
              {o === '' ? '—' : o}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  h2: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
  },
  sub: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  sample: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    gap: 4,
  },
  sampleRow: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    fontFamily: 'monospace' as const,
  },
  switchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[2],
  },
  label: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.divider,
  },
  chipText: {
    ...theme.textStyles.bodySm,
  },
  chipTextSelected: {
    color: theme.colors.textInverse,
  },
  chipTextUnselected: {
    color: theme.colors.textPrimary,
  },
  primary: {
    margin: theme.spacing[4],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
  },
  primaryDisabled: {
    opacity: 0.4,
  },
  primaryText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
