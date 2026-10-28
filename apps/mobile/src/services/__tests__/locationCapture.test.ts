import { captureCurrentLocation, requestLocationPermission } from '../locationCapture';
import * as Location from 'expo-location';
import { useLocationSettingsStore } from '@/stores/locationSettingsStore';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const mockMmkv = new Map<string, unknown>();
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getBoolean: (k: string) => mockMmkv.get(k) as boolean | undefined,
    set: (k: string, v: unknown) => mockMmkv.set(k, v),
  })),
}));

jest.mock('@/stores/locationSettingsStore', () => ({
  useLocationSettingsStore: { getState: jest.fn() },
}));

const mockGetState = useLocationSettingsStore.getState as jest.Mock;
const mockPerms = Location.getForegroundPermissionsAsync as jest.Mock;
const mockPos = Location.getCurrentPositionAsync as jest.Mock;

const mockRequest = Location.requestForegroundPermissionsAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockMmkv.clear();
  mockGetState.mockReturnValue({ captureEnabled: true });
  mockPerms.mockResolvedValue({ status: 'granted' });
});

describe('captureCurrentLocation', () => {
  it('returns null when the toggle is off, without touching permissions', async () => {
    mockGetState.mockReturnValue({ captureEnabled: false });
    expect(await captureCurrentLocation()).toBeNull();
    expect(mockPerms).not.toHaveBeenCalled();
  });

  it('force bypasses the toggle', async () => {
    mockGetState.mockReturnValue({ captureEnabled: false });
    mockPos.mockResolvedValue({ coords: { latitude: 52.23, longitude: 21.01 } });
    expect(await captureCurrentLocation({ force: true })).toEqual({ lat: 52.23, lng: 21.01 });
  });

  it('returns null when permission is not granted', async () => {
    mockPerms.mockResolvedValue({ status: 'denied' });
    expect(await captureCurrentLocation()).toBeNull();
    expect(mockPos).not.toHaveBeenCalled();
  });

  it('maps coords to {lat, lng}', async () => {
    mockPos.mockResolvedValue({ coords: { latitude: 50.06, longitude: 19.93 } });
    expect(await captureCurrentLocation()).toEqual({ lat: 50.06, lng: 19.93 });
  });

  it('returns null when position lookup rejects (never throws)', async () => {
    mockPos.mockRejectedValue(new Error('gps off'));
    expect(await captureCurrentLocation()).toBeNull();
  });

  it('returns null when position lookup exceeds the timeout', async () => {
    jest.useFakeTimers();
    mockPos.mockReturnValue(new Promise(() => undefined)); // never resolves
    const promise = captureCurrentLocation();
    // `advanceTimersByTime` is synchronous, but captureCurrentLocation awaits
    // getForegroundPermissionsAsync() before the setTimeout is registered —
    // the timer doesn't exist yet at this point. advanceTimersByTimeAsync
    // interleaves pending microtasks with timer advancement so the internal
    // setTimeout gets registered and fired within the same call.
    await jest.advanceTimersByTimeAsync(4100);
    expect(await promise).toBeNull();
    jest.useRealTimers();
  });
});

describe('captureCurrentLocation — permission not asked yet', () => {
  beforeEach(() => {
    mockPerms.mockResolvedValue({ status: 'undetermined' });
    mockPos.mockResolvedValue({ coords: { latitude: 54.35, longitude: 18.65 } });
  });

  it('asks once from a foreground screen and captures when granted', async () => {
    mockRequest.mockResolvedValue({ status: 'granted' });
    expect(await captureCurrentLocation({ askPermission: true })).toEqual({ lat: 54.35, lng: 18.65 });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('never asks again on this install, whatever the answer was', async () => {
    mockRequest.mockResolvedValue({ status: 'denied' });
    expect(await captureCurrentLocation({ askPermission: true })).toBeNull();
    expect(await captureCurrentLocation({ askPermission: true })).toBeNull();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('does not ask without askPermission (background capture)', async () => {
    expect(await captureCurrentLocation()).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('does not ask when the toggle is off', async () => {
    mockGetState.mockReturnValue({ captureEnabled: false });
    expect(await captureCurrentLocation({ askPermission: true })).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('requestLocationPermission', () => {
  it('returns true when granted', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    expect(await requestLocationPermission()).toBe(true);
  });

  it('returns false when denied or the call throws', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    expect(await requestLocationPermission()).toBe(false);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockRejectedValue(new Error('x'));
    expect(await requestLocationPermission()).toBe(false);
  });
});
