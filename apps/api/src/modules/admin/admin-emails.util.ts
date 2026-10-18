/**
 * The `ADMIN_EMAILS` list, trimmed and lower-cased. It is the only admin check
 * in the app (there is no role column), and it doubles as the definition of an
 * "internal" account wherever product numbers must not count the team's own use.
 *
 * Read at call time, not import time, so a spec can set the env per test.
 */
export function parseAdminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
