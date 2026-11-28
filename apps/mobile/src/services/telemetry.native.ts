import { AppState, Dimensions, Platform, type AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { secureStorage } from '@/services/secureStorage';
import { isTelemetryEnabled, writeTelemetryPreference } from './telemetryPreference';
import type {
  TelemetryDisplay,
  TelemetryFailReason,
  TelemetryFlow,
  TelemetryFormFactor,
  TelemetryStatus,
} from './telemetry.types';

export type { TelemetryFailReason, TelemetryFlow, TelemetryStatus };

/**
 * Native product telemetry — the real implementation Metro bundles for
 * Android and iOS. `telemetry.web.ts` is the web one; the extensionless
 * `telemetry.ts` stays a no-op so that anything resolving the bare import
 * platform-blind still sends nothing (fails safe).
 *
 * Same exports and the same server contract as web (allow-listed names and
 * props, no amounts, `screen` = route pattern), with a transport shaped for a
 * phone:
 *
 * - the pending queue is persisted in MMKV (debounced, and synchronously on
 *   every flush and on background), so an app killed in the background keeps
 *   its events and sends them on the next launch;
 * - the queue has an OWNER — the user id it was recorded for. A session that
 *   starts for anyone else (or for an unknown user) clears it first, so one
 *   person's backlog can never be sent under another person's token, whatever
 *   path they signed in by;
 * - it is capped at `MAX_QUEUED`, dropping the OLDEST event;
 * - it flushes every `FLUSH_INTERVAL_MS` while active (the interval stops in
 *   the background), when the app goes to the background, and when a session
 *   starts (i.e. on the next launch);
 * - a failed send KEEPS the batch for the next scheduled flush (never a tight
 *   retry loop), except a 401 — an expired token — which DROPS it, matching
 *   the web client's deliberate loss: telemetry never goes through
 *   `HttpClient`, so it never forces a refresh or a 401 logout.
 *
 * Nothing runs at import time: no timer, no listener, no storage read. A
 * session starts only when `useTelemetryScreenViews` opens it behind the
 * signed-in cold-start gate, so there is no pre-login telemetry, and every
 * event tracked before that (or after sign-out) is dropped.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
export const FLUSH_INTERVAL_MS = 15_000;
/** Persisted-queue ceiling; the oldest event is dropped beyond it. */
export const MAX_QUEUED = 500;
/** One request carries at most the server's own per-batch cap. */
export const MAX_PER_REQUEST = 40;
/** At most this many requests per flush: 4 flushes a minute × 5 stays under
 *  the ingest route's 30/min throttle even while a backlog drains. */
export const MAX_REQUESTS_PER_FLUSH = 5;
/** Back from the background after at least this long = a new session. */
export const SESSION_RESUME_MS = 30 * 60_000;
/** Shortest screen side, in dp, from which a device counts as a tablet. */
export const TABLET_MIN_SHORT_SIDE = 600;
/** Pushes are written to storage at most this often; flushes write at once. */
export const PERSIST_DEBOUNCE_MS = 2_000;
/** A hung request must not hold the flush lock forever. */
export const REQUEST_TIMEOUT_MS = 10_000;

const QUEUE_KEY = 'queue';
const OWNER_KEY = 'owner';

type EventName = 'session_start' | 'screen_view' | 'action';

/** What is queued: the wire event plus the session it belongs to. The session
 *  id is lifted to the batch on send and never appears inside an event. */
interface QueuedEvent {
  sid: string;
  name: EventName;
  screen?: string;
  props: Record<string, string | number>;
  ts: number;
}

let storage: MMKV | null = null;
let queue: QueuedEvent[] | null = null;
/** True between the gate opening (signed in) and sign-out. */
let active = false;
/** The current session, or null while signed out or opted out. */
let sessionId: string | null = null;
let lastScreen: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;
let backgroundedAt: number | null = null;
let flushing = false;
/**
 * Bumped by every sign-out and every owner change. A drain captures it before
 * its first await and gives up as soon as it differs, so a request that was in
 * flight across a sign-out can never be followed by another one carrying the
 * next user's events (or the previous user's token).
 */
let generation = 0;

function store(): MMKV {
  if (storage === null) storage = new MMKV({ id: 'telemetry-queue' });
  return storage;
}

function unref(handle: unknown): void {
  // Under Node (Jest) a timer would hold the process open; RN has no unref.
  (handle as { unref?: () => void } | null)?.unref?.();
}

function isQueuedEvent(value: unknown): value is QueuedEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.sid === 'string' && typeof v.name === 'string';
}

