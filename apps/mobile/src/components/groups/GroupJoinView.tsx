import React, { useState } from 'react';
import { Text, TextInput } from 'react-native';
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
import { GroupButton } from './GroupButton';

/**
 * Join a group from a pasted `/g/<token>` link (or a `?t=` link the router passes in as
 * `initialLink`). The app cannot list the group's unclaimed names before joining, so a person joins
 * under their own name; taking over a name a friend already claimed in a browser is only possible
 * with the link code from "Open in the app" on the guest page.
 */
export function GroupJoinView({
  initialLink,
  onJoined,
  onAlreadyMember,
}: {
  initialLink?: string;
  /** Desktop dialog hosting (ABA-646): replaces `router.replace('/groups/<id>')`. Default is the router call. */
  onJoined?: (groupId: string) => void;
  /** Desktop dialog hosting: replaces `router.replace('/groups')` after the "already a member" notice. */
  onAlreadyMember?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const user = useAuthStore((s) => s.user);
  const join = useGroupStore((s) => s.join);

  const [link, setLink] = useState(initialLink ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const token = extractGroupToken(link);
  const showInvalid = link.trim().length > 0 && !token;

  const submit = async () => {
    if (!token || !name.trim()) return;
    setSubmitting(true);
    try {
      const detail = await join({ guestToken: token, displayName: name.trim() });
      if (onJoined) onJoined(detail.id);
      else router.replace(`/groups/${detail.id}` as never);
    } catch (e) {
      const kind = joinErrorKind(e);
      if (kind === 'alreadyMember') {
        showAlert(t('groups.joinTitle'), t('groups.alreadyMember'));
        if (onAlreadyMember) onAlreadyMember();
        else router.replace('/groups' as never);
      } else if (kind === 'other') {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      } else {
        showAlert(t('groups.joinTitle'), t(`groups.join_${kind}`));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen style={styles.scroll} contentContainerStyle={styles.content}>
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

        <Text style={styles.label}>{t('groups.joinNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          maxLength={MAX_MEMBER_NAME_LENGTH}
        />
        <Text style={styles.hint}>{t('groups.joinNameHint')}</Text>

        <GroupButton
          label={t('groups.joinButton')}
          onPress={submit}
          loading={submitting}
          disabled={!token || name.trim().length === 0}
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
  submit: {
    marginTop: theme.spacing[6],
  },
});
