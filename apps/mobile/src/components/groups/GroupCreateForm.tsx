import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_CURRENCIES } from '@budget/shared-utils';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { buildCreateGroupDto, MAX_INITIAL_MEMBER_NAMES } from '@/features/groups/groupCreate';
import { MAX_GROUP_NAME_LENGTH, MAX_MEMBER_NAME_LENGTH } from '@/features/groups/groupSplit';
import { GroupButton } from './GroupButton';

/** Create a group: name, emoji, currency, my display name, optional placeholder members. */
export function GroupCreateForm() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const user = useAuthStore((s) => s.user);
  const create = useGroupStore((s) => s.create);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [currencyCode, setCurrencyCode] = useState<string>(user?.currencyCode || 'USD');
  const [myName, setMyName] = useState(user?.name ?? '');
  const [memberNames, setMemberNames] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);

  const setMemberName = (index: number, value: string) =>
    setMemberNames((prev) => prev.map((n, i) => (i === index ? value : n)));
  const removeMemberName = (index: number) =>
    setMemberNames((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));

  const handleCreate = async () => {
    const dto = buildCreateGroupDto({ name, emoji, currencyCode, myDisplayName: myName, memberNames });
    if (!dto) {
      showAlert(t('errors.error'), t('groups.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const group = await create(dto);
      router.replace(`/groups/${group.id}` as never);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('groups.nameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('groups.namePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          maxLength={MAX_GROUP_NAME_LENGTH}
          autoFocus
        />

        <Text style={styles.label}>{t('groups.emojiLabel')}</Text>
        <TextInput
          style={[styles.input, styles.emojiInput]}
          value={emoji}
          onChangeText={setEmoji}
          placeholder="🏠"
          placeholderTextColor={theme.colors.textTertiary}
          maxLength={8}
        />

        <Text style={styles.label}>{t('groups.currencyLabel')}</Text>
        <View style={styles.chipRow}>
          {SUPPORTED_CURRENCIES.map((c) => {
            const active = currencyCode === c.code;
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCurrencyCode(c.code)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.code}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('groups.currencyHint')}</Text>

        <Text style={styles.label}>{t('groups.myNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={myName}
          onChangeText={setMyName}
          maxLength={MAX_MEMBER_NAME_LENGTH}
        />

        <Text style={styles.label}>{t('groups.memberNamesLabel')}</Text>
        {memberNames.map((value, index) => (
          <View key={index} style={styles.memberRow}>
            <TextInput
              style={[styles.input, styles.memberInput]}
              value={value}
              onChangeText={(v) => setMemberName(index, v)}
              placeholder={t('groups.memberNamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={MAX_MEMBER_NAME_LENGTH}
            />
            {(memberNames.length > 1 || value.length > 0) && (
              <TouchableOpacity
                onPress={() => removeMemberName(index)}
                accessibilityLabel={t('common.remove')}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {memberNames.length < MAX_INITIAL_MEMBER_NAMES && (
          <TouchableOpacity style={styles.addRow} onPress={() => setMemberNames((p) => [...p, ''])}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.addText}>{t('groups.addMemberName')}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>{t('groups.membersHint')}</Text>

        <View style={styles.disclosure}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.disclosureText}>{t('groups.disclosure')}</Text>
        </View>

        <GroupButton
          label={t('groups.createGroup')}
          onPress={handleCreate}
          loading={submitting}
          disabled={name.trim().length === 0}
          style={styles.submit}
        />
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
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
  emojiInput: {
    width: 80,
    textAlign: 'center' as const,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
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
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  memberRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  memberInput: {
    flex: 1,
  },
  addRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  addText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  disclosure: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginTop: theme.spacing[5],
  },
  disclosureText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  submit: {
    marginTop: theme.spacing[6],
  },
});
