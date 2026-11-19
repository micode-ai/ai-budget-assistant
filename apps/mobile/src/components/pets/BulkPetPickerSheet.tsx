import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Pet, PetCostKind } from '@budget/shared-types';
import { PET_KINDS } from '@/features/pets/petDisplay';
import { useStyles, type Theme } from '@/theme';

interface Props {
  pets: Pet[];
  count: number;
  onConfirm: (petId: string, kind: PetCostKind) => void;
  onClose: () => void;
}

/**
 * The body of the bulk "Assign to pet" picker (ABA-831): which pet and which
 * kind of cost every selected expense is. Chrome-free like
 * `BulkVehiclePickerSheet` — the phone wraps it in its bottom sheet, the
 * desktop in its centred panel.
 */
export function BulkPetPickerSheet({ pets, count, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [petId, setPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [kind, setKind] = useState<PetCostKind>('food');

  const chip = (selected: boolean) => [styles.chip, selected && styles.chipSelected];
  const chipText = (selected: boolean) => [styles.chipText, selected && styles.chipTextSelected];

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{t('pets.bulkAssign')}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.note}>{t('pets.bulkAssignNote')}</Text>

      {pets.length > 1 && (
        <View style={styles.chips}>
          {pets.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={chip(petId === p.id)}
              onPress={() => setPetId(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: petId === p.id }}
            >
              <Text style={chipText(petId === p.id)}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.chips}>
        {PET_KINDS.map((k) => (
          <TouchableOpacity
            key={k}
            style={chip(kind === k)}
            onPress={() => setKind(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
          >
            <Text style={chipText(kind === k)}>{t(`pets.kind_${k}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.confirm, !petId && styles.confirmDisabled]}
        disabled={!petId}
        onPress={() => petId && onConfirm(petId, kind)}
        accessibilityRole="button"
      >
        <Text style={styles.confirmText}>{t('pets.bulkAssignConfirm', { count })}</Text>
      </TouchableOpacity>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary },
  cancel: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  note: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[3] },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2], marginBottom: theme.spacing[3] },
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
  confirm: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing[2],
  },
  confirmDisabled: { opacity: 0.6 },
  confirmText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
