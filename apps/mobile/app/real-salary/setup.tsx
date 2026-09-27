import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import type { SalaryCandidate } from '@budget/shared-types';
import { manualCurrency, parseMonthlyAmount } from '@/features/insights/realSalary';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';

/** Same bound the API enforces (`manualPreviousMonthly` > 0 and <= 10,000,000). */
const MAX_MANUAL_PREVIOUS = 10_000_000;

export default function RealSalarySetupScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<SalaryCandidate[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previous, setPrevious] = useState('');
  // The confirmed salary key from a PREVIOUS save, when it no longer matches
  // any freshly-detected candidate (a category was renamed, the income
  // stopped recurring, etc.) — kept so the user's existing choice stays
  // visible and selected instead of silently falling back to candidates[0].
  const [missingSavedKey, setMissingSavedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { profile, candidates: list } = await api.getRealSalaryProfile();
      setCandidates(list);
      const savedKey = profile.salaryKey;
      const savedKeyMissing = !!savedKey && !list.some((c) => c.key === savedKey);
      setMissingSavedKey(savedKeyMissing ? savedKey : null);
      setSelectedKey(savedKey ?? list[0]?.key ?? null);
      setPrevious(profile.manualPreviousMonthly != null ? String(profile.manualPreviousMonthly) : '');
    } catch (e) {
      console.warn('Failed to load real-salary profile', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    const parsed = parseMonthlyAmount(previous);
    let manualPreviousMonthly: number | null;
    if (parsed === null) {
      manualPreviousMonthly = null;
    } else if (Number.isNaN(parsed) || parsed <= 0 || parsed > MAX_MANUAL_PREVIOUS) {
      showAlert(t('common.error'), t('realSalary.setup.invalid'));
      return;
    } else {
      manualPreviousMonthly = parsed;
    }

    setSaving(true);
    try {
      await api.saveRealSalaryProfile({ salaryKey: selectedKey, manualPreviousMonthly });
      router.back();
    } catch (e) {
      console.warn('Failed to save real-salary profile', e);
      showAlert(t('common.error'), e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }, [previous, selectedKey, t]);

  const currency = manualCurrency(candidates, selectedKey);

  // Built straight from the key (`${categoryId ?? ''}|${descriptionKey}|${currencyCode}`) —
  // there is no candidate row to read a name/amount from any more.
  const missingSavedSegments = missingSavedKey?.split('|') ?? null;
  const missingSavedDescription = missingSavedSegments?.[1] ?? '';
  const missingSavedCurrency = missingSavedSegments?.[2] ?? '';
  const missingSavedTitle = missingSavedDescription || missingSavedCurrency;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator style={styles.spinner} size="large" color={theme.colors.primary} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
            <Text style={styles.errorText}>{t('common.error')}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={load}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.header}>{t('realSalary.setup.pick')}</Text>

            {candidates.length === 0 ? (
              <Text style={styles.emptyText}>{t('realSalary.setup.none')}</Text>
            ) : (
              <>
                <View style={styles.card}>
                  {missingSavedKey && (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => setSelectedKey(missingSavedKey)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selectedKey === missingSavedKey }}
                    >
                      <Ionicons
                        name={selectedKey === missingSavedKey ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selectedKey === missingSavedKey ? theme.colors.primary : theme.colors.textTertiary}
                      />
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {missingSavedTitle}
                        </Text>
                        <Text style={styles.rowSubtitle}>{missingSavedCurrency}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  {candidates.map((c, index) => {
                    const checked = c.key === selectedKey;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.row, (index > 0 || !!missingSavedKey) && styles.rowDivider]}
                        onPress={() => setSelectedKey(c.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked }}
                      >
                        <Ionicons
                          name={checked ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={checked ? theme.colors.primary : theme.colors.textTertiary}
                        />
                        <View style={styles.rowText}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {c.categoryName ?? c.descriptionKey}
                          </Text>
                          <Text style={styles.rowSubtitle}>
                            {formatCurrency(c.typicalAmount, c.currencyCode)} ·{' '}
                            {t('realSalary.setup.times', { count: c.occurrences })}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.label}>
                  {t('realSalary.setup.previousLabel', { currency: currency ?? '' })}
                </Text>
                <TextInput
                  style={styles.input}
                  value={previous}
                  onChangeText={setPrevious}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.hint}>{t('realSalary.setup.previousHint')}</Text>

                {canEdit && (
                  <TouchableOpacity
                    style={[styles.submitButton, saving && styles.submitButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color={theme.colors.textInverse} />
                    ) : (
                      <Text style={styles.submitButtonText}>{t('realSalary.setup.save')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[5] },

  spinner: { paddingVertical: theme.spacing[10] },

  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[10],
  },
  errorText: { ...theme.textStyles.body, color: theme.colors.danger, textAlign: 'center' as const },
  retryButton: {
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: { ...theme.textStyles.button, color: theme.colors.textInverse },

  header: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[3.5],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowText: { flex: 1 },
  rowTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  rowSubtitle: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[0.5] },

  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },

  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[6],
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { ...theme.textStyles.button, color: theme.colors.textInverse },
});
