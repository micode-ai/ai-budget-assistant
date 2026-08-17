/**
 * Vertical layout for the PDF report's transaction table.
 *
 * Extracted from `PdfGenerator` so the arithmetic is testable without rendering:
 * the reported defect was a **fixed** `ty += 14` step while the description cell
 * wraps inside its 170pt column, so a two-line description printed its second
 * line on top of the next transaction. Rows must advance by their own measured
 * height, and a row that would not fit must start the next page instead of
 * running under the footer.
 *
 * `measure` returns the tallest cell in the row; the caller owns the font, since
 * only it can ask PDFKit for `heightOfString`.
 */

export interface RowLayoutOptions {
  /** y of the first row. */
  startY: number;
  /** Height of a row whose cells all fit on one line. */
  minHeight: number;
  /** A row must END at or above this y (the page footer sits below it). */
  pageBottom: number;
  /** y of the first row on a freshly added page. */
  pageTopY: number;
}

export interface PlannedRow<T> {
  row: T;
  y: number;
  /** 0-based; every increment means the caller must call `addPage()` first. */
  page: number;
  height: number;
}

export function planTransactionRows<T>(
  rows: T[],
  measure: (row: T) => number,
  opts: RowLayoutOptions,
): PlannedRow<T>[] {
  const planned: PlannedRow<T>[] = [];
  let y = opts.startY;
  let page = 0;

  for (const row of rows) {
    const measured = measure(row);
    // A non-finite measurement (a broken font metric) must not poison the
    // layout: every NaN comparison is false, so it would silently stack rows.
    const height = Math.max(opts.minHeight, Number.isFinite(measured) ? measured : 0);

    if (y + height > opts.pageBottom && y !== opts.pageTopY) {
      page += 1;
      y = opts.pageTopY;
    }

    planned.push({ row, y, page, height });
    y += height;
  }

  return planned;
}
