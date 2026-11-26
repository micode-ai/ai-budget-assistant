import { AiHelpToolsService } from './ai-help-tools.service';
import { AI_TOOL_DEFINITIONS, AI_WRITE_ACTION_TYPES } from './ai-tool-schemas';

describe('AiHelpToolsService', () => {
  const svc = new AiHelpToolsService();

  it('returns matches with deep links and no account data', async () => {
    const r = await svc.executeSearchHelp({ query: 'inflation shield', language: 'en' });
    expect(r.success).toBe(true);
    const matches = (r.data as any).matches;
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].deepLink).toMatch(/^\/help\//);
  });

  it('answers in the injected language', async () => {
    const r = await svc.executeSearchHelp({ query: 'как разделить чек', language: 'ru' });
    expect((r.data as any).matches.length).toBeGreaterThan(0);
    expect((r.data as any).language).toBe('ru');
  });

  it('returns an honest empty result for gibberish and a missing query', async () => {
    const r = await svc.executeSearchHelp({ query: 'zzqqxxyy' });
    expect((r.data as any).matches).toEqual([]);
    expect((r.data as any).note).toMatch(/No help article/);
    expect(((await svc.executeSearchHelp({})).data as any).matches).toEqual([]);
  });

  it('is registered as a read tool (not a write action)', () => {
    expect(AI_TOOL_DEFINITIONS.some((t: any) => t.function.name === 'search_help')).toBe(true);
    expect((AI_WRITE_ACTION_TYPES as readonly string[]).includes('search_help')).toBe(false);
  });
});
