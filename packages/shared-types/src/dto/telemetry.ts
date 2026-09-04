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
  flows: TelemetryFunnelRow[];
  /** Most-viewed screens in the window. */
  screens: TelemetryScreenRow[];
  /** The screen each session ended on, most frequent first — where people leave. */
  lastScreens: TelemetryScreenRow[];
}
