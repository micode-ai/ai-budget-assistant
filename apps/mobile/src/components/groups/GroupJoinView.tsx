import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useAuthStore } from '@/stores/authStore';
import { useGroupStore } from '@/stores/groupStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { extractGroupToken, joinErrorKind } from '@/features/groups/groupLink';
import { MAX_MEMBER_NAME_LENGTH } from '@/features/groups/groupSplit';
import {
  buildJoinDto,
  canSubmitJoin,
  effectiveSelection,
  findGroupIdForPreview,
  joinViewKind,
  JOIN_NEW_NAME,
  type JoinSelection,
} from '@/features/groups/groupJoin';
import { useGroupJoinPreview } from '@/features/groups/useGroupJoinPreview';
import { GroupButton } from './GroupButton';
import { GroupOfflineBanner } from './GroupOfflineBanner';

/**
 * Join a group from a pasted `/g/<token>` link (or a `?t=` link the router passes in as
 * `initialLink`). Once the link parses, the group's preview is fetched so the person can take over
 * a name nobody has claimed yet, or join under a new one (ABA-647). Hosted on the phone by
 * `app/groups/join.tsx` and on desktop by `GroupJoinDialog`.
 */
export function GroupJoinView({
  initialLink,
  onJoined,
  onAlreadyMember,
}: {
  initialLink?: string;
  /** Desktop dialog hosting (ABA-646): replaces `router.replace('/groups/<id>')`. Default is the router call. */
  onJoined?: (groupId: string) => void;
  /** Desktop dialog hosting: replaces `router.replace('/groups')` when there is no group to open. */
  onAlreadyMember?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const user = useAuthStore((s) => s.user);
  const join = useGroupStore((s) => s.join);
  const loadGroups = useGroupStore((s) => s.loadGroups);

  const [link, setLink] = useState(initialLink ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [selection, setSelection] = useState<JoinSelection>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const token = extractGroupToken(link);
  const showInvalid = link.trim().length > 0 && !token;
  const { state, reload } = useGroupJoinPreview(token);
  const kind = joinViewKind(state);
  const preview = state.status === 'ready' ? state.preview : null;

  // A different link means a different list: forget the previous pick and notice.
  useEffect(() => {
    setSelection(null);
    setNotice(null);
  }, [token]);

  const openExisting = async () => {
    if (!preview) return;
    // Members get the group id in the preview; the list lookup is only a fallback.
    if (!preview.groupId) await loadGroups().catch(() => undefined);
    const id = findGroupIdForPreview(useGroupStore.getState().groups, preview);
    if (id) {
      if (onJoined) onJoined(id);
      else router.replace(`/groups/${id}` as never);
    } else if (onAlreadyMember) onAlreadyMember();
    else router.replace('/groups' as never);
  };

  const submit = async () => {
    if (!token || !preview) return;
    const dto = buildJoinDto(token, selection, name, preview);
    if (!dto) return;
    setSubmitting(true);
    try {
      const detail = await join(dto);
      if (onJoined) onJoined(detail.id);
      else router.replace(`/groups/${detail.id}` as never);
    } catch (e) {
      const errKind = joinErrorKind(e);
      if (errKind === 'alreadyMember') {
        showAlert(t('groups.joinTitle'), t('groups.alreadyMember'));
        reload();
      } else if (errKind === 'nameTaken' && dto.memberId) {
        // Someone took the picked name a moment ago: refresh the list and say so.
        setSelection(null);
        setNotice(t('groups.joinNameJustTaken'));
        reload();
      } else if (errKind === 'other') {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      } else {
        showAlert(t('groups.joinTitle'), t(`groups.join_${errKind}`));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const sel = preview ? effectiveSelection(selection, preview) : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen style={styles.scroll} contentContainerStyle={styles.content}>
        <GroupOfflineBanner />
        <Text style={styles.label}>{t('groups.joinLinkLabel')}</Text>
        <TextInput
          style={styles.input}
          value={link}
          onChangeText={setLink}
          placeholder={t('groups.joinLinkPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {showInvalid && <Text style={styles.error}>{t('groups.joinLinkInvalid')}</Text>}

        {kind === 'loading' && <ActivityIndicator style={styles.loader} color={theme.colors.primary} />}
        {kind === 'notFound' && <Text style={styles.error}>{t('groups.join_notFound')}</Text>}
        {kind === 'error' && (
          <View>
            <Text style={styles.error}>{t('groups.joinPreviewFailed')}</Text>
            <GroupButton label={t('common.retry')} onPress={reload} variant="secondary" style={styles.submit} />
          </View>
        )}

        {preview && (
          <Text style={styles.groupTitle}>
            {preview.emoji ? `${preview.emoji} ` : ''}
            {preview.groupName}
          </Text>
        )}

        {kind === 'archived' && <Text style={styles.error}>{t('groups.joinArchivedReadOnly')}</Text>}

        {kind === 'alreadyMember' && (
          <View>
            <Text style={styles.hint}>{t('groups.alreadyMember')}</Text>
            <GroupButton label={t('groups.joinOpenGroup')} onPress={openExisting} style={styles.submit} />
          </View>
        )}

        {kind === 'choose' && preview && (
          <View>
            {notice && <Text style={styles.error}>{notice}</Text>}
            {preview.unclaimed.length > 0 && (
              <>
                <Text style={styles.label}>{t('groups.joinPickName')}</Text>
                {preview.unclaimed.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.option, sel === m.id && styles.optionSelected]}
                    onPress={() => setSelection(m.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: sel === m.id }}
                  >
                    <Text style={styles.optionText}>{m.displayName}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.option, sel === JOIN_NEW_NAME && styles.optionSelected]}
                  onPress={() => setSelection(JOIN_NEW_NAME)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel === JOIN_NEW_NAME }}
                >
                  <Text style={styles.optionText}>{t('groups.joinNotOnList')}</Text>
                </TouchableOpacity>
              </>
            )}

            {sel === JOIN_NEW_NAME && (
              <>
                <Text style={styles.label}>{t('groups.joinNameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={MAX_MEMBER_NAME_LENGTH}
                />
              </>
            )}

            <GroupButton
              label={t('groups.joinButton')}
              onPress={submit}
              loading={submitting}
              write
              disabled={!canSubmitJoin(selection, name, preview)}
              style={styles.submit}
            />
          </View>
        )}
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
  error: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[2],
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  loader: {
    marginTop: theme.spacing[6],
  },
  groupTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[5],
  },
  option: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing[2],
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  submit: {
    marginTop: theme.spacing[6],
  },
});
