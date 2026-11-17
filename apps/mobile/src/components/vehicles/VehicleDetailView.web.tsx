import React from 'react';
import { useVehicleDetail } from '@/features/vehicles/useVehicleDetail';
import { useIsDesktopWeb } from '../webLayout.constants';
import { VehicleDetailPhone } from './VehicleDetailPhone';
import { VehicleDetailDesktop } from './desktop/VehicleDetailDesktop';

/**
 * The one place that decides, on width alone. `useVehicleDetail` runs here,
 * ABOVE the split, and is passed down: a resize across 1024 swaps the layout
 * but keeps the loaded period, the picked month and the kind filter.
 */
export function VehicleDetailView({ vehicleId }: { vehicleId: string }) {
  const detail = useVehicleDetail(vehicleId);
  const isDesktop = useIsDesktopWeb();
  return isDesktop ? <VehicleDetailDesktop detail={detail} /> : <VehicleDetailPhone detail={detail} />;
}
