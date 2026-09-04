import { secureStorage } from '@/services/secureStorage';
import type { TelemetryFlow, TelemetryStatus } from './telemetry.types';

export type { TelemetryFlow, TelemetryStatus };

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

function push(event: BufferedEvent): void {
  // Drop the oldest rather than grow without bound: a lost statistic is
  // strictly preferable to unbounded memory in a long-lived tab.
  if (buffer.length >= MAX_BUFFERED) buffer.shift();
  buffer.push(event);
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
