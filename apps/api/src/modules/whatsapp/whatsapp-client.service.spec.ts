import { ConfigService } from '@nestjs/config';
import { WhatsAppClientService, WhatsAppGraphError } from './whatsapp-client.service';

/** Minimal fetch Response stand-in — only what WhatsAppClientService reads. */
function fakeResponse(ok: boolean, status: number, bodyText: string, jsonBody?: unknown) {
  return {
    ok,
    status,
    text: jest.fn().mockResolvedValue(bodyText),
    json: jest.fn().mockResolvedValue(jsonBody),
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: 'token-123',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-1',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

describe('WhatsAppClientService — Graph error parsing (ABA voice-digest Task 8)', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws a WhatsAppGraphError carrying the parsed numeric code on a failed send', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, 400, JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } })),
    );
    const client = new WhatsAppClientService(makeConfig());

    await expect(client.sendText('+1234567890', 'hi')).rejects.toMatchObject({
      code: 131047,
      status: 400,
    });
    await expect(client.sendText('+1234567890', 'hi')).rejects.toBeInstanceOf(WhatsAppGraphError);
  });

  it('leaves code null when the error body is not parseable JSON', async () => {
    fetchMock.mockResolvedValue(fakeResponse(false, 500, 'Internal Server Error'));
    const client = new WhatsAppClientService(makeConfig());

    await expect(client.sendText('+1234567890', 'hi')).rejects.toMatchObject({ code: null, status: 500 });
  });

  it('does not throw on a successful send', async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, 200, ''));
    const client = new WhatsAppClientService(makeConfig());

    await expect(client.sendText('+1234567890', 'hi')).resolves.toBeUndefined();
  });

  it('send methods return the wamid the Graph API echoes back', async () => {
    const graphOk = {
      messaging_product: 'whatsapp',
      contacts: [{ input: '1234567890', wa_id: '1234567890' }],
      messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MBUCABEYEjQ=' }],
    };
    fetchMock.mockResolvedValue(fakeResponse(true, 200, JSON.stringify(graphOk), graphOk));
    const client = new WhatsAppClientService(makeConfig());

    await expect(client.sendText('+1234567890', 'hi')).resolves.toBe('wamid.HBgLMTIzNDU2Nzg5MBUCABEYEjQ=');
    await expect(client.sendAudio('+1234567890', 'media-1')).resolves.toBe('wamid.HBgLMTIzNDU2Nzg5MBUCABEYEjQ=');
    await expect(client.sendTemplate('+1234567890', 'vd', 'en', 'vd--listen')).resolves.toBe(
      'wamid.HBgLMTIzNDU2Nzg5MBUCABEYEjQ=',
    );
  });

  it('uploadMedia posts multipart form data and returns the media id', async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, 200, '', { id: 'media-abc' }));
    const client = new WhatsAppClientService(makeConfig());

    const id = await client.uploadMedia(Buffer.from('audio-bytes'), 'audio/ogg', 'digest.ogg');

    expect(id).toBe('media-abc');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/phone-1/media');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('uploadMedia surfaces the Graph error code on failure', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(false, 401, JSON.stringify({ error: { code: 190, message: 'Invalid token' } })),
    );
    const client = new WhatsAppClientService(makeConfig());

    await expect(client.uploadMedia(Buffer.from('x'), 'audio/ogg', 'digest.ogg')).rejects.toMatchObject({
      code: 190,
    });
  });

  it('sendTemplate posts a quick-reply template payload', async () => {
    fetchMock.mockResolvedValue(fakeResponse(true, 200, ''));
    const client = new WhatsAppClientService(makeConfig());

    await client.sendTemplate('+1234567890', 'voice_digest_ready', 'uk', 'vd--listen');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      type: 'template',
      template: {
        name: 'voice_digest_ready',
        language: { code: 'uk' },
        components: [
          {
            type: 'button',
            sub_type: 'quick_reply',
            index: '0',
            parameters: [{ type: 'payload', payload: 'vd--listen' }],
          },
        ],
      },
    });
  });
});
