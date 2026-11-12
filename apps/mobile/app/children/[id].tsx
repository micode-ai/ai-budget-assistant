import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChildCostsView } from '@/components/children/ChildCostsView';

/**
 * One child's costs. Thin: `ChildCostsView` (component-level `.web.tsx` split)
 * decides phone vs desktop; the header is registered in `app/_layout.tsx`.
 */
export default function ChildCostsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChildCostsView childId={String(id ?? '')} />;
}
