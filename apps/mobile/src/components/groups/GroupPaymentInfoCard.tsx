import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { MAX_PAYMENT_HANDLE_LENGTH } from '@/features/groups/groupSplit';
import { SETTLE_METHODS } from '@/features/groups/groupPay';
import type { GroupMember, SettleMethod } from '@budget/shared-types';
import { GroupButton } from './GroupButton';

/**
 * My payment method and handle for THIS group. Set by the member themself only (never copied from
 * profile payment methods) and shown to the group only on a payment that is owed to me.
 */
export function GroupPaymentInfoCard({
  groupId,
  member,
  editable,
}: {
  groupId: string;
  member: GroupMember;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const updateMember = useGroupStore((s) => s.updateMember);
  const [method, setMethod] = useState<SettleMethod | null>(member.paymentMethod);
  const [handle, setHandle] = useState(member.paymentHandle ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (nextMethod: SettleMethod | null, nextHandle: string) => {
    setSaving(true);
    try {
      await updateMember(groupId, member.id, {
        paymentMethod: nextMethod,
        paymentHandle: nextHandle.trim() ? nextHandle.trim() : null,
      });
      showAlert(t('groups.paymentSaved'));
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setMethod(null);
    setHandle('');
    void save(null, '');
  };

  const dirty = method !== member.paymentMethod || handle.trim() !== (member.paymentHandle ?? '');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('groups.paymentTitle')}</Text>
      <Text style={styles.hint}>{t('groups.paymentHint')}</Text>
      <View style={styles.chipRow}>
        {SETTLE_METHODS.map((m) => {
          const active = method === m;
          return (
            <TouchableOpacity
              key={m}
              disabled={!editable}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setMethod(active ? null : m)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`groups.method_${m}`)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.label}>{t('groups.handleLabel')}</Text>
      <TextInput
        style={styles.input}
        value={handle}
        onChangeText={setHandle}
        editable={editable}
        placeholder={t('groups.handlePlaceholder')}
        placeholderTextColor={theme.colors.textTertiary}
        maxLength={MAX_PAYMENT_HANDLE_LENGTH}
        autoCapitalize="none"
      />
      {editable && (
        <View style={styles.buttons}>
          <GroupButton
            label={t('common.save')}
            onPress={() => void save(method, handle)}
            loading={saving}
            disabled={!dirty}
            style={styles.flex}
          />
          {(member.paymentMethod || member.paymentHandle) && (
            <GroupButton
              label={t('groups.clearPayment')}
              onPress={clear}
              variant="secondary"
              disabled={saving}
              style={styles.flex}
            />
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[3],
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  buttons: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  flex: {
    flex: 1,
  },
});
