import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useExpenseStore } from '@/stores/expenseStore';
import { captureCurrentLocation, type CapturedLocation } from '@/services/locationCapture';
import { findNearbyStore, type NearbyStore } from '@/features/stores/findNearbyStore';
import { expensesToVisits } from '@/features/stores/expensesToVisits';

/** GPS is not free; a return to the home tab should not re-acquire it. */
const POSITION_TTL_MS = 5 * 60 * 1000;

/**
 * The shop the user is standing in, or null.
 *
 * Deliberately calls `captureCurrentLocation()` WITHOUT `force`, so the
 * Settings → Data opt-in (default OFF) governs it: a user who declined
 * location is never silently located for this. That helper already returns
 * null on denial, on a 4-second timeout, and on any thrown error, so every
 * failure path here simply yields no card.
 */
export function useNearbyStore(): NearbyStore | null {
  const expenses = useExpenseStore((s) => s.expenses);
  const [nearby, setNearby] = useState<NearbyStore | null>(null);
  const cached = useRef<{ at: number; coords: { lat: number; lng: number } } | null>(null);
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  /** True only between this screen's focus and its blur — see the AppState effect. */
  const focusedRef = useRef(false);
  /** One GPS acquisition at a time; see the guard in check(). */
  const inFlight = useRef(false);

  /**
   * Flatten expenses into visits and perform the matching against the given coords.
   * Extracted to avoid duplication between check() and recheck().
   */
  const performMatch = useCallback(
    (coords: { lat: number; lng: number }) => {
      const visits = expensesToVisits(expenses);

      const next = findNearbyStore({ coords, visits });
      // findNearbyStore allocates a fresh object every call, so setting it
      // unconditionally re-rendered the widget on every recheck even when the
      // answer had not changed. Compare by value and keep the old reference.
      setNearby((prev) =>
        prev?.merchant === next?.merchant && prev?.distanceM === next?.distanceM ? prev : next,
      );
    },
    [expenses],
  );

  // The latest performMatch, for callers that can only reach it after an await.
  const performMatchRef = useRef(performMatch);
  useEffect(() => {
    performMatchRef.current = performMatch;
  }, [performMatch]);

  /**
   * Called by the focus effect: may acquire position if not cached.
   */
  const check = useCallback(async () => {
    const fresh = cached.current && Date.now() - cached.current.at < POSITION_TTL_MS
      ? cached.current.coords
      : null;

    if (fresh) {
      performMatch(fresh);
      return;
    }

    // useFocusEffect's callback is recreated whenever `expenses` changes
    // identity, so it re-fires while already focused — and a cold home load
    // sets `expenses` two or three times in the first seconds. Without this,
    // several captureCurrentLocation() calls overlap to answer one question.
    if (inFlight.current) return;
    inFlight.current = true;
    let captured: CapturedLocation | null = null;
    try {
      captured = await captureCurrentLocation();
    } finally {
      inFlight.current = false;
    }

    if (!captured) {
      setNearby(null);
      return;
    }

    const coords = { lat: captured.lat, lng: captured.lng };
    cached.current = { at: Date.now(), coords };
    // Deliberately through the ref: this closure was built before the await, so
    // its `expenses` may already be stale — the callers carrying the newer list
    // are exactly the ones the guard above turned away.
    performMatchRef.current(coords);
  }, [performMatch]);

  /**
   * Called by the plain effect: only re-matches against cached position.
   * Does NOT acquire position on its own. Returns early if no cached position exists.
   */
  const recheck = useCallback(() => {
    if (!cached.current) return;
    performMatch(cached.current.coords);
  }, [performMatch]);

  // Keep checkRef up to date with the latest check closure.
  useEffect(() => {
    checkRef.current = check;
  }, [check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;

      // A position acquired before backgrounding says nothing about where the
      // user is now — they may have driven elsewhere in the interim. Dropping
      // the cache costs nothing and has no user-visible effect, so it happens
      // whatever screen is showing; otherwise a stale shop would survive into
      // the next focus.
      cached.current = null;

      // Acquiring GPS is not free, and the design is explicit that the check
      // runs on home-tab focus. Bottom-tab screens stay mounted after their
      // first focus, so without this gate the hook would read the position
      // whenever the app foregrounds into Chat, Analytics, a settings screen or
      // a push deep link — surfacing the OS location indicator at a moment the
      // user has no reason to connect with this feature. When they do return to
      // the home tab the focus effect runs check() against the cleared cache.
      if (!focusedRef.current) return;
      void checkRef.current?.();
    });
    return () => {
      sub.remove();
    };
  }, []);

  // Acquire position only when the home tab is focused.
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    void check();
    return () => {
      focusedRef.current = false;
    };
  }, [check]));

  // Re-evaluate when the expense list changes while the screen is already
  // focused — a just-saved expense can make this shop known. Only re-matches
  // against existing cached position; never acquires a new one.
  useEffect(() => {
    void recheck();
  }, [recheck]);

  return nearby;
}
