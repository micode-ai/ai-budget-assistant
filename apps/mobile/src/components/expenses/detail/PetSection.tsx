import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Expense, PetCostKind, PetCostLink } from '@budget/shared-types';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { SheetDialog } from '@/components/SheetDialog';
import { usePets } from '@/features/pets/usePets';
import { PET_KINDS, petCostSummary } from '@/features/pets/petDisplay';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  expense: Expense;
  canEdit: boolean;
}

const SHEET_TITLE_ID = 'pet-cost-sheet-title';

/**
 * The expense screen's Pet section (ABA-833): which pet this expense is for and
 * the kind of cost, or none. Mirrors the vehicles' Car section (FuelSection),
 * and is hosted by both the phone screen (`app/expense/[id].tsx`) and the
 * desktop dialog (`ExpenseDialog`).
 *
 * Drawn only when the account has a pet (or this expense already carries a pet
 * cost). A choice made here is a person's decision: the server writes it with
 * `source: null`, so a category rule never overrides it, and "Not a pet cost"
 * on an expense a rule claims leaves a tombstone rather than letting the rule
 * put it back. Online only, like the rest of pets; the server resolves the
 * device id or the PK.
 */
export function PetSection({ expense, canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { pets } = usePets();
  const expenseId = expense.serverId ?? expense.id;

  const [cost, setCost] = useState<PetCostLink | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [petId, setPetId] = useState<string | null>(null);
  const [kind, setKind] = useState<PetCostKind>('food');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCost(null);
    api
      .getExpensePetCost(expenseId)
      .then((r) => {
        if (!cancelled) setCost(r.cost ?? null);
      })
      .catch((err) => {
        // Offline, or an expense the server has not seen yet: no pet cost to show.
        console.warn('Pet cost unavailable', err);
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (pets.length === 0 && !cost) return null;
  if (!cost && !canEdit) return null;

  const pet = cost ? pets.find((p) => p.id === cost.petId) : undefined;

  const open = () => {
    setPetId(cost?.petId ?? pets[0]?.id ?? null);
    setKind(cost?.kind ?? 'food');
    setSheetVisible(true);
  };

  const save = async () => {
    if (!petId || isSaving) return;
    setIsSaving(true);
    try {
      await api.setPetCost(petId, expenseId, kind);
      setCost({ petId, kind, source: null });
      setSheetVisible(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      console.warn('[pets] cost save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), status === 404 ? t('pets.notSyncedYet') : t('pets.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    setIsSaving(true);
    try {
      await api.removePetCost(expenseId);
      setCost(null);
      setSheetVisible(false);
    } catch (e) {
      console.warn('[pets] cost remove failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('pets.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const summary = cost ? petCostSummary(pet?.name, t(`pets.kind_${cost.kind}`)) : null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="paw-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.title}>{t('pets.expenseSection')}</Text>
      </View>
      {summary ? (
        <TouchableOpacity
          activeOpacity={canEdit ? 0.7 : 1}
          onPress={canEdit ? open : undefined}
          accessibilityRole={canEdit ? 'button' : undefined}
        >
          <Text style={styles.summary}>{summary}</Text>
          {cost?.source === 'category' && <Text style={styles.sourceHint}>{t('pets.byCategoryRule')}</Text>}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={open} accessibilityRole="button">
          <Text style={styles.link}>{t('pets.markAsPetCost')}</Text>
        </TouchableOpacity>
      )}

      <SheetDialog
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        titleId={SHEET_TITLE_ID}
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={SHEET_TITLE_ID} style={styles.modalTitle}>
          {t('pets.expenseSection')}
        </Text>
        {pets.length > 1 && (
          <>
            <Text style={styles.fieldLabel}>{t('pets.whichPet')}</Text>
            <View style={styles.chips}>
              {pets.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, petId === p.id && styles.chipSelected]}
                  onPress={() => setPetId(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: petId === p.id }}
                >
                  <Text style={[styles.chipText, petId === p.id && styles.chipTextSelected]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
        <Text style={styles.fieldLabel}>{t('pets.kindLabel')}</Text>
        <View style={styles.chips}>
          {PET_KINDS.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, kind === k && styles.chipSelected]}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextSelected]}>{t(`pets.kind_${k}`)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setSheetVisible(false)}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (!petId || isSaving) && styles.saveButtonDisabled]}
            onPress={save}
            disabled={!petId || isSaving}
          >
            <Text style={styles.saveText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
        {cost && (
          <TouchableOpacity style={styles.deleteRow} onPress={remove} disabled={isSaving} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t('pets.notPetCost')}</Text>
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
  sourceHint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: 2 },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  fieldLabel: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
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
