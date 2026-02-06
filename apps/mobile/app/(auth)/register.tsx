import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import i18n, { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';

const CURRENCIES = [
  { code: 'USD', label: '$ USD' },
  { code: 'EUR', label: '\u20AC EUR' },
  { code: 'GBP', label: '\u00A3 GBP' },
  { code: 'UAH', label: '\u20B4 UAH' },
  { code: 'PLN', label: 'z\u0142 PLN' },
  { code: 'RUB', label: '\u20BD RUB' },
];

export default function RegisterScreen() {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [language, setLanguage] = useState(i18n.language);
  const [error, setError] = useState<string | null>(null);

  const { register, isLoading } = useAuthStore();

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError(t('validation.fillAllFields'));
      return;
    }

    if (name.trim().length < 2) {
      setError(t('validation.nameMin2'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('validation.invalidEmail'));
      return;
    }

    if (password.length < 8) {
      setError(t('validation.passwordMin8'));
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError(t('validation.passwordLatin'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('validation.passwordsNoMatch'));
      return;
    }

    setError(null);

    try {
      await register(email, password, name, currencyCode);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.registrationFailed'));
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
            <Text style={styles.title}>{t('auth.createAccount')}</Text>
            <Text style={styles.subtitle}>{t('auth.startTracking')}</Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextInput
              style={styles.input}
              placeholder={t('auth.fullName')}
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor="#999"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder={t('auth.password')}
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.input}
              placeholder={t('auth.confirmPassword')}
              placeholderTextColor="#999"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            <View>
              <Text style={styles.fieldLabel}>{t('auth.currency')}</Text>
              <View style={styles.currencyRow}>
                {CURRENCIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[
                      styles.currencyChip,
                      currencyCode === c.code && styles.currencyChipActive,
                    ]}
                    onPress={() => setCurrencyCode(c.code)}
                  >
                    <Text
                      style={[
                        styles.currencyChipText,
                        currencyCode === c.code && styles.currencyChipTextActive,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>{t('auth.language')}</Text>
              <View style={styles.currencyRow}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.currencyChip,
                      language === lang.code && styles.currencyChipActive,
                    ]}
                    onPress={() => {
                      setLanguage(lang.code);
                      changeLanguage(lang.code);
                    }}
                  >
                    <Text
                      style={[
                        styles.currencyChipText,
                        language === lang.code && styles.currencyChipTextActive,
                      ]}
                    >
                      {lang.flag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('auth.createAccount')}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('auth.haveAccount')}</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.linkText}>{t('auth.signIn')}</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    gap: 16,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  currencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  currencyChipActive: {
    backgroundColor: '#4ECDC4',
    borderColor: '#4ECDC4',
  },
  currencyChipText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  currencyChipTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  linkText: {
    color: '#4ECDC4',
    fontSize: 14,
    fontWeight: '600',
  },
});
