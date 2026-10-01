import { displayVersion } from '../displayVersion';

describe('displayVersion', () => {
  it('returns the bare version when no build id is supplied', () => {
    expect(displayVersion('1.26.0')).toBe('1.26.0');
    expect(displayVersion('1.26.0', undefined)).toBe('1.26.0');
    expect(displayVersion('1.26.0', null)).toBe('1.26.0');
    expect(displayVersion('1.26.0', '')).toBe('1.26.0');
  });

  it('appends the build id as semver build metadata, abbreviated to git length', () => {
    expect(displayVersion('1.26.0', 'a3f9c1e2b4d6f8a0c2e4')).toBe('1.26.0+a3f9c1e');
  });

  it('accepts a sha that is already abbreviated', () => {
    expect(displayVersion('1.26.0', 'a3f9c1e')).toBe('1.26.0+a3f9c1e');
  });

  it('lowercases a sha so two builds of one commit never read as two versions', () => {
    expect(displayVersion('1.26.0', 'A3F9C1E')).toBe('1.26.0+a3f9c1e');
  });

  // The value comes from an environment variable, so it can hold anything —
  // including a workflow expression that was never expanded. A clean version
  // number is a better answer than a corrupted one.
  it('drops a build id that is not a sha rather than showing it', () => {
    expect(displayVersion('1.26.0', '${{ github.sha }}')).toBe('1.26.0');
    expect(displayVersion('1.26.0', 'not-a-sha')).toBe('1.26.0');
    expect(displayVersion('1.26.0', 'abc')).toBe('1.26.0'); // too short to be one
    expect(displayVersion('1.26.0', 'a3f9c1g')).toBe('1.26.0'); // g is not hex
  });

  it('trims surrounding whitespace on both halves', () => {
    expect(displayVersion(' 1.26.0 ', ' a3f9c1e ')).toBe('1.26.0+a3f9c1e');
  });
  // Two Play builds can carry the same versionName (1.32.0 shipped twice), and
  // then only versionCode tells them apart — so native shows it in brackets.
  it('appends the native build number in brackets', () => {
    expect(displayVersion('1.32.0', null, '412')).toBe('1.32.0 (412)');
    expect(displayVersion('1.32.0', undefined, ' 412 ')).toBe('1.32.0 (412)');
  });

  it('ignores a build number that is not a plain integer, and never combines it with a sha', () => {
    expect(displayVersion('1.32.0', null, '')).toBe('1.32.0');
    expect(displayVersion('1.32.0', null, 'abc')).toBe('1.32.0');
    expect(displayVersion('1.32.0', 'a3f9c1e', '412')).toBe('1.32.0+a3f9c1e');
  });
});
