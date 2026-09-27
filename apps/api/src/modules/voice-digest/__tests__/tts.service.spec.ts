import { ConfigService } from '@nestjs/config';
import { TtsService, type OpenAISpeechLike } from '../tts.service';

function fakeOpenAI(bytes: Uint8Array | null, opts?: { throws?: Error }): OpenAISpeechLike {
  return {
    audio: {
      speech: {
        create: jest.fn().mockImplementation(async () => {
          if (opts?.throws) throw opts.throws;
          return {
            arrayBuffer: async () => (bytes ?? new Uint8Array()).buffer,
          };
        }),
      },
    },
  };
}

function configWithKey(key: string | undefined): ConfigService {
  return { get: () => key } as unknown as ConfigService;
}

describe('TtsService.synthesize', () => {
  it('returns a Buffer built from the fake client arrayBuffer', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const openai = fakeOpenAI(bytes);
    const svc = new TtsService(configWithKey('key'), openai);
    const result = await svc.synthesize('hello there', 'en');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toEqual(Buffer.from(bytes));
  });

  it('calls audio.speech.create with the fixed model/voice/format', async () => {
    const openai = fakeOpenAI(new Uint8Array([1]));
    const svc = new TtsService(configWithKey('key'), openai);
    await svc.synthesize('hello there', 'en');
    const call = (openai.audio.speech.create as jest.Mock).mock.calls[0][0];
    expect(call.model).toBe('gpt-4o-mini-tts');
    expect(call.voice).toBe('alloy');
    expect(call.input).toBe('hello there');
    expect(call.response_format).toBe('opus');
  });

  it('caps input at 1500 characters', async () => {
    const openai = fakeOpenAI(new Uint8Array([1]));
    const svc = new TtsService(configWithKey('key'), openai);
    const longText = 'a'.repeat(2000);
    await svc.synthesize(longText, 'en');
    const call = (openai.audio.speech.create as jest.Mock).mock.calls[0][0];
    expect(call.input.length).toBe(1500);
  });

  it('returns null when the client throws', async () => {
    const openai = fakeOpenAI(null, { throws: new Error('tts down') });
    const svc = new TtsService(configWithKey('key'), openai);
    const result = await svc.synthesize('hello', 'en');
    expect(result).toBeNull();
  });

  it('returns null with no call at all when OPENAI_API_KEY is unset', async () => {
    const svc = new TtsService(configWithKey(undefined));
    const result = await svc.synthesize('hello', 'en');
    expect(result).toBeNull();
  });
});
