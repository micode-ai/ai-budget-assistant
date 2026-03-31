import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const API_ERROR_MAP: Record<string, string> = {
  'Invalid or expired verification code': 'errors.invalidVerificationCode',
  'Verification code has expired': 'errors.verificationCodeExpired',
  'Invalid verification code': 'errors.invalidVerificationCode',
};

function mapApiError(message: string, t: (key: string) => string): string {
  const i18nKey = API_ERROR_MAP[message];
  return i18nKey ? t(i18nKey) : t('errors.verificationFailed');
}

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { verifyEmail, resendVerification, isLoading } = useAuthStore();

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      setError(t('errors.invalidVerificationCode'));
      return;
    }

    setError(null);

    try {
      await verifyEmail(email!, code);
      Alert.alert('', t('auth.verificationSuccess'));
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setResendMessage(null);
    try {
      await resendVerification(email!);
      setResendMessage(t('auth.codeSent'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.verifyEmail')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.enterVerificationCode', { email })}
            </Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {resendMessage && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{resendMessage}</Text>
              </View>
            )}

            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={theme.colors.textTertiary}
              value={code}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('auth.verify')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResendCode}
              disabled={isLoading}
              style={styles.resendButton}
            >
              <Text style={styles.linkText}>{t('auth.resendCode')}</Text>
            </TouchableOpacity>

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.linkText}>{t('auth.backToLogin')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[6],
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[12],
  },
  title: {
    fontSize: 32,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
    textAlign: 'center' as const,
  },
  subtitle: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  form: {
    gap: theme.spacing[4],
  },
  errorContainer: {
    backgroundColor: theme.colors.dangerLight,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  successContainer: {
    backgroundColor: theme.colors.successLight,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  successText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.success,
    textAlign: 'center' as const,
  },
  codeInput: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    fontSize: 32,
    fontFamily: theme.fonts.bold,
    letterSpacing: 12,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing[4],
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
  resendButton: {
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  footer: {
    alignItems: 'center' as const,
    marginTop: theme.spacing[4],
  },
  linkText: {
    ...theme.textStyles.bodySm,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
});
