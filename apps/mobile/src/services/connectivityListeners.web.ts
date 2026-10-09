/** Web: `navigator.onLine` is only a hint - the events trigger a /health probe. */
export function startPlatformListeners(recheck: () => void): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', recheck);
  window.addEventListener('offline', recheck);
}
