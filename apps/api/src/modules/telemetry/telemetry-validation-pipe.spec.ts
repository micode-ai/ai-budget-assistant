import { ValidationPipe } from '@nestjs/common';
import { IngestTelemetryDto } from './dto';
import { sanitizeEvents } from './telemetry.validator';

/**
 * Empirical check, not an argument: `IngestTelemetryDto.events` is typed
 * `unknown[]` with no `@ValidateNested()`/`@Type()`, so the theory is that
 * class-validator never recurses into its elements — which is what lets an
 * event carrying a prop key `sanitizeEvents` doesn't know about survive the
 * global pipe intact instead of being stripped by `whitelist` or turned into
 * a 400 by `forbidNonWhitelisted`. That theory is the whole basis of the
 * "drop, don't reject" design this module's tests otherwise take for
 * granted. If it were wrong, a client one version ahead of the server would
 * 400 its entire batch on the first unrecognised field, and no unit test of
 * `TelemetryService`/`sanitizeEvents` alone — both of which are exercised
 * only after the pipe has already run — would ever catch it. So this is
 * proven by actually running the exact pipe config `main.ts` installs
 * globally, not by re-stating the theory.
 *
 * The 40/200/10000 boundaries here are the other half of the same design:
 * the DTO's `@ArrayMaxSize`/`@MaxLength` are a transport ceiling meant only
 * to reject a payload that could not plausibly be this client (see the
 * comment in `dto/index.ts`), while the real 40-event cap is enforced by
 * `sanitizeEvents` after the pipe — so a batch between the client's own
 * contract (40) and the transport ceiling (200) must still pass the pipe.
 *
 * One more thing running the real pipe surfaced that re-stating the theory
 * never would have: with `transformOptions.enableImplicitConversion: true`
 * and no `@Type()` on `events`, class-transformer wraps each array element
 * in a bare `Array` instance instead of leaving it a plain object (TS erases
 * `unknown[]`'s element type to a generic `Array` at the metadata level, and
 * class-transformer falls back to that same reflected type per element). The
 * element's own keys (`name`, `screen`, `somethingNew`, …) are still there —
 * ordinary property access and `sanitizeEvents`' own field-by-field reads see
 * them exactly as sent — but `Array` semantics mean `.length` stays 0 and
 * `JSON.stringify`/`toEqual` against a plain-object literal both disagree,
 * because JSON only serialises index-keyed entries and `toEqual` treats an
 * `Array` and a `Object` as different types even with identical own keys.
 * So these tests assert on the fields the real code actually reads (and, for
 * the strongest guarantee, on `sanitizeEvents`' own output), not on deep
 * equality against the original plain-object literal.
 */
describe('IngestTelemetryDto under the global ValidationPipe', () => {
  // Mirrors apps/api/src/main.ts's app.useGlobalPipes(...) options exactly.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  function transform(payload: unknown) {
    return pipe.transform(payload, {
      type: 'body',
      metatype: IngestTelemetryDto,
      data: '',
    });
  }

  it('lets a well-formed 40-event batch through unchanged', async () => {
    const events = Array.from({ length: 40 }, (_, i) => ({
      name: 'screen_view',
      screen: `expense/${i}`,
    }));

    const result = (await transform({
      platform: 'web',
      sessionId: 'sess-1',
      events,
    })) as IngestTelemetryDto;

    expect(result).toBeInstanceOf(IngestTelemetryDto);
    expect(result.events).toHaveLength(40);
    result.events.forEach((event, i) => {
      expect((event as Record<string, unknown>).name).toBe('screen_view');
      expect((event as Record<string, unknown>).screen).toBe(`expense/${i}`);
    });
    // The guarantee that actually matters: TelemetryService's own call
    // recovers all 40 clean events from whatever the pipe handed back.
    expect(sanitizeEvents(result.events)).toHaveLength(40);
  });

  it('leaves an event carrying an unknown property intact — the pipe must not recurse into events', async () => {
    const eventWithExtra = {
      name: 'action',
      props: { flow: 'expense_manual', status: 'completed' },
      somethingNew: 'x',
    };

    const result = (await transform({
      platform: 'web',
      sessionId: 'sess-1',
      events: [eventWithExtra],
    })) as IngestTelemetryDto;

    const event = result.events[0] as Record<string, unknown>;
    expect(event.name).toBe('action');
    expect(event.props).toEqual({ flow: 'expense_manual', status: 'completed' });
    expect(event.somethingNew).toBe('x');
    // sanitizeEvents recovers exactly the allow-listed fields and silently
    // drops the one it doesn't know — the whole point of the design, proven
    // end-to-end through the exact pipe config production runs.
    expect(sanitizeEvents(result.events)).toEqual([
      { name: 'action', screen: null, props: { flow: 'expense_manual', status: 'completed' } },
    ]);
  });

  it("passes a 60-event batch through — truncation is sanitizeEvents' job, not the pipe's", async () => {
    const events = Array.from({ length: 60 }, () => ({ name: 'session_start' }));

    const result = (await transform({
      platform: 'web',
      sessionId: 'sess-1',
      events,
    })) as IngestTelemetryDto;

    expect(result.events).toHaveLength(60);
  });

  it('rejects a 10,000-event batch outright', async () => {
    const events = Array.from({ length: 10000 }, () => ({ name: 'session_start' }));

    await expect(
      transform({
        platform: 'web',
        sessionId: 'sess-1',
        events,
      }),
    ).rejects.toThrow();
  });

  it('lets a 100-character sessionId through — the service truncates it, not the pipe', async () => {
    const sessionId = 'x'.repeat(100);

    const result = (await transform({
      platform: 'web',
      sessionId,
      events: [{ name: 'session_start' }],
    })) as IngestTelemetryDto;

    expect(result.sessionId).toBe(sessionId);
    expect(result.sessionId).toHaveLength(100);
  });
});
