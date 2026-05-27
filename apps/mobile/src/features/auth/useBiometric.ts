// Platform-specific useBiometric hook
// This file provides web compatibility - uses localStorage instead of SecureStore
// and provides a no-op implementation for biometric authentication

import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { secureStorage } from '@/services/secureStorage';

interface BiometricState {
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  biometricType: number | null;
  isLoading: boolean;
}

export function useBiometric() {
  const [state, setState] = useState<BiometricState>({
    isBiometricAvailable: false,
    isBiometricEnabled: false,
    biometricType: null,
    isLoading: false,
  });

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      // On web, biometric is not available - allow access
      return true;
    }
    // On native, this will be handled by the .native.ts file
    return false;
  }, []);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return false;
    }
    return false;
  }, []);

  const disableBiometric = useCallback(async () => {
    await secureStorage.removeItem('biometricEnabled');
    setState((prev) => ({ ...prev, isBiometricEnabled: false }));
  }, []);

  const getBiometricTypeName = useCallback((): string => {
    return 'Biometric';
  }, []);

  return {
    ...state,
    authenticate,
    enableBiometric,
    disableBiometric,
    getBiometricTypeName,
    refresh: () => {},
  };
}
