import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Expense, UtilityKind, UtilityReading, UtilityUnit } from '@budget/shared-types';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  expense: Expense;
  canEdit: boolean;
}

const SHEET_TITLE_ID = 'utility-reading-sheet-title';
const KINDS: UtilityKind[] = ['electricity', 'gas', 'water', 'heating'];
const UNITS: UtilityUnit[] = ['kwh', 'm3', 'gj'];
const UNIT_LABEL: Record<UtilityUnit, string> = { kwh: 'kWh', m3: 'm³', gj: 'GJ' };
const DEFAULT_UNIT: Record<UtilityKind, UtilityUnit> = {
  electricity: 'kwh',
  gas: 'm3',
  water: 'm3',
  heating: 'gj',
};

function parseConsumption(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The expense screen's utility-reading card (ABA-849): the consumption (kWh, m3, GJ) that
 * turns a utility bill into data for Utilities. Shown to editors, or to anyone once a reading
 * exists. Online only - readings have no SQLite mirror; the server resolves the device id or PK,
 * and an expense it has not received yet answers 404, which the save reports. The sheet's bottom
 * inset is handled by `SheetDialog`.
 */
export function UtilityReadingSection({ expense, canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const expenseId = expense.serverId ?? expense.id;

  const [reading, setReading] = useState<UtilityReading | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [kind, setKind] = useState<UtilityKind>('electricity');
  const [unit, setUnit] = useState<UtilityUnit>('kwh');
  const [consumption, setConsumption] = useState('');
  const [property, setProperty] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReading(null);
    api
      .getUtilityReading(expenseId)
      .then((r) => {
        if (!cancelled) setReading(r ?? null);
      })
      .catch((err) => {
        // Offline, or an expense the server has not seen yet: no reading to show.
        console.warn('Utility reading unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (!reading && !canEdit) return null;

  const parsed = parseConsumption(consumption);
  const canSave = parsed !== null && !isSaving;

  const open = () => {
    const k = reading?.kind ?? 'electricity';
    setKind(k);
    setUnit(reading?.unit ?? DEFAULT_UNIT[k]);
    setConsumption(reading ? String(Number(reading.consumption)) : '');
    setProperty(reading?.propertyLabel ?? '');
    setSheetVisible(true);
  };

  const pickKind = (k: UtilityKind) => {
    setKind(k);
    setUnit(DEFAULT_UNIT[k]);
  };

  const save = async () => {
    if (parsed === null || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await api.upsertUtilityReading(expenseId, {
        kind,
        consumption: parsed,
        unit,
        propertyLabel: property.trim() || null,
      });
      setReading(saved);
      setSheetVisible(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      console.warn('[utility] save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), status === 404 ? t('utilities.reading.notSyncedYet') : t('utilities.reading.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.deleteUtilityReading(expenseId);
      setReading(null);
      setSheetVisible(false);
    } catch (e) {
      console.warn('[utility] remove failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('utilities.reading.saveFailed'));
    }
  };

  const summary = reading
    ? [
        t(`utilities.kinds.${reading.kind}`),
        `${Number(reading.consumption).toLocaleString(getIntlLocale())} ${UNIT_LABEL[reading.unit]}`,
        `${formatCurrency(Number(reading.unitPrice), expense.currencyCode)} / ${UNIT_LABEL[reading.unit]}`,
        reading.propertyLabel,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="flash-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.title}>{t('utilities.reading.title')}</Text>
      </View>
      {summary ? (
        <TouchableOpacity activeOpacity={canEdit ? 0.7 : 1} onPress={canEdit ? open : undefined}>
          <Text style={styles.summary}>{summary}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={open} accessibilityRole="button">
          <Text style={styles.link}>{t('utilities.reading.add')}</Text>
        </TouchableOpacity>
      )}

      <SheetDialog
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        titleId={SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={SHEET_TITLE_ID} style={styles.modalTitle}>
          {t('utilities.reading.title')}
        </Text>
        <View style={styles.chips}>
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, kind === k && styles.chipSelected]}
              onPress={() => pickKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextSelected]}>{t(`utilities.kinds.${k}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('utilities.consumption')}</Text>
        <TextInput
          style={styles.input}
          value={consumption}
          onChangeText={setConsumption}
          keyboardType="decimal-pad"
          placeholder="250"
          placeholderTextColor={theme.colors.textTertiary}
        />
        <View style={styles.chips}>
          {UNITS.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.chip, unit === u && styles.chipSelected]}
              onPress={() => setUnit(u)}
              accessibilityRole="radio"
              accessibilityState={{ selected: unit === u }}
            >
              <Text style={[styles.chipText, unit === u && styles.chipTextSelected]}>{UNIT_LABEL[u]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('utilities.reading.property')}</Text>
        <TextInput
          style={styles.input}
          value={property}
          onChangeText={setProperty}
          maxLength={60}
          placeholder={t('utilities.reading.propertyPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
        />
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setSheetVisible(false)}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={styles.saveText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
        {reading && (
          <TouchableOpacity style={styles.deleteRow} onPress={remove} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t('utilities.reading.remove')}</Text>
          </TouchableOpacity>
        )}
      </SheetDialog>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    ...theme.shadows.sm,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  summary: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  fieldLabel: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  chip: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  chipTextSelected: { color: theme.colors.textInverse },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  deleteRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  deleteText: { ...theme.textStyles.bodyMedium, color: theme.colors.danger },
});
