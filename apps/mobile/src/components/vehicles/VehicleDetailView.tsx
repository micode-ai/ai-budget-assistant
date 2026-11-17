import React from 'react';
import { useVehicleDetail } from '@/features/vehicles/useVehicleDetail';
import { VehicleDetailPhone } from './VehicleDetailPhone';

/**
 * Native. `useVehicleDetail` is called HERE, the parent of the layout — the
 * same shape as `VehicleDetailView.web.tsx`, where the parent sits above the
 * 1024 split so a resize never refetches or drops the picked period.
 */
export function VehicleDetailView({ vehicleId }: { vehicleId: string }) {
  const detail = useVehicleDetail(vehicleId);
  return <VehicleDetailPhone detail={detail} />;
}
