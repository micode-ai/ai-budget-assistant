import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AccountGroupDto, UpsertAccountGroupDto } from '@budget/shared-types';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface Props {
  visible: boolean;
  /** null → create */
  group: AccountGroupDto | null;
  onClose: () => void;
  onSave: (dto: UpsertAccountGroupDto) => Promise<unknown>;
  /** Desktop: a centred dialog instead of a bottom sheet. */
  centered?: boolean;
}

export function GroupEditorSheet({ visible, group, onClose, onSave, centered }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const accounts = useAccountStore((s) => s.accounts);
  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(group?.name ?? '');
      setIds(group?.accountIds ?? []);
    }
  }, [visible, group]);

  const valid = name.trim().length >= 1 && name.trim().length <= 100 && ids.length >= 1;

  const save = async () => {
    setBusy(true);
    try {
      await onSave({ name: name.trim(), accountIds: ids });
      onClose();
    } catch (err) {
      console.warn('Saving the group failed', err);
      const code = err as { code?: string; message?: string } | null;
      const limit = code?.code === 'GROUP_LIMIT' || code?.message === 'GROUP_LIMIT';
      showAlert(
        t('errors.error'),
        limit ? t('allAccounts.groups.limit', { max: 20 }) : t('allAccounts.groups.saveFailed')
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, centered && styles.overlayCentered]} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            centered ? styles.sheetCentered : { paddingBottom: 24 + insets.bottom },
          ]}
          onPress={() => undefined}
        >
          <Text style={styles.title}>
            {group ? t('allAccounts.groups.edit') : t('allAccounts.groups.new')}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={100}
            placeholder={t('allAccounts.groups.name')}
            placeholderTextColor={theme.colors.textTertiary}
          />
          <Text style={styles.sub}>{t('allAccounts.groups.pickAccounts')}</Text>
          <ScrollView style={styles.list}>
            {accounts.map((a) => {
              const on = ids.includes(a.id);
              return (
                <TouchableOpacity
                  key={a.id}
                  style={styles.pick}
                  onPress={() => setIds((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.pickText} numberOfLines={1}>
                    {a.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void save()}
              disabled={!valid || busy}
              style={[styles.btn, styles.primary, (!valid || busy) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' as const },
  overlayCentered: { justifyContent: 'center' as const, alignItems: 'center' as const },
  sheetCentered: {
    width: 480,
    maxWidth: '92%' as const,
    borderRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: theme.borderRadius.xl,
    borderBottomRightRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing[4],
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
    maxHeight: '85%' as const,
  },
  title: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    color: theme.colors.textPrimary,
  },
  sub: { ...theme.textStyles.caption, color: theme.colors.textTertiary },
  list: { maxHeight: 260 },
  pick: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  pickText: { flex: 1, ...theme.textStyles.body, color: theme.colors.textPrimary },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  btn: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  primary: { backgroundColor: theme.colors.primary },
  primaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
  cancel: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
});
