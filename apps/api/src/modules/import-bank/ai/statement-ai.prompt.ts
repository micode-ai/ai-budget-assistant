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

Reply with JSON only, no prose and no code fence:
{
  "date": "<header of the transaction date column>",
  "amount": "<header of the signed amount column>",
  "description": "<header of the description / title column>",
  "currency": "<header of the currency column, or omit if absent>",
  "counterparty": "<header of the merchant / counterparty column, or omit if absent>",
  "amountFormat": "polish" | "standard",
  "dateFormat": "auto" | "DD.MM.YYYY" | "DD-MM-YYYY" | "YYYY-MM-DD",
  "bankLabel": "<your best guess at the bank name, or omit>"
}

Rules:
- Every header you return must appear in the HEADERS list above, character for character. Do not translate, reformat, trim or invent one.
- If the file has separate debit and credit columns instead of one signed column, return "amount": { "debit": "<header>", "credit": "<header>" }.
- "polish" amountFormat means a comma decimal separator (1 234,56). "standard" means a dot (1,234.56).
- Prefer the column with the transaction (booking) date over a value or posting date when both exist.
- If you cannot identify the date, amount or description column with confidence, reply exactly: {}`;
}

/**
 * PDF path: the model DOES emit values here, which is why this path is
 * Pro-gated and its output reconciled against the statement balance.
 */
export function buildExtractionPrompt(pageText: string): string {
  return `Extract every transaction from this page of a bank statement.

PAGE TEXT:
${pageText}

Reply with JSON only, no prose and no code fence:
{ "rows": [ { "date": "YYYY-MM-DD", "amount": -50.5, "currencyCode": "PLN", "description": "...", "merchant": "..." } ] }

Rules:
- "date" must be YYYY-MM-DD. Convert any other format you see.
- "amount" is a number, negative for money leaving the account and positive for money arriving. Use a dot decimal separator regardless of how the statement prints it.
- "currencyCode" is a 3-letter ISO code. Infer it from the statement if a row does not print one.
- "merchant" is optional; omit it when the row has no clear counterparty.
- Include only real transaction rows. Skip balances, subtotals, page headers, footers and interest summaries.
- If the page contains no transactions, reply exactly: { "rows": [] }
- Never invent a transaction that is not printed on this page.`;
}
