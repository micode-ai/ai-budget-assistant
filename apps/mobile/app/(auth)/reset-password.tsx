import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const API_ERROR_MAP: Record<string, string> = {
  'Invalid or expired code': 'errors.invalidResetCode',
  'Too many attempts. Please try again later.': 'errors.tooManyResetAttempts',
};

function mapApiError(message: string, t: (key: string) => string): string {
  const i18nKey = API_ERROR_MAP[message];
  return i18nKey ? t(i18nKey) : t('errors.resetFailed');
}

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { resetPassword, forgotPassword, isLoading } = useAuthStore();

  const validate = (): string | null => {
    if (!code || !newPassword || !confirmPassword) {
      return t('validation.fillAllFields');
    }
    if (code.length !== 6) {
      return t('errors.invalidResetCode');
    }
    if (newPassword.length < 8) {
      return t('validation.passwordMin8');
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return t('validation.passwordLatin');
    }
    if (newPassword !== confirmPassword) {
      return t('validation.passwordsNoMatch');
    }
    return null;
  };

  const handleResetPassword = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);

    try {
      await resetPassword(email!, code, newPassword);
      Alert.alert('', t('auth.passwordResetSuccess'));
      router.replace('/(auth)/login');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setResendMessage(null);
    try {
      await forgotPassword(email!);
      setResendMessage(t('auth.codeSent'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.content}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.resetPassword')}</Text>
            <Text style={styles.subtitle}>{t('auth.enterResetCode')}</Text>
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

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('auth.newPassword')}
                placeholderTextColor={theme.colors.textTertiary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder={t('auth.confirmNewPassword')}
                placeholderTextColor={theme.colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResetPassword}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.buttonText}>{t('auth.resetPassword')}</Text>
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
    fontSize: 36,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing[2],
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
    fontSize: 28,
    fontFamily: theme.fonts.bold,
    letterSpacing: 8,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passwordContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textPrimary,
  },
  eyeButton: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
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
