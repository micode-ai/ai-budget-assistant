/**
 * The version string shown on the About screen.
 *
 * Native and web run the SAME `app.json` version, and they must — one codebase,
 * one semver, so a bug report ties to code. But they ship on different
 * cadences: the web build deploys on every push to `development`, while a phone
 * carries whatever last cleared Play review, which in this project has been
 * weeks and once was frozen outright. So at almost any moment the web is ahead
 * of the phones by an unknown number of commits, and a bare shared number
 * claims two different builds are the same software.
 *
 * The build id closes that. `+` is semver's build metadata and is explicitly
 * IGNORED for version precedence, so nothing that compares versions — the
 * `UpdatePrompt` gate, `minSupportedVersion`, the store-review throttle — can
 * see it. Native passes no sha and keeps the bare version, because Play owns
 * that string and `versionCode` is its own build identity.
 */

/** git's own default abbreviation length, so the id matches what `git log` prints. */
const SHA_LENGTH = 7;

/**
 * `1.26.0` with no build id, `1.26.0+a3f9c1e` with one.
 *
 * A non-hex `sha` yields the bare version rather than being shown: the value
 * arrives from an environment variable, which can hold anything at all
 * (including an un-expanded `${{ github.sha }}`), and a clean version number is
 * a better answer than a corrupted one.
 */
export function displayVersion(version: string, sha?: string | null): string {
  const base = version.trim();
  if (!sha) return base;

  const candidate = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(candidate)) return base;

  return `${base}+${candidate.slice(0, SHA_LENGTH)}`;
}
