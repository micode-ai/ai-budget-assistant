/**
 * Minimal typings for `react-test-renderer`, which ships no types of its own
 * and has no `@types/` package installed in this repo.
 *
 * The package itself is always present: `jest-expo` — this package's Jest
 * preset and a declared devDependency — depends on it directly and pins it to
 * `19.1.0`, the same version as `react`. So this describes a module that
 * cannot go missing while the suite can run at all. But `tsc --noEmit` covers
 * every file here, and without this the one test that drives a hook through a
 * real mount/re-render/unmount cycle
 * (`src/features/voice/__tests__/useVoiceInput.test.ts`, which pins the
 * microphone teardown) fails the typecheck with TS7016.
 *
 * Deliberately narrow: the three symbols that test uses, typed the way it uses
 * them. This is not an attempt to describe the package, and it is not an
 * invitation to start writing component tests — see that test's header for the
 * reasoning about why a lifecycle bug is the one thing this repo's
 * "extract a plain function and test that" convention cannot reach.
 *
 * Delete this file if `@types/react-test-renderer` is ever installed; a real
 * declaration and this one would collide loudly, which is the right failure.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestRenderer {
    update(element: ReactElement): void;
    unmount(): void;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => Promise<void>): Promise<void>;
  export function act(callback: () => void): void;
}
