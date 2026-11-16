import React from 'react';
import { NetWorthView } from '@/components/net-worth/NetWorthView';

/** Net worth across all accounts (ABA-799). Thin route; the body lives under `src/`. */
export default function NetWorthScreen() {
  return <NetWorthView />;
}
