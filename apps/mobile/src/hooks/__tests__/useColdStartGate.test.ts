import { computeColdStartGate } from '../useColdStartGate';

describe('computeColdStartGate', () => {
  it('is true when initialized, authenticated, and fonts are loaded', () => {
    expect(
      computeColdStartGate({ isInitializing: false, isAuthenticated: true, fontsLoaded: true }),
    ).toBe(true);
  });

  it('is false while still initializing', () => {
    expect(
      computeColdStartGate({ isInitializing: true, isAuthenticated: true, fontsLoaded: true }),
    ).toBe(false);
  });

  it('is false when not authenticated', () => {
    expect(
      computeColdStartGate({ isInitializing: false, isAuthenticated: false, fontsLoaded: true }),
    ).toBe(false);
  });

  it('is false when fonts are not loaded', () => {
    expect(
      computeColdStartGate({ isInitializing: false, isAuthenticated: true, fontsLoaded: false }),
    ).toBe(false);
  });

  it('is false when everything is false', () => {
    expect(
      computeColdStartGate({ isInitializing: true, isAuthenticated: false, fontsLoaded: false }),
    ).toBe(false);
  });

  it('is false for every single-true combination', () => {
    expect(
      computeColdStartGate({ isInitializing: true, isAuthenticated: true, fontsLoaded: false }),
    ).toBe(false);
    expect(
      computeColdStartGate({ isInitializing: true, isAuthenticated: false, fontsLoaded: true }),
    ).toBe(false);
    expect(
      computeColdStartGate({ isInitializing: false, isAuthenticated: false, fontsLoaded: false }),
    ).toBe(false);
  });
});
