import { ProjectSuggestionService, resolveProjectIndex } from './project-suggestion.service';

describe('resolveProjectIndex', () => {
  it('accepts in-range integers', () => {
    expect(resolveProjectIndex(0, 3)).toBe(0);
    expect(resolveProjectIndex(2, 3)).toBe(2);
  });
  it('rejects out-of-range, non-integer and non-number values', () => {
    expect(resolveProjectIndex(3, 3)).toBeNull();
    expect(resolveProjectIndex(-1, 3)).toBeNull();
    expect(resolveProjectIndex(1.5, 3)).toBeNull();
    expect(resolveProjectIndex('1', 3)).toBeNull();
    expect(resolveProjectIndex(null, 3)).toBeNull();
    expect(resolveProjectIndex(undefined, 3)).toBeNull();
  });
});

function makeService(answer: unknown) {
  const projects = [
    { id: 'p-a', name: 'Alpha', description: null, startDate: null, endDate: null, projectExpenses: [] },
    { id: 'p-b', name: 'Beta', description: null, startDate: null, endDate: null, projectExpenses: [] },
  ];
  const prisma: any = { project: { findMany: jest.fn().mockResolvedValue(projects) } };
  const embeddings: any = { matchProject: jest.fn().mockResolvedValue(null) };
  const service = new ProjectSuggestionService({ get: () => 'k' } as any, prisma, embeddings);
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(answer) } }] });
  (service as any).openai = { chat: { completions: { create } } };
  return { service, create };
}

describe('ProjectSuggestionService LLM step', () => {
  const expense = { description: 'cement bags', date: '2026-10-01' };

  it('maps projectIndex back to the project id and sends a numbered strict-schema prompt', async () => {
    const { service, create } = makeService({ projectIndex: 1, confidence: 0.9 });
    const res = await service.suggestProject('acc', expense);
    expect(res).toEqual({ projectId: 'p-b', projectName: 'Beta', confidence: 0.9 });
    const req = create.mock.calls[0][0];
    expect(req.response_format.type).toBe('json_schema');
    expect(req.messages[0].content).toContain('0: {"name":"Alpha"');
    expect(req.messages[0].content).not.toContain('p-a');
  });

  it('drops an out-of-range index', async () => {
    const { service } = makeService({ projectIndex: 7, confidence: 0.95 });
    expect(await service.suggestProject('acc', expense)).toBeNull();
  });

  it('drops null index and low confidence', async () => {
    expect(await makeService({ projectIndex: null, confidence: 0.9 }).service.suggestProject('acc', expense)).toBeNull();
    expect(await makeService({ projectIndex: 0, confidence: 0.4 }).service.suggestProject('acc', expense)).toBeNull();
  });
});
