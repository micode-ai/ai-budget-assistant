import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { VehicleDetailView } from '@/components/vehicles/VehicleDetailView';

/**
 * One vehicle's costs (ABA-811). Thin: `VehicleDetailView` (component-level
 * `.web.tsx` split) decides phone vs desktop; the header is registered in
 * `app/_layout.tsx`.
 */
export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VehicleDetailView vehicleId={String(id ?? '')} />;
}
