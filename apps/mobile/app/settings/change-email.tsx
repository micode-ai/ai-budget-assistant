import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { secureStorage } from '@/services/secureStorage';

const PENDING_KEY = 'pendingEmailChange';

interface PendingState {
  newEmail: string;
  expiresAt: string;
}

export default function ChangeEmailScreen() {
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
      if (raw) {
        try {
          const parsed: PendingState = JSON.parse(raw);
          if (new Date(parsed.expiresAt) > new Date()) {
            setPendingEmail(parsed.newEmail);
            setStep(2);
          } else {
            secureStorage.removeItem(PENDING_KEY);
          }
        } catch {
          secureStorage.removeItem(PENDING_KEY);
        }
      }
      setInitializing(false);
    });
  }, []);

  const handleSendCode = async () => {
    if (!newEmail.trim() || !currentPassword) {
      Alert.alert(t('common.error'), t('validation.requiredFields'));
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
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!code.trim()) {
      Alert.alert(t('common.error'), t('validation.requiredFields'));
      return;
    }
    setLoading(true);
    try {
      const result = await api.changeEmailConfirm({ code: code.trim() });
      updateUser({ email: pendingEmail });
      setTokens(result.accessToken, result.refreshToken);
      await secureStorage.removeItem(PENDING_KEY);
      Alert.alert(
        t('settings.changeEmail.success'),
        t('settings.changeEmail.successMessage'),
        [{ text: t('common.ok'), onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
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
