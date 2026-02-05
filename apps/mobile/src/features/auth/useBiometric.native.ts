import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { secureStorage } from '@/services/secureStorage';

interface BiometricState {
  isBiometricAvailable: boolean;
  isBiometricEnabled: boolean;
  biometricType: LocalAuthentication.AuthenticationType | null;
  isLoading: boolean;
}

export function useBiometric() {
  const [state, setState] = useState<BiometricState>({
    isBiometricAvailable: false,
    isBiometricEnabled: false,
    biometricType: null,
    isLoading: true,
  });

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    try {
      // Check if hardware supports biometric
      const hasHardware = await LocalAuthentication.hasHardwareAsync();

      if (!hasHardware) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      // Check if biometric is enrolled
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!isEnrolled) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      // Get supported authentication types
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

      // Check if biometric is enabled in app settings
      const biometricEnabled = await secureStorage.getItem('biometricEnabled');

      setState({
        isBiometricAvailable: true,
        isBiometricEnabled: biometricEnabled === 'true',
        biometricType: supportedTypes[0] || null,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error checking biometric support:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!state.isBiometricAvailable) {
      return false;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access AI Budget',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });

      return result.success;
    } catch (error) {
      console.error('Biometric authentication error:', error);
      return false;
    }
  }, [state.isBiometricAvailable]);

  const enableBiometric = useCallback(async (): Promise<boolean> => {
    if (!state.isBiometricAvailable) {
      return false;
    }

    // Verify user identity before enabling
    const authenticated = await authenticate();

    if (authenticated) {
      await secureStorage.setItem('biometricEnabled', 'true');
      setState((prev) => ({ ...prev, isBiometricEnabled: true }));
      return true;
    }

    return false;
  }, [state.isBiometricAvailable, authenticate]);

  const disableBiometric = useCallback(async () => {
    await secureStorage.removeItem('biometricEnabled');
    setState((prev) => ({ ...prev, isBiometricEnabled: false }));
  }, []);

  const getBiometricTypeName = useCallback((): string => {
    if (!state.biometricType) return 'Biometric';

    switch (state.biometricType) {
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return 'Face ID';
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return 'Touch ID';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'Iris';
      default:
        return 'Biometric';
    }
  }, [state.biometricType]);

  return {
    ...state,
    authenticate,
    enableBiometric,
    disableBiometric,
    getBiometricTypeName,
    refresh: checkBiometricSupport,
  };
}
