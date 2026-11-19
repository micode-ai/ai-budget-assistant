import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PetDetailView } from '@/components/pets/PetDetailView';

/**
 * One pet's costs (ABA-831). Thin: `PetDetailView` (component-level `.web.tsx`
 * split) decides phone vs desktop; the header is registered in `app/_layout.tsx`.
 */
export default function PetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PetDetailView petId={String(id ?? '')} />;
}
