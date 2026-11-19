import React from 'react';
import { usePetDetail } from '@/features/pets/usePetDetail';
import { usePetEncryptionNote } from '@/features/pets/usePetEncryptionNote';
import { useAccountStore } from '@/stores/accountStore';
import { useIsDesktopWeb } from '../webLayout.constants';
import { PetDetailPhone } from './PetDetailPhone';
import { PetDetailDesktop } from './desktop/PetDetailDesktop';

/**
 * The one place that decides, on width alone. `usePetDetail` runs here, ABOVE
 * the split, and is passed down: a resize across 1024 swaps the layout but
 * keeps the loaded period, the picked month and the kind filter.
 */
export function PetDetailView({ petId }: { petId: string }) {
  const detail = usePetDetail(petId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const accountId = useAccountStore((s) => s.currentAccountId);
  const encryptionNote = usePetEncryptionNote(accountId);
  const isDesktop = useIsDesktopWeb();
  return isDesktop ? (
    <PetDetailDesktop detail={detail} canEdit={canEdit} encryptionNote={encryptionNote} />
  ) : (
    <PetDetailPhone detail={detail} canEdit={canEdit} encryptionNote={encryptionNote} />
  );
}
