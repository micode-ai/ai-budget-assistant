import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

export function useChatPolling(
  currentIsShared: boolean,
  startPolling: () => void,
  stopPolling: () => void,
) {
  useFocusEffect(
    useCallback(() => {
      if (currentIsShared) startPolling();
      return () => stopPolling();
    }, [currentIsShared, startPolling, stopPolling]),
  );
}
