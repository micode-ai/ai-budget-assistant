import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryController', () => {
  function makeController(ingest = jest.fn().mockResolvedValue({ accepted: 0 })) {
    const service = { ingest } as unknown as TelemetryService;
    return { controller: new TelemetryController(service), ingest };
  }

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
