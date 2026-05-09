const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function isSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function compareSemver(a: string, b: string): number {
  const ma = SEMVER_RE.exec(a);
  const mb = SEMVER_RE.exec(b);
  if (!ma || !mb) {
    throw new Error(`Invalid semver: ${!ma ? a : b}`);
  }
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
