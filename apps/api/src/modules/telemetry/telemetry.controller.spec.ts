import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { ClientErrorsService } from './client-errors.service';

describe('TelemetryController', () => {
  function makeController(ingest = jest.fn().mockResolvedValue({ accepted: 0 })) {
    const service = { ingest } as unknown as TelemetryService;
    const report = jest.fn().mockResolvedValue(undefined);
    const clientErrors = { report } as unknown as ClientErrorsService;
    return { controller: new TelemetryController(service, clientErrors), ingest, report };
  }

  it('reports a client error under the token user, resolving with no body', async () => {
    const { controller, report } = makeController();
    const dto = { platform: 'android', appVersion: '1.42.0', message: 'boom', fatal: false };

    await expect(
      controller.reportClientError({ user: { id: 'user-1' } } as never, dto as never),
    ).resolves.toBeUndefined();

    expect(report).toHaveBeenCalledWith('user-1', dto);
  });

  it('takes the user from the request, not the body', async () => {
    const { controller, ingest } = makeController();

    await controller.ingest(
      { user: { id: 'user-1' } } as never,
      { platform: 'web', sessionId: 's', events: [] } as never,
    );

    expect(ingest).toHaveBeenCalledWith('user-1', expect.objectContaining({ platform: 'web' }));
  });

  it('resolves with no body even when every event was dropped', async () => {
    const { controller } = makeController(jest.fn().mockResolvedValue({ accepted: 0 }));

    await expect(
      controller.ingest(
        { user: { id: 'user-1' } } as never,
        { platform: 'web', sessionId: 's', events: [{ name: 'nonsense' }] } as never,
      ),
    ).resolves.toBeUndefined();
  });
});
