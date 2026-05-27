// Web version - biometric authentication is not available on web
import { useState, useCallback } from 'react';

interface BiometricState {
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  biometricType: null;
  isLoading: boolean;
}

export function useBiometric() {
  const [state] = useState<BiometricState>({
    isBiometricAvailable: false,
    isBiometricEnabled: false,
    biometricType: null,
    isLoading: false,
  });

  const authenticate = useCallback(async (): Promise<boolean> => {
    // Biometric not available on web
    return true; // Allow access without biometric on web
  }, []);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    // Biometric not available on web
    return false;
  }, []);

  const disableBiometric = useCallback(async () => {
    // No-op on web
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
