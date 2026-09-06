import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { secureStorage } from '@/services/secureStorage';
import {
  PENDING_EMAIL_CHANGE_KEY as PENDING_KEY,
  resolvePendingEmailChange,
} from '@/features/settings/pendingEmailChange';

export interface ChangeEmailViewProps {
  /**
   * The one thing the route did that a dialog cannot: `router.back()` from the
   * success alert. Fired ONLY after a confirmed change, so it is a completion
   * signal and nothing else — not a cancel, not a dismiss. A dialog closes
   * itself with it; the route pops.
   */
  onDone: () => void;
}

/**
 * The entire body of `app/settings/change-email.tsx`, moved here unchanged so
 * that a desktop dialog and the route share one definition — nothing under
 * `src/` may import from `app/`. Following `SetBalanceView`: the only
 * substitution is this screen's single `router` call, which became the callback
 * above.
 *
 * ## The pending record, and why closing this is safe
 *
 * A change is two steps with a real server round trip between them: step 1
 * posts the new address and the current password and the API mails a 6-digit
 * code; step 2 submits the code. Between them there is state the user cannot
 * reconstruct — which address the code went to — so the moment the API accepts
 * the request, `handleSendCode` writes `{ newEmail, expiresAt }` to
 * `secureStorage` under {@link PENDING_KEY} with a 30-minute life, BEFORE it
 * flips to step 2. The mount effect reads it back and lands on step 2 when it
 * is still live, discarding it when it has expired or cannot be parsed.
 *
 * Because that write happens on send and never on unmount, this component
 * losing its mount is not an event the flow can notice: closing a dialog,
 * navigating back out of the route, backgrounding the app and killing the
 * process are all the same thing to it. The record is cleared in exactly three
 * places, all of them deliberate — expired or corrupt at mount, a confirmed
 * change, and `handleResend`, which is "start over" and by design throws the
 * old request away.
 *
 * **So do not clear {@link PENDING_KEY} from a close, a dismiss or an unmount
 * handler.** That is the one change that would strand a user who has a code in
 * their inbox and no longer has anywhere to type it.
 */
export function ChangeEmailView({ onDone }: ChangeEmailViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { updateUser, setTokens } = useAuthStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    secureStorage.getItem(PENDING_KEY).then((raw: string | null) => {
      // Same three answers this effect always gave, hoisted into a pure
      // function so the rule that decides whether an in-flight change is
      // resumed or thrown away is checkable in CI — nothing here renders a
      // component in a test.
      const outcome = resolvePendingEmailChange(raw, new Date());
      if (outcome.status === 'resume') {
        setPendingEmail(outcome.newEmail);
        setStep(2);
      } else if (outcome.status === 'discard') {
        secureStorage.removeItem(PENDING_KEY);
      }
      setInitializing(false);
    });
  }, []);

  const handleSendCode = async () => {
    if (!newEmail.trim() || !currentPassword) {
      showAlert(t('common.error'), t('validation.requiredFields'));
      return;
    }
    setLoading(true);
    try {
      await api.changeEmailRequest({ newEmail: newEmail.trim(), currentPassword });
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await secureStorage.setItem(PENDING_KEY, JSON.stringify({ newEmail: newEmail.trim(), expiresAt }));
      setPendingEmail(newEmail.trim());
      setStep(2);
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!code.trim()) {
      showAlert(t('common.error'), t('validation.requiredFields'));
      return;
    }
    setLoading(true);
    try {
      const result = await api.changeEmailConfirm({ code: code.trim() });
      updateUser({ email: pendingEmail });
      setTokens(result.accessToken, result.refreshToken);
      await secureStorage.removeItem(PENDING_KEY);
      showAlert(
        t('settings.changeEmail.success'),
        t('settings.changeEmail.successMessage'),
        [{ text: t('common.ok'), onPress: onDone }],
      );
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    await secureStorage.removeItem(PENDING_KEY);
    setPendingEmail('');
    setCode('');
    setStep(1);
  };

  if (initializing) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAwareScreen style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconRow}>
          <View style={styles.iconBg}>
            <Ionicons name="mail-outline" size={32} color={theme.colors.primary} />
          </View>
        </View>

        {step === 1 ? (
          <>
            <Text style={styles.title}>{t('settings.changeEmail.step1Title')}</Text>

            <Text style={styles.label}>{t('settings.changeEmail.newEmailLabel')}</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder={t('settings.changeEmail.newEmailPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>{t('settings.changeEmail.passwordLabel')}</Text>
            <TextInput
              style={styles.input}
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('settings.changeEmail.passwordPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('settings.changeEmail.sendCode')}</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('settings.changeEmail.step2Title')}</Text>
            <Text style={styles.subtitle}>
              {t('settings.changeEmail.step2Subtitle', { email: pendingEmail })}
            </Text>

            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={setCode}
              placeholder={t('settings.changeEmail.codePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('settings.changeEmail.confirm')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendRow} onPress={handleResend} disabled={loading}>
              <Text style={styles.resendText}>{t('settings.changeEmail.resend')}</Text>
            </TouchableOpacity>
          </>
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
    paddingBottom: theme.spacing[10],
  },
  iconRow: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[6],
    marginTop: theme.spacing[4],
  },
  iconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  title: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[6],
  },
  subtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[6],
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  codeInput: {
    fontSize: 28,
    textAlign: 'center' as const,
    letterSpacing: 8,
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
    fontSize: 16,
  },
  resendRow: {
    alignItems: 'center' as const,
    marginTop: theme.spacing[5],
    padding: theme.spacing[3],
  },
  resendText: {
    ...theme.textStyles.body,
    color: theme.colors.primary,
  },
});
