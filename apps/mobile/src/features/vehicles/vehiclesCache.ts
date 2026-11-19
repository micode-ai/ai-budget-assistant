import type { Vehicle } from '@budget/shared-types';
import { createAccountListCache } from '@/utils/accountListCache';

/** The vehicle list per account (ABA-833). Cleared on sign-out in `authSessionActions`. */
export const vehiclesCache = createAccountListCache<Vehicle>();
