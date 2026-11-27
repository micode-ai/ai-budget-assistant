import { isAppVisible, startSupportPoll } from '../supportPolling';

jest.mock('react-native', () => ({ AppState: { currentState: 'active' }, Platform: { OS: 'android' } }));

describe('isAppVisible', () => {
  it('on native is true only while the app is active', () => {
    expect(isAppVisible('android', 'active', undefined)).toBe(true);
    expect(isAppVisible('ios', 'background', undefined)).toBe(false);
    expect(isAppVisible('android', 'inactive', undefined)).toBe(false);
  });

  it('on web is false only while the tab is hidden', () => {
    expect(isAppVisible('web', 'active', 'visible')).toBe(true);
    expect(isAppVisible('web', 'background', 'hidden')).toBe(false);
  });
});

describe('startSupportPoll', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ticks on the interval only while canPoll() is true', () => {
    const tick = jest.fn();
    let can = true;
    const stop = startSupportPoll(tick, () => can, 1000);
    jest.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    can = false; // tab hidden / app backgrounded / offline
    jest.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(1);
    can = true;
    jest.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops for good once its cleanup runs (screen blurred)', () => {
    const tick = jest.fn();
    const stop = startSupportPoll(tick, () => true, 1000);
    stop();
    jest.advanceTimersByTime(5000);
    expect(tick).not.toHaveBeenCalled();
  });
});
