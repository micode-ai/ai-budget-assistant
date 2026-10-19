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
  platform: 'web';
  /** Random per app load, memory only — no cross-session identifier exists. */
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
  /** Sessions and users per device class across the whole window, unfiltered. */
  formFactors: TelemetryFormFactorRow[];
  flows: TelemetryFunnelRow[];
  /** Most-viewed screens in the window. */
  screens: TelemetryScreenRow[];
  /** The screen each session ended on, most frequent first — where people leave. */
  lastScreens: TelemetryScreenRow[];
}
