const createMock = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

import { StatementAiService } from './statement-ai.service';
import * as validator from './statement-ai.validator';

const config = { get: (k: string) => (k === 'OPENAI_API_KEY' ? 'test-key' : undefined) } as any;
const HEADERS = ['Data', 'Kwota', 'Opis'];
const reply = (content: string) => ({ choices: [{ message: { content } }] });

const validMapping = JSON.stringify({
  date: 'Data', amount: 'Kwota', description: 'Opis',
  amountFormat: 'polish', dateFormat: 'auto', bankLabel: 'mBank',
});

describe('StatementAiService', () => {
  let service: StatementAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StatementAiService(config);
  });

  describe('inferMapping', () => {
    it('returns a validated mapping', async () => {
      createMock.mockResolvedValue(reply(validMapping));
      const result = await service.inferMapping(HEADERS, [['2026-01-01', '-12,00', 'Sklep']]);
      expect(result?.mapping).toEqual({ date: 'Data', amount: 'Kwota', description: 'Opis' });
      expect(result?.bankLabel).toBe('mBank');
    });

    it('returns null when the model invents a column', async () => {
      createMock.mockResolvedValue(reply(JSON.stringify({
        date: 'Transaction Date', amount: 'Kwota', description: 'Opis',
        amountFormat: 'polish', dateFormat: 'auto',
      })));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null when the model declines with {}', async () => {
      createMock.mockResolvedValue(reply('{}'));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null and does not throw when the API errors', async () => {
      createMock.mockRejectedValue(new Error('502 Bad Gateway'));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('returns null when the response has no content', async () => {
      createMock.mockResolvedValue({ choices: [] });
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
    });

    it('makes exactly one API call', async () => {
      createMock.mockResolvedValue(reply(validMapping));
      await service.inferMapping(HEADERS, []);
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('returns null instead of throwing when validateMappingResponse throws', async () => {
      const spy = jest
        .spyOn(validator, 'validateMappingResponse')
        .mockImplementation(() => {
          throw new Error('validator exploded');
        });
      createMock.mockResolvedValue(reply(validMapping));
      await expect(service.inferMapping(HEADERS, [])).resolves.toBeNull();
      spy.mockRestore();
    });
  });

  describe('extractRows', () => {
    const page = (n: number) => JSON.stringify({
      rows: [{ date: `2026-01-0${n}`, amount: -n, currencyCode: 'PLN', description: `row${n}` }],
    });

    it('concatenates rows from every page', async () => {
      createMock.mockResolvedValueOnce(reply(page(1))).mockResolvedValueOnce(reply(page(2)));
      const rows = await service.extractRows(['page one', 'page two']);
      expect(rows.map((r) => r.description)).toEqual(['row1', 'row2']);
      expect(createMock).toHaveBeenCalledTimes(2);
    });

    it('keeps the pages that succeeded when one page fails', async () => {
      createMock.mockResolvedValueOnce(reply(page(1))).mockRejectedValueOnce(new Error('timeout'));
      const rows = await service.extractRows(['page one', 'page two']);
      expect(rows.map((r) => r.description)).toEqual(['row1']);
    });

    it('returns an empty array when every page fails', async () => {
      createMock.mockRejectedValue(new Error('down'));
      await expect(service.extractRows(['a', 'b'])).resolves.toEqual([]);
    });

    it('skips blank pages without calling the API', async () => {
      createMock.mockResolvedValue(reply(page(1)));
      await service.extractRows(['   ', 'real page']);
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('keeps rows from pages that validated when a later page throws during validation', async () => {
      createMock.mockResolvedValueOnce(reply(page(1))).mockResolvedValueOnce(reply(page(2)));
      // Capture the real implementation BEFORE spying replaces the module
      // property — `validator` is the live, un-mocked module object here (we
      // never jest.mock'd this file), so calling `validator.validateExtractedRows`
      // from inside a mockImplementationOnce would recurse into the spy itself.
      const realValidateExtractedRows = validator.validateExtractedRows;
      const spy = jest
        .spyOn(validator, 'validateExtractedRows')
        .mockImplementationOnce((raw: string) => realValidateExtractedRows(raw))
        .mockImplementationOnce(() => {
          throw new Error('validator exploded');
        });
      const rows = await service.extractRows(['page one', 'page two']);
      expect(rows.map((r) => r.description)).toEqual(['row1']);
      spy.mockRestore();
    });
  });

  describe('isEnabled', () => {
    it('is false without an API key', () => {
      const noKey = new StatementAiService({ get: () => undefined } as any);
      expect(noKey.isEnabled()).toBe(false);
    });

    it('is true with an API key', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });
});
