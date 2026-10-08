import type { InboundMailHandoffPayload as Shared } from '../../../packages/shared-types/src/entities/inboundMail';
import type { InboundMailHandoffPayload as Local } from './types';

// Compile-time guard: the container's payload type and the shared contract must match.
const toShared = (x: Local): Shared => x;
const toLocal = (x: Shared): Local => x;

describe('handoff payload type', () => {
  it('stays mutually assignable with packages/shared-types', () => {
    expect(typeof toShared).toBe('function');
    expect(typeof toLocal).toBe('function');
  });
});
