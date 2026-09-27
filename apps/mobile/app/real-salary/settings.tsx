import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { CoicopDivision, RealSalaryCategoryRow } from '@budget/shared-types';
import { formatCurrency } from '@budget/shared-utils';
import { countryName, groupSettingsCategories } from '@/features/insights/realSalary';
import { getIntlLocale } from '@/i18n';
import { CountryPickerSheet } from '@/components/real-salary/CountryPickerSheet';
import { DivisionPickerSheet } from '@/components/real-salary/DivisionPickerSheet';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';

export default function RealSalarySettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);
  const locale = getIntlLocale();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [country, setCountry] = useState<string | null>(null);
  const [countryGuessed, setCountryGuessed] = useState(false);
  const [categories, setCategories] = useState<RealSalaryCategoryRow[]>([]);

  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySaving, setCountrySaving] = useState(false);

  // The category currently open in the division picker — the sheet's own
  // `visible` prop follows `!!divisionCategoryId` below.
  const [divisionCategoryId, setDivisionCategoryId] = useState<string | null>(null);
  const [categorySavingId, setCategorySavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Capture the account at request time. If it changes while the request is
    // in flight, ignore the response — it belongs to a previous account.
    const accountId = useAccountStore.getState().currentAccountId;

    setLoading(true);
    setError(false);
    try {
      const [salary, categoryRows] = await Promise.all([api.getRealSalary(), api.getRealSalaryCategories()]);
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      setCountry(salary.country);
      setCountryGuessed(salary.countryGuessed);
      setCategories(categoryRows);
    } catch (e) {
      if (useAccountStore.getState().currentAccountId !== accountId) return;
      console.warn('Failed to load real-salary settings', e);
      setError(true);
    } finally {
      // Only clear loading if the account hasn't changed.
      if (useAccountStore.getState().currentAccountId === accountId) {
        setLoading(false);
      }
    }
    // currentAccountId: a switch must refetch (X-Account-Id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  // Clear the previous account's data immediately when the account changes,
  // before the new load fires — so nothing stale is tappable meanwhile.
  useEffect(() => {
    setCountry(null);
    setCountryGuessed(false);
    setCategories([]);
    setDivisionCategoryId(null);
  }, [currentAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const countryLabel =
    country === null
      ? t('realSalary.config.countryNone')
      : countryGuessed
        ? t('realSalary.config.countryGuessed', { country: countryName(country, locale) })
        : countryName(country, locale);

  const handleSelectCountry = useCallback(
    async (code: string | null) => {
      setCountrySaving(true);
      try {
        await api.updateProfile({ inflationCountry: code });
        // The shared User entity has no `inflationCountry` field (checked
        // packages/shared-types/src/entities) so there is no authStore copy
        // to update in tandem — reloading from the API is the only source.
        await load();
      } catch (e) {
        console.warn('Failed to update inflation country', e);
        showAlert(t('common.error'), e instanceof Error ? e.message : t('common.error'));
      } finally {
        setCountrySaving(false);
      }
    },
    [load, t],
  );

  const divisionCategory = categories.find((c) => c.id === divisionCategoryId) ?? null;
  const { unassigned, assigned } = groupSettingsCategories(categories);

  const handleSelectDivision = useCallback(
    async (division: CoicopDivision) => {
      if (!divisionCategory) return;
      const id = divisionCategory.id;
      setCategorySavingId(id);
      try {
        await api.updateCategory(id, { coicopDivision: division });
        setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, coicopDivision: division } : c)));
      } catch (e) {
        console.warn('Failed to update category price group', e);
        showAlert(t('common.error'), e instanceof Error ? e.message : t('common.error'));
      } finally {
        setCategorySavingId(null);
      }
    },
    [divisionCategory, t],
  );

  const renderCategory = (cat: RealSalaryCategoryRow, index: number) => {
    const isSaving = categorySavingId === cat.id;
    const rowInner = (
      <>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {`${cat.icon ?? ''} ${cat.name}`.trim()}
          </Text>
          {cat.spend !== undefined && cat.spendCurrency && (
            <Text style={styles.rowAmount} numberOfLines={1}>
              {formatCurrency(cat.spend, cat.spendCurrency)}
            </Text>
          )}
        </View>
        <View style={styles.rowValueContainer}>
          {isSaving ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text style={styles.rowValue} numberOfLines={1}>
              {cat.coicopDivision ? t(`realSalary.division.${cat.coicopDivision}`) : t('realSalary.config.auto')}
            </Text>
          )}
          {canEdit && <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />}
        </View>
      </>
    );
    return canEdit ? (
      <TouchableOpacity
        key={cat.id}
        style={[styles.row, index > 0 && styles.rowDivider]}
        accessibilityRole="button"
        onPress={() => setDivisionCategoryId(cat.id)}
        disabled={isSaving}
      >
        {rowInner}
      </TouchableOpacity>
    ) : (
      <View key={cat.id} style={[styles.row, index > 0 && styles.rowDivider]}>
        {rowInner}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
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
            {canEdit && (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.row}
                  accessibilityRole="button"
                  onPress={() => router.push('/real-salary/setup')}
                >
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {t('realSalary.setup.title')}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionLabel}>{t('realSalary.config.country')}</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                accessibilityRole="button"
                onPress={() => setCountryPickerVisible(true)}
                disabled={countrySaving}
              >
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {t('realSalary.config.country')}
                </Text>
                <View style={styles.rowValueContainer}>
                  {countrySaving ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {countryLabel}
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </View>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>{t('realSalary.config.categories')}</Text>
            <Text style={styles.hint}>{t('realSalary.config.categoriesHint')}</Text>
            {unassigned.length > 0 && (
              <>
                <Text style={styles.groupLabel}>{t('realSalary.config.unassignedHeader')}</Text>
                <View style={styles.card}>{unassigned.map(renderCategory)}</View>
              </>
            )}
            {assigned.length > 0 && (
              <>
                <Text style={styles.groupLabel}>{t('realSalary.config.assignedHeader')}</Text>
                <View style={styles.card}>{assigned.map(renderCategory)}</View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <CountryPickerSheet
        visible={countryPickerVisible}
        selected={countryGuessed ? null : country}
        onSelect={handleSelectCountry}
        onClose={() => setCountryPickerVisible(false)}
      />
      <DivisionPickerSheet
        visible={!!divisionCategory}
        selected={divisionCategory?.coicopDivision ?? null}
        onSelect={handleSelectDivision}
        onClose={() => setDivisionCategoryId(null)}
      />
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

  sectionLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
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
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[3.5],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowLabel: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
  rowText: { flex: 1, minWidth: 0 },
  rowAmount: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: 2 },
  groupLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1.5],
  },
  rowValueContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    flexShrink: 1,
  },
  rowValue: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flexShrink: 1, textAlign: 'right' as const },
});
