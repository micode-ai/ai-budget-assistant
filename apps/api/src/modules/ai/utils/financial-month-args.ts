/**
 * `get_expenses` with no dates, no keyword and no category answers "this
 * month". The tool's own default is the 1st of the calendar month; for an
 * account with a financial month (salary on the 10th) that is the wrong
 * window, so the chat fills in the financial month's start before the call
 * (ABA-795). The filled-in `startDate` is part of the args, so the tool-result
 * cache keys on it too.
 *
 * `monthStart` is `UserContext.monthStart` — set only when the account is
 * anchored; otherwise the args are returned untouched.
 */
export function withFinancialMonthDefault(
  actionType: string,
  args: Record<string, unknown>,
  monthStart: string | undefined,
): Record<string, unknown> {
  if (!monthStart || actionType !== 'get_expenses') return args;
  if (args.startDate || args.descriptionKeyword || args.categoryName) return args;
  return { ...args, startDate: monthStart };
}
