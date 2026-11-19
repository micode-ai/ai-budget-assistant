import type { Pet } from '@budget/shared-types';
import { createAccountListCache } from '@/utils/accountListCache';

/** The pet list per account (ABA-833). Cleared on sign-out in `authSessionActions`. */
export const petsCache = createAccountListCache<Pet>();
