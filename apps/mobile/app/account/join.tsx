import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function JoinAccountScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { acceptInvitation } = useAccountStore();

  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      Alert.alert(t('errors.error'), t('accounts.codeRequired'));
      return;
    }

    setIsLoading(true);
    try {
      await acceptInvitation(inviteCode.trim());
      Alert.alert(t('common.success'), t('accounts.joinedSuccess'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="people-outline" size={48} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>{t('accounts.joinAccount')}</Text>
        <Text style={styles.subtitle}>{t('accounts.joinDescription')}</Text>

        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder={t('accounts.enterCode')}
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleJoin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitButtonText}>{t('accounts.join')}</Text>
          )}
        </TouchableOpacity>
      </View>
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
    padding: theme.spacing[5],
    justifyContent: 'center' as const,
  },
  iconContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  subtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[8],
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 20,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlign: 'center' as const,
    letterSpacing: 4,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[6],
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
