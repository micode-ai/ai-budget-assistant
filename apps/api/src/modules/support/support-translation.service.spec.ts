const createMock = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: createMock } } })),
}));

import OpenAI from 'openai';
import { SupportTranslationService } from './support-translation.service';

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe('SupportTranslationService', () => {
  let usage: { logUsageWithoutLimit: jest.Mock };
  let service: SupportTranslationService;

  beforeEach(() => {
    createMock.mockReset();
    usage = { logUsageWithoutLimit: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue('key') };
    service = new SupportTranslationService(config as never, usage as never);
  });

  it('builds the OpenAI client with a short timeout and one retry', () => {
    expect(OpenAI).toHaveBeenLastCalledWith({ apiKey: 'key', timeout: 15_000, maxRetries: 1 });
  });

  it('translates and logs usage', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"pl","translation":"Привет"}'));
    await expect(service.translate('Cześć', 'ru', 'u1')).resolves.toEqual({ detectedLang: 'pl', translation: 'Привет' });
    expect(usage.logUsageWithoutLimit).toHaveBeenCalledWith('u1', 'support_translation', 0.5);
  });

  it('returns null translation when already in target language', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"ru","translation":"Привет"}'));
    await expect(service.translate('Привет', 'ru', 'u1')).resolves.toEqual({ detectedLang: 'ru', translation: null });
  });

  it('returns null translation for pt text with br target', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"pt","translation":"Olá"}'));
    await expect(service.translate('Olá', 'br', 'u1')).resolves.toEqual({ detectedLang: 'pt', translation: null });
  });

  it('normalises region codes', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"PT-BR","translation":"Olá"}'));
    await expect(service.translate('Olá', 'br', 'u1')).resolves.toEqual({ detectedLang: 'pt', translation: null });
  });

  it('returns und on OpenAI failure, no usage logged', async () => {
    createMock.mockRejectedValue(new Error('boom'));
    await expect(service.translate('x', 'ru', 'u1')).resolves.toEqual({ detectedLang: 'und', translation: null });
    expect(usage.logUsageWithoutLimit).not.toHaveBeenCalled();
  });

  it('returns und on invalid JSON', async () => {
    createMock.mockResolvedValue(reply('not json'));
    await expect(service.translate('x', 'ru', 'u1')).resolves.toEqual({ detectedLang: 'und', translation: null });
  });

  it('keeps the translation when usage logging fails', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"pl","translation":"Привет"}'));
    usage.logUsageWithoutLimit.mockRejectedValue(new Error('db'));
    await expect(service.translate('Cześć', 'ru', 'u1')).resolves.toEqual({ detectedLang: 'pl', translation: 'Привет' });
  });

  it('uses json_schema, no tools, and keeps user text out of the system message', async () => {
    createMock.mockResolvedValue(reply('{"detectedLang":"pl","translation":"x"}'));
    await service.translate('SECRET-TEXT', 'ru', 'u1');
    const req = createMock.mock.calls[0][0];
    expect(req.tools).toBeUndefined();
    expect(req.response_format.type).toBe('json_schema');
    const system = req.messages.find((m: any) => m.role === 'system');
    const user = req.messages.find((m: any) => m.role === 'user');
    expect(system.content).not.toContain('SECRET-TEXT');
    expect(user.content).toBe('<text>SECRET-TEXT</text>');
  });
});
