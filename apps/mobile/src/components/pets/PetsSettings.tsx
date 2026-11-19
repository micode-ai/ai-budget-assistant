import React, { useState } from 'react';
import { router } from 'expo-router';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Pet, PetCostKind, PetSpecies } from '@budget/shared-types';
import { api } from '@/services/api';
import { showAlert } from '@/utils/alert';
import { toDateInputValue } from '@/utils/dateInput';
import { DatePicker } from '@/components/DatePicker';
import { SheetDialog } from '@/components/SheetDialog';
import { SettingsScreenScroll } from '@/components/settings/SettingsScreenScroll';
import { useAccountStore } from '@/stores/accountStore';
import { usePets, reloadPets, putPet, dropPet } from '@/features/pets/usePets';
import { useCategoryStore } from '@/stores/categoryStore';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { usePetEncryptionNote } from '@/features/pets/usePetEncryptionNote';
import {
  PET_KINDS,
  PET_SPECIES,
  careDateStatus,
  mapPetRules,
  parsePetDay,
  petAgeYears,
  petRulesChanged,
  petRulesPayload,
  togglePetRule,
  type PetRuleMap,
} from '@/features/pets/petDisplay';
import { getIntlLocale } from '@/i18n';
import { useTheme, useStyles, type Theme } from '@/theme';
import { PetEncryptionNote } from './PetDetailParts';

const SHEET_TITLE_ID = 'pet-sheet-title';
const NAME_MAX = 60;

type DateKey = 'birthday' | 'nextVaccinationDate' | 'nextParasiteTreatmentDate';
const DATE_FIELDS: { key: DateKey; labelKey: string }[] = [
  { key: 'birthday', labelKey: 'pets.birthday' },
  { key: 'nextVaccinationDate', labelKey: 'pets.nextVaccination' },
  { key: 'nextParasiteTreatmentDate', labelKey: 'pets.nextParasite' },
];

/**
 * Settings → Pets (ABA-831): the account's pets with their care dates, and a
 * link to each pet's costs. The form also holds the pet's categories
 * (ABA-833): expense categories, each with a kind, whose expenses count for
 * the pet automatically (the server's category rule), like a vehicle's. Single
 * expenses are set on the expense screen's Pet section or in bulk from the
 * transactions list (multi-select → Assign to pet).
 *
 * Every write lands in the shared pet cache straight from the server's answer
 * (`putPet`/`dropPet`), so a mounted transactions tab shows "Assign to pet" at
 * once; a background refetch only reconciles.
 *
 * Online only (no SQLite mirror): a failed load shows a retry, never "no
 * pets". Viewers see the cards with no write affordance. Lives under `src/` so
 * the desktop settings shell can host it as a pane.
 */
