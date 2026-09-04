import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IngestTelemetryDto } from './dto';
import { sanitizeEvents, FUNNEL_STATUSES, FunnelStatus } from './telemetry.validator';
import type {
  TelemetryFunnelResponse,
  TelemetryFunnelRow,
  TelemetryScreenRow,
} from '@budget/shared-types';

const KNOWN_PLATFORMS = new Set(['web', 'ios', 'android']);
const SESSION_ID_MAX = 64;
const MAX_WINDOW_DAYS = 90; // never longer than what retention keeps

/**
 * Hard ceiling on rows materialised for one funnel request.
 *
 * `getFunnel` aggregates in JS (see the note on the method), so every row in
 * the window becomes a JS object. At ~100 daily web users navigating ~200 times
 * each, a 90-day window is ~1.8M rows against this container's
 * `NODE_OPTIONS=--max-old-space-size=768` — and an OOM here kills the whole
 * API, not just an admin page. Exactly this pattern already OOM-killed this
 * container once: the backup export used to serialise a full account snapshot
 * in memory (see the ABA-163 API-memory note in CLAUDE.md).
 *
 * 200k rows is roughly 20-40 MB of these narrow objects — comfortable — while
 * still covering far more traffic than the channel has today. When it is hit
 * the response says so (`truncated`) rather than reporting a partial funnel as
 * if it were the whole window.
 */
const MAX_FUNNEL_ROWS = 200_000;

const FUNNEL_STATUS_SET: ReadonlySet<string> = new Set(FUNNEL_STATUSES);

export { MAX_FUNNEL_ROWS };

@Injectable()
export class TelemetryService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(userId: string, dto: IngestTelemetryDto): Promise<{ accepted: number }> {
    const events = sanitizeEvents(dto.events);
    if (events.length === 0) return { accepted: 0 };

    const platform = KNOWN_PLATFORMS.has(dto.platform) ? dto.platform : 'unknown';
    const sessionId = String(dto.sessionId ?? '').slice(0, SESSION_ID_MAX);

    await this.prisma.telemetryEvent.createMany({
      data: events.map((event) => ({
        userId,
        name: event.name,
        screen: event.screen,
        platform,
        sessionId,
        props: event.props ?? undefined,
      })),
    });

    return { accepted: events.length };
  }

  /**
   * Aggregated in JS rather than SQL: `props` is Json, so grouping by
   * `props->>'flow'` would need raw SQL, and the row volume inside a 90-day
   * window is bounded by retention. Flow insertion order is preserved so the
   * flow a user hits first reads first.
   */
  async getFunnel(
    days: number,
    maxRows: number = MAX_FUNNEL_ROWS,
  ): Promise<TelemetryFunnelResponse> {
    const window = Math.min(Math.max(Math.trunc(days) || 30, 1), MAX_WINDOW_DAYS);
    const since = new Date(Date.now() - window * 86_400_000);

    // `take` is not optional: see MAX_FUNNEL_ROWS. `desc` so that when the
    // ceiling bites we keep the NEWEST rows — a funnel of the last three weeks
    // of a 90-day window is useful; the first three weeks are not. It also
    // leaves the per-session last-screen fold correct, since dropping the
    // oldest rows cannot change which screen a session ended on.
    const rows = await this.prisma.telemetryEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { name: true, screen: true, props: true, sessionId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: maxRows,
    });
    const truncated = rows.length >= maxRows;

    const flows = new Map<string, TelemetryFunnelRow>();
    const screens = new Map<string, number>();
    // The latest screen_view seen per session, so far.
    const lastPerSession = new Map<string, { screen: string; at: number }>();

    for (const row of rows) {
      if (row.name === 'screen_view') {
        if (!row.screen) continue;
        screens.set(row.screen, (screens.get(row.screen) ?? 0) + 1);
        const at = row.createdAt.getTime();
        const seen = lastPerSession.get(row.sessionId);
        if (!seen || at >= seen.at) lastPerSession.set(row.sessionId, { screen: row.screen, at });
        continue;
      }
      if (row.name !== 'action') continue;
      const props = (row.props ?? {}) as Record<string, unknown>;
      const flow = typeof props.flow === 'string' ? props.flow : null;
      const status =
        typeof props.status === 'string' && FUNNEL_STATUS_SET.has(props.status)
          ? (props.status as FunnelStatus)
          : null;
      if (!flow || !status) continue;
      const entry = flows.get(flow) ?? { flow, started: 0, completed: 0, abandoned: 0, failed: 0 };
      entry[status] += 1;
      flows.set(flow, entry);
    }

    const lastScreens = new Map<string, number>();
    for (const { screen } of lastPerSession.values()) {
      lastScreens.set(screen, (lastScreens.get(screen) ?? 0) + 1);
    }

    const byViewsDesc = (counts: Map<string, number>): TelemetryScreenRow[] =>
      Array.from(counts.entries())
        .map(([screen, views]) => ({ screen, views }))
        .sort((a, b) => b.views - a.views);

    return {
      days: window,
      truncated,
      flows: Array.from(flows.values()),
      screens: byViewsDesc(screens),
      lastScreens: byViewsDesc(lastScreens),
    };
  }
}