function loadQueue(): QueuedEvent[] {
  if (queue !== null) return queue;
  try {
    const raw = store().getString(QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // Whatever is on disk is untrusted: a half-written or older-format entry
    // must be skipped, not crash every later flush.
    queue = Array.isArray(parsed) ? parsed.filter(isQueuedEvent) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function persistNow(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    if (!queue || queue.length === 0) store().delete(QUEUE_KEY);
    else store().set(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Memory still holds the queue; only a kill before the next write loses it.
  }
}

/** Re-serialising up to 500 events on every screen view would be wasteful;
 *  coalesce pushes, and let flush/background write synchronously. */
function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, PERSIST_DEBOUNCE_MS);
  unref(persistTimer);
}

function clearQueue(): void {
  queue = [];
  persistNow();
}

function readOwner(): string | null {
  try {
    return store().getString(OWNER_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeOwner(owner: string | null): void {
  try {
    if (owner === null) store().delete(OWNER_KEY);
    else store().set(OWNER_KEY, owner);
  } catch {
    // An unwritten owner reads as "unknown" next launch, which clears the
    // queue — the safe direction.
  }
}

/** Random per session, never stored as an identifier of the person. */
function newSessionId(): string {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

/** Two buckets by the screen's SHORTEST side, so rotating does not reclassify
 *  the device. Never the raw size: that, with a model, fingerprints. */
export function formFactorForScreen(width: number, height: number): TelemetryFormFactor {
  return Math.min(width, height) >= TABLET_MIN_SHORT_SIDE ? 'tablet' : 'phone';
}

/** Stamped on every event, in `props` and never at the batch's top level: the
 *  API's ValidationPipe is `forbidNonWhitelisted`, so a new top-level field
 *  reaching an older API would 400 the batch, while an unknown prop is dropped. */
function deviceProps(): { formFactor: TelemetryFormFactor; display: TelemetryDisplay } {
  let formFactor: TelemetryFormFactor = 'phone';
  try {
    const { width, height } = Dimensions.get('screen');
    formFactor = formFactorForScreen(width, height);
  } catch {
    // Keep the default.
  }
  return { formFactor, display: 'app' };
}

function push(name: EventName, extra: { screen?: string; props?: Record<string, string | number> } = {}): void {
  if (!active || sessionId === null || !isTelemetryEnabled()) return;
  const q = loadQueue();
  const event: QueuedEvent = {
    sid: sessionId,
    name,
    props: { ...extra.props, ...deviceProps() },
    ts: Date.now(),
  };
  if (extra.screen !== undefined) event.screen = extra.screen;
  q.push(event);
  if (q.length > MAX_QUEUED) q.splice(0, q.length - MAX_QUEUED);
  schedulePersist();
}

function openSession(): void {
  sessionId = newSessionId();
  push('session_start');
  // A session that resumes mid-screen still says where it is.
  if (lastScreen !== null) push('screen_view', { screen: lastScreen });
}

function startInterval(): void {
  if (timer !== null) return;
  timer = setInterval(flushTelemetry, FLUSH_INTERVAL_MS);
  unref(timer);
}

function stopInterval(): void {
  if (timer === null) return;
  clearInterval(timer);
  timer = null;
}

function onAppStateChange(next: AppStateStatus): void {
  if (next === 'background') {
    backgroundedAt = Date.now();
    persistNow();
    flushTelemetry();
    // Nothing to tick for while backgrounded; 'active' restarts it.
    stopInterval();
    return;
  }
  if (next === 'active') {
    const awayFor = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
    backgroundedAt = null;
    if (!active) return;
    startInterval();
    if (awayFor >= SESSION_RESUME_MS && isTelemetryEnabled()) openSession();
  }
}

function startRunning(): void {
  startInterval();
  if (appStateSub === null) appStateSub = AppState.addEventListener('change', onAppStateChange);
}

function stopRunning(): void {
  stopInterval();
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (appStateSub !== null) {
    appStateSub.remove();
    appStateSub = null;
  }
  backgroundedAt = null;
}

// Fast Refresh re-evaluates this module; without this the old copy's interval
// and AppState listener would keep running beside the new one in development.
(module as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot?.dispose(stopRunning);

/**
 * Called once per signed-in app run by `useTelemetryScreenViews`, when the
 * cold-start gate opens, with the signed-in user's id. Clears a persisted
 * queue that belongs to anyone else (or to nobody known), then sends what the
 * last run of THIS user left queued.
 */
export function startTelemetrySession(ownerId?: string): void {
  const owner = ownerId && ownerId.length > 0 ? ownerId : null;
  if (owner === null || readOwner() !== owner) {
    generation += 1;
    clearQueue();
  }
  writeOwner(owner);

  active = true;
  startRunning();
  if (isTelemetryEnabled()) {
    lastScreen = null;
    openSession();
  } else {
    sessionId = null;
  }
  flushTelemetry();
}

export function trackScreen(screen: string): void {
  lastScreen = screen;
  push('screen_view', { screen });
}

export function trackAction(flow: TelemetryFlow, status: TelemetryStatus, ms?: number): void {
  const props: Record<string, string | number> = { flow, status };
  if (typeof ms === 'number' && Number.isFinite(ms)) props.ms = Math.round(ms);
  push('action', { props });
}

/** A `failed` that says which check tripped — a closed list, never a message. */
export function trackFailure(flow: TelemetryFlow, reason: TelemetryFailReason): void {
  push('action', { props: { flow, status: 'failed', reason } });
}

/** Sign-out: those events belong to a session that has ended, and the next
 *  person to sign in on this device must not send them under their token. */
export function resetTelemetry(): void {
  generation += 1;
  active = false;
  sessionId = null;
  lastScreen = null;
  stopRunning();
  clearQueue();
  writeOwner(null);
}

/** The "Share usage statistics" switch. Off clears the pending queue and stops
 *  queuing at once; on starts a fresh session if someone is signed in. */
export function setTelemetryEnabled(enabled: boolean): void {
  writeTelemetryPreference(enabled);
  if (!enabled) {
    sessionId = null;
    clearQueue();
    return;
  }
  if (active && sessionId === null) openSession();
}

export function flushTelemetry(): void {
  if (flushing) return;
  if (loadQueue().length === 0) return;
  persistNow();
  flushing = true;
  drain(generation)
    .catch(() => {
      // Telemetry may never surface an unhandled rejection.
    })
    .finally(() => {
      flushing = false;
    });
}

/** The leading run of events from one session, up to the per-request cap. */
function nextBatch(q: QueuedEvent[]): QueuedEvent[] {
  if (q.length === 0) return [];
  const sid = q[0].sid;
  const batch: QueuedEvent[] = [];
  for (const event of q) {
    if (event.sid !== sid || batch.length >= MAX_PER_REQUEST) break;
    batch.push(event);
  }
  return batch;
}

/** Removes exactly the events that were in flight — the queue may have grown,
 *  or been trimmed from the front, while the request ran. */
function discard(batch: QueuedEvent[]): void {
  if (queue === null) return;
  const sent = new Set(batch);
  queue = queue.filter((event) => !sent.has(event));
  persistNow();
}

type SendOutcome = 'sent' | 'drop' | 'keep';

async function readToken(): Promise<string | null> {
  try {
    return await secureStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

async function drain(startedIn: number): Promise<void> {
  for (let i = 0; i < MAX_REQUESTS_PER_FLUSH; i += 1) {
    if (generation !== startedIn || !isTelemetryEnabled()) return;
    if (loadQueue().length === 0) return;
    // Read per request, never once per drain: the token must belong to the
    // same signed-in run as the events it is sent with.
    const token = await readToken();
    if (generation !== startedIn || !isTelemetryEnabled()) return;
    // No token: keep everything. Sign-out clears the queue itself.
    if (!token) return;
    // Taken after the await, so it includes whatever was tracked meanwhile.
    const batch = nextBatch(loadQueue());
    if (batch.length === 0) return;
    const outcome = await send(token, batch);
    if (generation !== startedIn) return; // the queue was cleared meanwhile
    if (outcome === 'keep') return; // retried on the next scheduled flush
    discard(batch);
  }
}

async function send(token: string, batch: QueuedEvent[]): Promise<SendOutcome> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
  unref(timeout);
  try {
    const response = await fetch(`${API_BASE_URL}/telemetry/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        platform: Platform.OS,
        sessionId: batch[0].sid,
        events: batch.map(({ name, screen, props, ts }) =>
          screen === undefined ? { name, props, ts } : { name, screen, props, ts },
        ),
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (response.ok) return 'sent';
    // Expired token: dropped, like web — telemetry must never force a refresh.
    if (response.status === 401) return 'drop';
    // Any other 4xx (but a timeout or a throttle) will be refused identically
    // next time, and would otherwise block every event behind it until the cap
    // evicted it.
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
      return 'drop';
    }
    return 'keep';
  } catch {
    // Offline, a network error or the timeout: keep it. No log — telemetry
    // never degrades the product.
    return 'keep';
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}
