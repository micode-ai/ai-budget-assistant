import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useBiometric } from '@/features/auth/useBiometric';
import { useTheme, useStyles, type Theme } from '@/theme';

const API_ERROR_MAP: Record<string, string> = {
  'Invalid credentials': 'errors.invalidCredentials',
  'Account is deactivated': 'errors.accountDeactivated',
  'Session expired': 'errors.sessionExpired',
};

function mapApiError(message: string, t: (key: string) => string, fallbackKey: string): string {
  const i18nKey = API_ERROR_MAP[message];
  return i18nKey ? t(i18nKey) : t(fallbackKey);
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const { login, biometricLogin, isLoading, hasSavedSession } = useAuthStore();
  const { isBiometricAvailable, authenticate: biometricAuth, getBiometricTypeName } = useBiometric();

  const showBiometric = isBiometricAvailable && hasSavedSession;
  const showQuickLogin = hasSavedSession && !isBiometricAvailable;

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('validation.fillAllFields'));
      return;
    }

    setError(null);

    try {
      await login(email, password);
      // Check if verified using store state since login() updates it
      const user = useAuthStore.getState().user;
      if (user && !user.isVerified) {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email },
        });
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t, 'errors.loginFailed'));
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    const success = await biometricAuth();
    if (success) {
      try {
        await biometricLogin();
        router.replace('/(tabs)');
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        setError(mapApiError(msg, t, 'errors.biometricLoginFailed'));
      }
    }
  };

  const handleQuickLogin = async () => {
    setError(null);
    try {
      await biometricLogin();
      router.replace('/(tabs)');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(mapApiError(msg, t, 'errors.quickLoginFailed'));
    }
  };

  // Auto-trigger biometric on mount when saved session exists
  useEffect(() => {
    if (showBiometric) {
      handleBiometricLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBiometric]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.appName')}</Text>
          <Text style={styles.subtitle}>{t('auth.appTagline')}</Text>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder={t('auth.email')}
            placeholderTextColor={theme.colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder={t('auth.password')}
              placeholderTextColor={theme.colors.textTertiary}
              value={password}
              onChangeText={setPassword}
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

          <TouchableOpacity
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotPassword}
          >
            <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
            )}
          </TouchableOpacity>

          {showBiometric && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricLogin}
            >
              <Text style={styles.biometricButtonText}>
                {t('auth.useBiometric', { type: getBiometricTypeName() })}
              </Text>
            </TouchableOpacity>
          )}

          {showQuickLogin && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleQuickLogin}
            >
              <Text style={styles.biometricButtonText}>{t('auth.quickLogin')}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.linkText}>{t('auth.signUp')}</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
      {isLoading && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('auth.signingIn')}</Text>
            <Text style={styles.loadingSubtext}>{t('auth.loadingData')}</Text>
          </View>
        </View>
      )}
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
  input: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    ...theme.textStyles.bodyLarge,
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
  forgotPassword: {
    alignSelf: 'flex-end' as const,
    marginTop: -theme.spacing[2],
  },
  forgotPasswordText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
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
  biometricButton: {
    paddingVertical: theme.spacing[4],
    alignItems: 'center' as const,
  },
  biometricButtonText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.primary,
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    marginTop: theme.spacing[6],
  },
  footerText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  linkText: {
    ...theme.textStyles.bodySm,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  loadingOverlay: {
    ...(Platform.OS === 'web'
      ? { position: 'fixed' as any }
      : { position: 'absolute' as const }),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background + 'E6',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    zIndex: 10,
  },
  loadingCard: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[8],
    borderRadius: theme.borderRadius.xl,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    minWidth: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  loadingSubtext: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
