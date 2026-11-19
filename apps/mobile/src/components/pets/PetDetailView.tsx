import React from 'react';
import { usePetDetail } from '@/features/pets/usePetDetail';
import { usePetEncryptionNote } from '@/features/pets/usePetEncryptionNote';
import { useAccountStore } from '@/stores/accountStore';
import { PetDetailPhone } from './PetDetailPhone';

/**
 * Native. `usePetDetail` is called HERE, the parent of the layout — the same
 * shape as `PetDetailView.web.tsx`, where the parent sits above the 1024 split
 * so a resize never refetches or drops the picked period.
 */
export function PetDetailView({ petId }: { petId: string }) {
  const detail = usePetDetail(petId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const accountId = useAccountStore((s) => s.currentAccountId);
  const encryptionNote = usePetEncryptionNote(accountId);
  return <PetDetailPhone detail={detail} canEdit={canEdit} encryptionNote={encryptionNote} />;
}
