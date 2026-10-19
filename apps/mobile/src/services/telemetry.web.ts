import { secureStorage } from '@/services/secureStorage';
import { DESKTOP_MIN_WIDTH } from '@/components/webLayout.constants';
import type {
  TelemetryDisplay,
  TelemetryFlow,
  TelemetryFormFactor,
  TelemetryStatus,
} from './telemetry.types';

export type { TelemetryFlow, TelemetryStatus };

/** Below this a window is a phone; from here to `DESKTOP_MIN_WIDTH` a tablet. */
const TABLET_MIN_WIDTH = 768;

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
const FLUSH_INTERVAL_MS = 15_000;
/** Well under the 64 KB keepalive body cap, and equal to the server's cap. */
const MAX_BUFFERED = 40;

interface BufferedEvent {
  name: 'session_start' | 'screen_view' | 'action';
  screen?: string;
  props?: Record<string, string | number>;
  ts: number;
}

let buffer: BufferedEvent[] = [];
let sessionId = newSessionId();
let timer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;

/** Random per app load, memory only — no cross-session identifier exists. */
function newSessionId(): string {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

/** The desktop bucket starts exactly where the desktop layout does, so a
 *  `desktop` event is one the person saw in the desktop shell. */
export function formFactorForWidth(width: number): TelemetryFormFactor {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'phone';
}

function currentDisplay(): TelemetryDisplay {
  if (typeof window === 'undefined') return 'browser';
  const isIosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  const isStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return isIosStandalone || isStandalone ? 'standalone' : 'browser';
}

/**
 * Stamped on EVERY event rather than sent once per batch at the top level:
 * the API's global ValidationPipe is `forbidNonWhitelisted`, so a new top-level
 * field reaching an API one deploy behind would 400 and lose the whole batch,
 * while an unknown prop key is dropped by the allow-list and the event kept.
 * Per event also keeps a session that is resized across a breakpoint honest.
 */
function deviceProps(): { formFactor: TelemetryFormFactor; display: TelemetryDisplay } {
  const width = typeof window === 'undefined' ? DESKTOP_MIN_WIDTH : window.innerWidth;
  return { formFactor: formFactorForWidth(width), display: currentDisplay() };
}

function push(event: BufferedEvent): void {
  // Drop the oldest rather than grow without bound: a lost statistic is
  // strictly preferable to unbounded memory in a long-lived tab.
  if (buffer.length >= MAX_BUFFERED) buffer.shift();
  buffer.push({ ...event, props: { ...event.props, ...deviceProps() } });
  ensureTimers();
}

function ensureTimers(): void {
  if (timer === null) timer = setInterval(flushTelemetry, FLUSH_INTERVAL_MS);
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTelemetry();
  });
}

export function startTelemetrySession(): void {
  push({ name: 'session_start', ts: Date.now() });
}

export function trackScreen(screen: string): void {
  push({ name: 'screen_view', screen, ts: Date.now() });
}

export function trackAction(flow: TelemetryFlow, status: TelemetryStatus, ms?: number): void {
  const props: Record<string, string | number> = { flow, status };
  if (typeof ms === 'number' && Number.isFinite(ms)) props.ms = Math.round(ms);
  push({ name: 'action', props, ts: Date.now() });
}

/** Drops whatever is buffered without sending it. Called on sign-out: the token
 *  is gone and those events belong to a session that has ended.
 *
 *  Also stops the periodic flush — after sign-out nothing should tick on a
 *  timer until something is tracked again, and `push` recreates it when it is.
 *  `listenersBound` is deliberately NOT reset: the visibilitychange listener is
 *  bound once for the document's lifetime and must never be double-bound. */
export function resetTelemetry(): void {
  buffer = [];
  sessionId = newSessionId();
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export function flushTelemetry(): void {
  if (buffer.length === 0) return;
  // Cleared BEFORE the request: a rejected flush must not resend (no retries).
  const events = buffer;
  buffer = [];
  void send(events);
}

async function send(events: BufferedEvent[]): Promise<void> {
  try {
    const token = await secureStorage.getItem('accessToken');
    if (!token) return;
    await fetch(`${API_BASE_URL}/telemetry/events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: 'web', sessionId, events }),
    });
  } catch {
    // Telemetry may never degrade the product: no log, no retry, no rethrow.
  }
}
