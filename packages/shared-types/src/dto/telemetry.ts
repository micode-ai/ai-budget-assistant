/** A single client-emitted event. Every field is advisory: the server
 * allow-lists names, prop keys and prop values, and drops the rest. */
export interface TelemetryEventPayload {
  name: 'session_start' | 'screen_view' | 'action';
  screen?: string;
  props?: Record<string, string | number>;
  /** Client clock, advisory only — reporting uses the server's createdAt. */
  ts?: number;
}

export interface IngestTelemetryRequest {
  /** `Platform.OS`. The server stores anything else as `unknown`. */
  platform: 'web' | 'android' | 'ios';
  /** Random per session, never persisted as an identifier: per page load on
   *  web; per cold launch (or return after 30 min in background) on native. */
  sessionId: string;
  events: TelemetryEventPayload[];
}

export interface TelemetryFunnelRow {
  flow: string;
  started: number;
  completed: number;
  abandoned: number;
  failed: number;
}

export interface TelemetryFormFactorRow {
  /** `phone` | `tablet` | `desktop`, or `unknown` for sessions recorded before
   *  the web client stamped a device class. */
  formFactor: string;
  sessions: number;
  users: number;
  /** Sessions run from the installed PWA rather than a browser tab. */
  standaloneSessions: number;
}

export interface TelemetryScreenRow {
  screen: string;
  views: number;
}

/** One screen's reach in the window: how many distinct users opened it. */
export interface TelemetryScreenUsageRow {
  screen: string;
  users: number;
  views: number;
}

export interface TelemetryFunnelResponse {
  days: number;
  /**
   * The window held more rows than one funnel request will materialise, so
   * these figures cover only its most recent portion. Reported rather than
   * silently applied: a partial funnel presented as a complete one is worse
   * than a smaller window honestly labelled.
   */
  truncated: boolean;
  /**
   * Whether `ADMIN_EMAILS` accounts were left out. On by default: in the first
   * weeks one internal account held 82% of all web sessions, so an unfiltered
   * funnel mostly measured the team's own use.
   */
  internalExcluded: boolean;
  /** How many internal accounts the filter removed (0 when it is off). */
  excludedAccounts: number;
  /** Distinct signed-in users behind the figures below. */
  users: number;
  /** The device class the figures are filtered to, or null for every session (ABA-683). */
  formFactor: 'phone' | 'tablet' | 'desktop' | null;
  /** The client platform the figures are filtered to, or null for every platform. */
  platform: 'web' | 'android' | 'ios' | null;
  /** Sessions and users per device class across the whole window, NOT narrowed
   *  by the device filter (the platform filter does apply). */
  formFactors: TelemetryFormFactorRow[];
  flows: TelemetryFunnelRow[];
  /** Most-viewed screens in the window. */
  screens: TelemetryScreenRow[];
  /** Every screen with its distinct users and views, LEAST-used first — which
   *  screens nobody opens. */
  screenUsage: TelemetryScreenUsageRow[];
  /** The screen each session ended on, most frequent first — where people leave. */
  lastScreens: TelemetryScreenRow[];
}

/** `POST /telemetry/client-errors` (ABA-832): a render or global JS error from the app. */
export interface ReportClientErrorRequest {
  /** `Platform.OS`: `android` | `ios` | `web`. */
  platform: string;
  /** The same string the About screen shows: `1.42.0 (310)` native, `1.42.0+abc1234` web. */
  appVersion: string;
  message: string;
  stack?: string;
  /** React's component stack, for a render error caught by `ErrorBoundary`. */
  componentStack?: string;
  /** The route PATTERN (`expense/[id]`), never a resolved path. */
  route?: string;
  fatal: boolean;
  /** The app's i18n language code. */
  locale?: string;
}
