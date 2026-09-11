import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import { normalizeShortcutEvent, isEditableTarget, type ShortcutEventTarget } from '@/features/shortcuts/shortcutCombo';
import {
  registerShortcut,
  unregisterShortcut,
  resolveShortcutHandler,
  subscribeShortcuts,
  getShortcutSnapshot,
  type ShortcutRegistration,
} from '@/features/shortcuts/shortcutRegistry';

/**
 * Thin React layer over `shortcutRegistry.ts`. Everything decidable without
 * a DOM lives in that file (and is unit-tested there); this file only ever
 * does the two things that genuinely need `document` and React's lifecycle —
 * attach the one global listener, and keep a component registered while it's
 * mounted.
 *
 * Desktop-web only, by construction: every hook below no-ops on native and
 * on narrow/mobile web via `useIsDesktopWeb()`, so a component that calls
 * `useDesktopShortcut` never has to guard itself — mirrors every other
 * desktop-only surface in this codebase (`useContentWidth`, `WebShell`).
 */

/** Register a keyboard shortcut for as long as the calling component stays
 *  mounted with `enabled !== false`.
 *
 * `combo` and the option fields are read fresh on every render but only
 * re-registered when one of them actually changes value — `handler` itself
 * is NOT a dependency (kept in a ref instead), so a call site can pass an
 * inline closure every render without re-registering on every keystroke of
 * unrelated state. */
export function useDesktopShortcut(
  combo: string,
  handler: (event: { preventDefault: () => void }) => void,
  options?: { enabled?: boolean; description?: string; allowInInput?: boolean }
): void {
  const isDesktop = useIsDesktopWeb();
  const enabled = options?.enabled ?? true;
  const description = options?.description;
  const allowInInput = options?.allowInInput ?? false;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktop || !enabled) return undefined;
    const id = registerShortcut({
      combo,
      description,
      allowInInput,
      handler: (event) => handlerRef.current(event),
    });
    return () => unregisterShortcut(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, enabled, combo, description, allowInInput]);
}

/**
 * The one global `keydown` listener for the whole desktop web app. Mounted
 * exactly once, by `WebShell.web.tsx`'s `DesktopShell` — every screen's own
 * bindings arrive and depart via `useDesktopShortcut` above, so this never
 * needs to know what's currently registered.
 */
export function useDesktopShortcutsListener(): void {
  const isDesktop = useIsDesktopWeb();

  useEffect(() => {
    if (Platform.OS !== 'web' || !isDesktop) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const combo = normalizeShortcutEvent(event);
      const isInputTarget = isEditableTarget(event.target as ShortcutEventTarget | null);
      const resolved = resolveShortcutHandler(combo, isInputTarget);
      if (!resolved) return;
      event.preventDefault();
      resolved.handler(event);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isDesktop]);
}

/** Live view of every currently-registered shortcut, for the `?` help
 *  overlay — it can therefore never advertise a binding that isn't actually
 *  active on the screen the user is looking at. */
export function useRegisteredShortcuts(): ShortcutRegistration[] {
  return useSyncExternalStore(subscribeShortcuts, getShortcutSnapshot, getShortcutSnapshot);
}
