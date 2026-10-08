import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useGroupStore } from '@/stores/groupStore';

/**
 * Loads one shared group (detail + first activity page) and refreshes it whenever the screen
 * regains focus, so coming back from the expense / settle / members screens never shows stale
 * balances. Groups are online-only: a failed load is an explicit error state with a retry, never
 * a silently empty screen.
 */
export function useGroupDetail(groupId: string | undefined) {
  const current = useGroupStore((s) => s.current);
  const activity = useGroupStore((s) => s.activity);
  const hasMore = useGroupStore((s) => s.activityNextBefore !== null);
  const isLoading = useGroupStore((s) => s.isLoading);
  const isLoadingMore = useGroupStore((s) => s.isLoadingMore);
  const loadGroup = useGroupStore((s) => s.loadGroup);
  const loadMoreActivity = useGroupStore((s) => s.loadMoreActivity);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!groupId) return;
    try {
      await loadGroup(groupId);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [groupId, loadGroup]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const detail = current && current.id === groupId ? current : null;
  return {
    detail,
    activity: detail ? activity : [],
    hasMore,
    isLoading,
    isLoadingMore,
    loadFailed,
    reload,
    loadMore: loadMoreActivity,
  };
}
