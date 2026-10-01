export const MAX_SAMPLE_ROWS = 10;
export const MAX_CELL_CHARS = 80;

const truncate = (cell: string): string =>
  cell.length > MAX_CELL_CHARS ? cell.slice(0, MAX_CELL_CHARS) : cell;

/**
 * Ask the model to MAP columns, never to read values. The response is
 * validated against this exact `headers` array by validateMappingResponse, so
 * the instruction below is a hint for accuracy, not the safety mechanism.
 */
export function buildMappingPrompt(headers: string[], sampleRows: string[][]): string {
  const rows = sampleRows
    .slice(0, MAX_SAMPLE_ROWS)
    .map((r) => r.map(truncate).join(' | '))
    .join('\n');

  return `You are given the header row and a few sample rows of a bank statement export.
Identify which column holds which piece of information.

HEADERS (choose your answers from exactly these strings, copied character for character):
${headers.map((h) => `- ${h}`).join('\n')}

SAMPLE ROWS (same column order as the headers):
${rows || '(none available)'}

Fields to fill:
- "date": the header of the transaction date column.
- "amount": the header of the signed amount column.
- "description": the header of the description / title column.
- "currency": the header of the currency column, or null if absent.
- "counterparty": the header of the merchant / counterparty column, or null if absent.
- "amountFormat": "polish" or "standard".
- "dateFormat": "auto", "DD.MM.YYYY", "DD-MM-YYYY" or "YYYY-MM-DD".
- "bankLabel": your best guess at the bank name, or null.

Rules:
- Every header you return must appear in the HEADERS list above, character for character. Do not translate, reformat, trim or invent one.
- If the file has separate debit and credit columns instead of one signed column, return "amount": { "debit": "<header>", "credit": "<header>" }.
- "polish" amountFormat means a comma decimal separator (1 234,56). "standard" means a dot (1,234.56).
- Prefer the column with the transaction (booking) date over a value or posting date when both exist.
- If you cannot identify the date, amount or description column with confidence, set "date", "amount" and "description" to null.`;
}

/**
 * PDF path: the model DOES emit values here, which is why this path is
 * Pro-gated and its output reconciled against the statement balance.
 */
export function buildExtractionPrompt(pageText: string): string {
  return `Extract every transaction from this page of a bank statement.

PAGE TEXT:
${pageText}

Each row has: "date" (YYYY-MM-DD), "amount" (e.g. -50.5), "currencyCode" (e.g. "PLN"), "description", "merchant".

Rules:
- "date" must be YYYY-MM-DD. Convert any other format you see.
- "amount" is a number, negative for money leaving the account and positive for money arriving. Use a dot decimal separator regardless of how the statement prints it.
- "currencyCode" is a 3-letter ISO code. Infer it from the statement if a row does not print one.
- "merchant" is null when the row has no clear counterparty.
- Include only real transaction rows. Skip balances, subtotals, page headers, footers and interest summaries.
- If the page contains no transactions, return an empty "rows" array.
- Never invent a transaction that is not printed on this page.`;
}

const NULLABLE_STRING = { type: ['string', 'null'] } as const;

/**
 * Strict structured-output schema for the column mapping. Header-valued fields
 * are enums of the file's actual headers, so the model cannot name a column
 * that does not exist (validateMappingResponse stays as defence). Falls back to
 * a plain string when there are no headers (an empty enum is invalid).
 */
export function buildMappingFormat(headers: string[]) {
  const unique = Array.from(new Set(headers));
  // Strict mode caps enums (500 values; 7500 chars once an enum has >250), so a
  // pathologically wide file degrades to a plain string - the validator still
  // rejects any header that is not in the file.
  const enumOk = unique.length > 0 && unique.length <= 200 && unique.join('').length <= 5000;
  const header = enumOk ? { type: 'string', enum: unique } : { type: 'string' };
  const nullableHeader = { anyOf: [header, { type: 'null' }] };
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'statement_column_mapping',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'amount', 'description', 'currency', 'counterparty', 'amountFormat', 'dateFormat', 'bankLabel'],
        properties: {
          date: nullableHeader,
          amount: {
            anyOf: [
              header,
              {
                type: 'object',
                additionalProperties: false,
                required: ['debit', 'credit'],
                properties: { debit: header, credit: header },
              },
              { type: 'null' },
            ],
          },
          description: nullableHeader,
          currency: nullableHeader,
          counterparty: nullableHeader,
          amountFormat: { type: 'string', enum: ['polish', 'standard'] },
          dateFormat: { type: 'string', enum: ['auto', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD'] },
          bankLabel: NULLABLE_STRING,
        },
      },
    },
  };
}

/** Strict structured-output schema for PDF row extraction. */
export const EXTRACTION_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'statement_rows',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['date', 'amount', 'currencyCode', 'description', 'merchant'],
            properties: {
              date: { type: 'string' },
              amount: { type: 'number' },
              currencyCode: { type: 'string' },
              description: { type: 'string' },
              merchant: NULLABLE_STRING,
            },
          },
        },
      },
    },
  },
};
