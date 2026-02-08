import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

export default function JoinAccountScreen() {
  const { t } = useTranslation();
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
          <Ionicons name="people-outline" size={48} color="#4ECDC4" />
        </View>
        <Text style={styles.title}>{t('accounts.joinAccount')}</Text>
        <Text style={styles.subtitle}>{t('accounts.joinDescription')}</Text>

        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder={t('accounts.enterCode')}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleJoin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('accounts.join')}</Text>
          )}
        </TouchableOpacity>
      </View>
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
    padding: 20,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'center',
    letterSpacing: 4,
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
