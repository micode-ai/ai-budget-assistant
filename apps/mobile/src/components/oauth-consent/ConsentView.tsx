import React from 'react';
import { useConsent } from '@/features/oauth-consent/useConsent';
import type { RawSearchParams } from '@/features/oauth-consent/consentParams';
import { ConsentPhone } from './ConsentPhone';

/**
 * Native: always the phone layout. The web build resolves `ConsentView.web.tsx` instead, which
 * decides on width and adds the anti-framing check.
 */
export function ConsentView({ params }: { params: RawSearchParams }) {
  const consent = useConsent(params);
  return <ConsentPhone consent={consent} />;
}
