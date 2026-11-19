import { useEffect, useState } from 'react';
import { useEncryptionStore } from '@/stores/encryptionStore';

/**
 * Which E2EE note the pet screens show (ABA-831), the same rule as children and
 * vehicles: none on an unencrypted account; `locked` when the account is
 * encrypted and this device holds no unlocked key (merchants and notes of the
 * costs cannot be shown); `plain` otherwise — pets themselves hold no
 * encrypted field, so the user is told their names and dates are stored as typed.
 * An unreadable tier reads as 0 (`getAccountTier` never throws), so the note
 * is simply not shown then.
 */
export function usePetEncryptionNote(accountId: string | null): 'none' | 'locked' | 'plain' {
  const getAccountTier = useEncryptionStore((s) => s.getAccountTier);
  const isUnlocked = useEncryptionStore((s) => s.isUnlocked);
  const hasKey = useEncryptionStore((s) => (accountId ? s.accountKeys.has(accountId) : false));
  const [tier, setTier] = useState(0);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void getAccountTier(accountId).then((t) => {
      if (!cancelled) setTier(t);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, getAccountTier]);

  if (tier === 0) return 'none';
  return isUnlocked && hasKey ? 'plain' : 'locked';
}