export function PetsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const accountName = useAccountStore((s) => s.currentAccount()?.name ?? '');
  const { accountId, pets, isLoaded, isLoading, loadFailed, reload } = usePets({ refresh: true });
  const encryptionNote = usePetEncryptionNote(accountId);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [editing, setEditing] = useState<Pet | null>(null);
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<PetSpecies>('dog');
  const [dates, setDates] = useState<Record<DateKey, string | null>>({
    birthday: null,
    nextVaccinationDate: null,
    nextParasiteTreatmentDate: null,
  });
  const [openPicker, setOpenPicker] = useState<DateKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Category rules (ABA-833): the app's category id -> kind.
  const allCategories = useCategoryStore((st) => st.categories);
  const expenseCategories = allCategories
    .filter((c) => c.type === 'expense' && !(c as { isDeleted?: boolean }).isDeleted)
    .map((c) => ({ id: c.id, label: getCategoryDisplayName(c, t) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const [rulesState, setRulesState] = useState<'loading' | 'ready' | 'failed'>('ready');
  const [initialRules, setInitialRules] = useState<PetRuleMap>({});
  const [rules, setRules] = useState<PetRuleMap>({});
  const [ruleKind, setRuleKind] = useState<PetCostKind>('food');

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSpecies('dog');
    setDates({ birthday: null, nextVaccinationDate: null, nextParasiteTreatmentDate: null });
    setOpenPicker(null);
    setInitialRules({});
    setRules({});
    setRuleKind('food');
    setRulesState('ready');
    setSheetVisible(true);
  };
  const openEdit = (p: Pet) => {
    setEditing(p);
    setName(p.name);
    setSpecies(p.species);
    // The server sends `YYYY-MM-DD` or a full ISO stamp of a `@db.Date`; keep only the day.
    const day = (v?: string | null) => (v ? v.slice(0, 10) : null);
    setDates({
      birthday: day(p.birthday),
      nextVaccinationDate: day(p.nextVaccinationDate),
      nextParasiteTreatmentDate: day(p.nextParasiteTreatmentDate),
    });
    setOpenPicker(null);
    setInitialRules({});
    setRules({});
    setRuleKind('food');
    setSheetVisible(true);
    setRulesState('loading');
    api
      .getPetCategoryRules(p.id)
      .then(({ rules: serverRules }) => {
        const mapped = mapPetRules(
          serverRules,
          expenseCategories.map((c) => c.id),
        );
        setInitialRules(mapped);
        setRules(mapped);
        setRulesState('ready');
      })
      .catch((err) => {
        console.warn('[pets] category rules unavailable', err);
        setRulesState('failed');
      });
  };
  const close = () => {
    setSheetVisible(false);
    setEditing(null);
    setOpenPicker(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || !accountId) return;
    setIsSaving(true);
    // Rules are sent only when the form holds the server's rules and they changed.
    const rulePatch =
      rulesState === 'ready' && petRulesChanged(rules, initialRules) ? { categoryRules: petRulesPayload(rules) } : {};
    try {
      const saved = editing
        ? await api.updatePet(editing.id, { name: trimmed, species, ...dates, ...rulePatch })
        : await api.createPet({ name: trimmed, species, ...dates, ...rulePatch });
      const { rulesApplied, ...pet } = saved;
      putPet(accountId, pet);
      close();
      if (rulesApplied && (rulesApplied.attributed > 0 || rulesApplied.released > 0)) {
        showAlert(t('pets.rulesSavedTitle'), t('pets.rulesSaved', { ...rulesApplied }));
      }
      // The write is already in the cache; the refetch only reconciles.
      reloadPets(accountId).catch((err) => console.warn('[pets] refetch after save failed', err));
    } catch (e) {
      console.warn('[pets] save failed:', e instanceof Error ? e.message : String(e));
      showAlert(t('common.error'), t('pets.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = (p: Pet) => {
    showAlert(t('pets.deleteTitle', { name: p.name }), t('pets.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePet(p.id);
            if (accountId) {
              dropPet(accountId, p.id);
              reloadPets(accountId).catch((err) => console.warn('[pets] refetch after delete failed', err));
            }
            close();
          } catch (e) {
            console.warn('[pets] delete failed:', e instanceof Error ? e.message : String(e));
            showAlert(t('common.error'), t('pets.saveFailed'));
          }
        },
      },
    ]);
  };

  let body: React.ReactNode;
  if (loadFailed) {
    body = (
      <View style={[styles.card, styles.stateBox]}>
        <Text style={styles.empty}>{t('pets.loadFailed')}</Text>
        <TouchableOpacity onPress={() => void reload()} accessibilityRole="button">
          <Text style={styles.link}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!isLoaded && isLoading) {
    body = (
      <View style={[styles.card, styles.stateBox]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  } else if (pets.length === 0) {
    body = (
      <View style={styles.card}>
        <Text style={styles.empty}>{t('pets.empty')}</Text>
      </View>
    );
  } else {
    body = pets.map((p) => <PetCard key={p.id} pet={p} canEdit={canEdit} onEdit={() => openEdit(p)} />);
  }

  return (
    <>
      <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('pets.title')}</Text>
          {canEdit && !loadFailed && (
            <TouchableOpacity onPress={openCreate} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('pets.add')}>
              <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {!!accountName && <Text style={styles.accountNote}>{t('pets.accountNote', { account: accountName })}</Text>}
        {encryptionNote !== 'none' && (
          <View style={styles.noteWrap}>
            <PetEncryptionNote note={encryptionNote} />
          </View>
        )}
        {body}
        <Text style={styles.hint}>{t('pets.hint')}</Text>
      </SettingsScreenScroll>

      <SheetDialog
        visible={sheetVisible}
        onClose={close}
        titleId={SHEET_TITLE_ID}
        keyboardAvoiding
        padBottom={theme.spacing[4]}
        insetFloor={theme.spacing[6]}
      >
        <Text nativeID={SHEET_TITLE_ID} style={styles.modalTitle}>
          {editing ? t('pets.edit') : t('pets.add')}
        </Text>
        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('pets.namePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoFocus={!editing}
            maxLength={NAME_MAX}
          />
          <Text style={styles.fieldLabel}>{t('pets.species')}</Text>
          <View style={styles.chips}>
            {PET_SPECIES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, species === s && styles.chipSelected]}
                onPress={() => setSpecies(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: species === s }}
              >
                <Text style={[styles.chipText, species === s && styles.chipTextSelected]}>{t(`pets.species_${s}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {DATE_FIELDS.map((f) => (
            <PetDateField
              key={f.key}
              label={t(f.labelKey)}
              value={dates[f.key]}
              open={openPicker === f.key}
              onOpen={() => setOpenPicker(f.key)}
              onClose={() => setOpenPicker(null)}
              onChange={(v) => setDates((prev) => ({ ...prev, [f.key]: v }))}
              allowFuture={f.key !== 'birthday'}
            />
          ))}
          <Text style={styles.reminderHint}>{t('pets.reminderHint')}</Text>
          <View style={styles.rulesBlock}>
            <Text style={styles.fieldLabel}>{t('pets.rulesTitle')}</Text>
            <Text style={styles.rulesHint}>{t('pets.rulesHint')}</Text>
            {rulesState === 'loading' && <ActivityIndicator color={theme.colors.primary} />}
            {rulesState === 'failed' && <Text style={styles.rulesHint}>{t('pets.rulesFailed')}</Text>}
            {rulesState === 'ready' && (
              <>
                <View style={styles.chips}>
                  {PET_KINDS.map((k) => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.chip, ruleKind === k && styles.chipSelected]}
                      onPress={() => setRuleKind(k)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: ruleKind === k }}
                    >
                      <Text style={[styles.chipText, ruleKind === k && styles.chipTextSelected]}>{t(`pets.kind_${k}`)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ScrollView style={styles.rulesScroll} contentContainerStyle={styles.chipsTight} nestedScrollEnabled>
                  {expenseCategories.map((c) => {
                    const k = rules[c.id];
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, k ? styles.chipSelected : null]}
                        onPress={() => setRules((prev) => togglePetRule(prev, c.id, ruleKind))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!k }}
                      >
                        <Text style={[styles.chipText, k ? styles.chipTextSelected : null]}>
                          {k ? `${c.label} · ${t(`pets.kind_${k}`)}` : c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </View>
        </ScrollView>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelButton} onPress={close}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (isSaving || !name.trim()) && styles.saveButtonDisabled]}
            onPress={save}
            disabled={isSaving || !name.trim()}
          >
            <Text style={styles.saveText}>{editing ? t('common.save') : t('pets.add')}</Text>
          </TouchableOpacity>
        </View>
        {editing && (
          <TouchableOpacity style={styles.deleteRow} onPress={() => remove(editing)} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.deleteText}>{t('pets.delete')}</Text>
          </TouchableOpacity>
        )}
      </SheetDialog>
    </>
  );
}

/**
 * One optional date of the form: a row that opens the shared `DatePicker` and
 * a clear button. The value is a `YYYY-MM-DD` string, converted only through
 * `toDateInputValue`/`parsePetDay` (local calendar day, never UTC).
 */
function PetDateField({
  label,
  value,
  open,
  onOpen,
  onClose,
  onChange,
  allowFuture,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (v: string | null) => void;
  allowFuture: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const fmt = new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={styles.dateField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.dateRow}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={open ? onClose : onOpen}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
          <Text style={value ? styles.dateText : styles.datePlaceholder}>
            {value ? fmt.format(parsePetDay(value)) : t('pets.notSet')}
          </Text>
        </TouchableOpacity>
        {!!value && (
          <TouchableOpacity
            onPress={() => {
              onChange(null);
              onClose();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('pets.clearDate')}
          >
            <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>
      {open && (
        <DatePicker
          value={value ? parsePetDay(value) : new Date()}
          maximumDate={allowFuture ? undefined : new Date()}
          onChange={(picked) => {
            // `=== 'ios'` (not `!== 'android'`) so web closes on pick/dismiss too.
            if (Platform.OS !== 'ios') onClose();
            if (picked) onChange(toDateInputValue(picked));
          }}
        />
      )}
      {open && Platform.OS === 'ios' && (
        <TouchableOpacity style={styles.doneButton} onPress={onClose} accessibilityRole="button">
          <Text style={styles.link}>{t('common.done')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function PetCard({ pet, canEdit, onEdit }: { pet: Pet; canEdit: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const today = new Date();
  const fmt = new Intl.DateTimeFormat(getIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const age = petAgeYears(pet.birthday, today);
  const sub = [t(`pets.species_${pet.species}`), age !== null ? t('pets.age', { age }) : null].filter(Boolean).join(' · ');

  const care = (
    [
      { key: 'vac', label: t('pets.nextVaccination'), value: pet.nextVaccinationDate },
      { key: 'para', label: t('pets.nextParasite'), value: pet.nextParasiteTreatmentDate },
    ] as const
  ).filter((c) => !!c.value);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="paw-outline" size={20} color={theme.colors.primary} />
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {pet.name}
          </Text>
          <Text style={styles.cardSub}>{sub}</Text>
        </View>
        {canEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('pets.edit')}>
            <Ionicons name="create-outline" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {care.map((c) => {
        const status = careDateStatus(c.value!, today);
        return (
          <View key={c.key} style={styles.careRow}>
            <Text style={styles.careLabel}>{c.label}</Text>
            <Text style={[styles.careValue, status === 'overdue' && styles.overdue, status === 'soon' && styles.soon]}>
              {fmt.format(parsePetDay(c.value!))}
              {status === 'overdue' ? ` · ${t('pets.overdue')}` : ''}
            </Text>
          </View>
        );
      })}

      <TouchableOpacity onPress={() => router.push(`/pets/${pet.id}` as any)} style={styles.linkRow} accessibilityRole="link">
        <Text style={styles.link}>{t('pets.openDetails')}</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardTitle: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  cardSub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  careRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  careLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, flexShrink: 1 },
  careValue: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  overdue: { color: theme.colors.danger },
  soon: { color: theme.colors.warning },
  linkRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: theme.spacing[2] },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[2],
  },
  stateBox: { alignItems: 'center' as const, gap: theme.spacing[2] },
  link: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  accountNote: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  noteWrap: { marginBottom: theme.spacing[3] },
  hint: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  formScroll: { maxHeight: 460 },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
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
  dateField: { marginBottom: theme.spacing[3] },
  dateRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  dateButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  dateText: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  datePlaceholder: { ...theme.textStyles.body, color: theme.colors.textTertiary },
  doneButton: { alignSelf: 'flex-end' as const, paddingVertical: theme.spacing[2] },
  reminderHint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[4] },
  rulesBlock: { marginBottom: theme.spacing[4] },
  rulesHint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing[2] },
  rulesScroll: { maxHeight: 160 },
  chipsTight: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
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
