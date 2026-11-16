/**
 * Every JWT carries `tv`, the user's `tokenVersion` when it was issued (ABA-809).
 * Bumping the column (password reset, e-mail change) revokes all earlier tokens.
 * A token without `tv` predates ABA-809 and counts as version 0, the column's
 * default, so existing sessions survived the deploy.
 */
export function tokenVersionMatches(payload: { tv?: number }, user: { tokenVersion?: number | null }): boolean {
  return (payload.tv ?? 0) === (user.tokenVersion ?? 0);
}
