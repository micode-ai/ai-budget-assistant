import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { GroupComparisonView } from '@/components/all-accounts/GroupComparisonView';

/** One account group's comparison. Thin route; the body lives under `src/`. */
export default function AllAccountsGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupComparisonView groupId={String(id)} />;
}
