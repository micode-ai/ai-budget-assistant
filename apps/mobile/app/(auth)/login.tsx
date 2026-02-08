import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useBiometric } from '@/features/auth/useBiometric';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.loginFailed'));
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
        setError(e instanceof Error ? e.message : t('errors.biometricLoginFailed'));
      }
    } else {
      setError(t('errors.biometricFailed'));
    }
  };

  const handleQuickLogin = async () => {
    setError(null);
    try {
      await biometricLogin();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.quickLoginFailed'));
    }
  };

  // Auto-trigger biometric on mount when saved session exists
  useEffect(() => {
    if (showBiometric) {
      handleBiometricLogin();
    }
  }, [showBiometric]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          <TextInput
            style={styles.input}
            placeholder={t('auth.password')}
            placeholderTextColor={theme.colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

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
});
