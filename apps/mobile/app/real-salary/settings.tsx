import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { CoicopDivision, RealSalaryCategoryRow } from '@budget/shared-types';
import { countryName } from '@/features/insights/realSalary';
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
    setLoading(true);
    setError(false);
    try {
      const [salary, categoryRows] = await Promise.all([api.getRealSalary(), api.getRealSalaryCategories()]);
      setCountry(salary.country);
      setCountryGuessed(salary.countryGuessed);
      setCategories(categoryRows);
    } catch (e) {
      console.warn('Failed to load real-salary settings', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
            <View style={styles.card}>
              {categories.map((cat, index) => {
                const isSaving = categorySavingId === cat.id;
                const rowInner = (
                  <>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {`${cat.icon ?? ''} ${cat.name}`.trim()}
                    </Text>
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
              })}
            </View>
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
  rowValueContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    flexShrink: 1,
  },
  rowValue: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flexShrink: 1, textAlign: 'right' as const },
});
