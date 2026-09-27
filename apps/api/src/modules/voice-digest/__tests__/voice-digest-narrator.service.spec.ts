import { ConfigService } from '@nestjs/config';
import { VoiceDigestNarratorService, type OpenAIChatLike } from '../voice-digest-narrator.service';
import { fallbackText } from '../digest-text.util';
import type { DigestFacts } from '../digest-facts.util';

const FACTS: DigestFacts = {
  currency: 'PLN',
  weekTotal: 500,
  usualWeek: 400,
  changePct: 25,
  topRise: { category: 'Groceries', changePct: 30 },
  safeToSpendToday: 40,
  daysToIncome: 5,
  shieldItem: { name: 'Milk', monthlyChangePct: 6 },
  restock: ['Bread'],
  realChangePct: -3,
};

function fakeOpenAI(content: string | null, opts?: { throws?: Error }): OpenAIChatLike {
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          if (opts?.throws) throw opts.throws;
          return { choices: [{ message: { content } }] };
        }),
      },
    },
  };
}

function configWithKey(key: string | undefined): ConfigService {
  return { get: () => key } as unknown as ConfigService;
}

describe('VoiceDigestNarratorService.narrate', () => {
  it('returns the model text with usedModel:true when it is faithful to the facts', async () => {
    const openai = fakeOpenAI('You spent 500 PLN this week, 25% above usual.');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: 'You spent 500 PLN this week, 25% above usual.', usedModel: true });
  });

  it('falls back when the model text invents a number not in the facts', async () => {
    const openai = fakeOpenAI('You spent 999 PLN this week.');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: fallbackText(FACTS, 'en'), usedModel: false });
  });

  it('falls back when the OpenAI call throws', async () => {
    const openai = fakeOpenAI(null, { throws: new Error('rate limited') });
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: fallbackText(FACTS, 'en'), usedModel: false });
  });

  it('falls back on an empty model response', async () => {
    const openai = fakeOpenAI('');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: fallbackText(FACTS, 'en'), usedModel: false });
  });

  it('falls back on a whitespace-only model response', async () => {
    const openai = fakeOpenAI('   \n  ');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: fallbackText(FACTS, 'en'), usedModel: false });
  });

  it('falls back when the model text exceeds 1200 characters', async () => {
    const longText = 'You spent 500 PLN this week. '.repeat(50); // well over 1200 chars, still faithful
    const openai = fakeOpenAI(longText);
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    const result = await svc.narrate(FACTS, 'en');
    expect(result).toEqual({ text: fallbackText(FACTS, 'en'), usedModel: false });
  });

  it('degrades to fallback with no OpenAI call at all when OPENAI_API_KEY is unset', async () => {
    const svc = new VoiceDigestNarratorService(configWithKey(undefined));
    const result = await svc.narrate(FACTS, 'pl');
    expect(result).toEqual({ text: fallbackText(FACTS, 'pl'), usedModel: false });
  });

  it('sends the facts as JSON in the user message and never a user id or name', async () => {
    const openai = fakeOpenAI('You spent 500 PLN this week, 25% above usual.');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    await svc.narrate(FACTS, 'en');
    const call = (openai.chat.completions.create as jest.Mock).mock.calls[0][0];
    const userMessage = call.messages.find((m: { role: string }) => m.role === 'user');
    expect(JSON.parse(userMessage.content)).toEqual(FACTS);
    const fullPrompt = JSON.stringify(call);
    expect(fullPrompt).not.toMatch(/userId|accountId|@/i);
  });

  it('names the language in the system prompt for a non-English lang code', async () => {
    const openai = fakeOpenAI('Wydałeś 500 PLN w tym tygodniu, to o 25% więcej niż zwykle.');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    await svc.narrate(FACTS, 'ua');
    const call = (openai.chat.completions.create as jest.Mock).mock.calls[0][0];
    const systemMessage = call.messages.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage.content).toMatch(/Ukrainian/);
  });

  it('passes CHEAP_MODEL, temperature 0.3 and max_tokens 350', async () => {
    const openai = fakeOpenAI('You spent 500 PLN this week, 25% above usual.');
    const svc = new VoiceDigestNarratorService(configWithKey('key'), openai);
    await svc.narrate(FACTS, 'en');
    const call = (openai.chat.completions.create as jest.Mock).mock.calls[0][0];
    expect(call.model).toBe('gpt-4o-mini');
    expect(call.temperature).toBe(0.3);
    expect(call.max_tokens).toBe(350);
  });
});
