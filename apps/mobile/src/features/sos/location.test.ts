import * as Location from 'expo-location';

import { lastKnownFix, LOCATION_TIMEOUT_MS } from './location';

jest.mock('expo-location', () => ({ getLastKnownPositionAsync: jest.fn() }));
const getLast = jest.mocked(Location.getLastKnownPositionAsync);

const position = (accuracy: number | null) =>
  ({
    coords: { latitude: 40.0150123, longitude: -105.2705456, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.UTC(2026, 9, 26, 12, 0, 0),
  }) as Location.LocationObject;

beforeEach(() => jest.clearAllMocks());

describe('lastKnownFix', () => {
  it('returns the last known fix with its accuracy and time', async () => {
    getLast.mockResolvedValue(position(12.5));
    expect(await lastKnownFix()).toEqual({
      latitude: 40.0150123,
      longitude: -105.2705456,
      accuracyM: 12.5,
      at: '2026-10-26T12:00:00.000Z',
    });
  });

  it('keeps an unknown accuracy as null', async () => {
    getLast.mockResolvedValue(position(null));
    expect(await lastKnownFix()).toMatchObject({ accuracyM: null });
  });

  it('is null when there is no fix or no permission, never an error', async () => {
    getLast.mockResolvedValue(null);
    expect(await lastKnownFix()).toBeNull();

    getLast.mockRejectedValue(new Error('Location permission not granted'));
    expect(await lastKnownFix()).toBeNull();
  });

  it('never waits past the timeout: a slow lookup is null', async () => {
    jest.useFakeTimers();
    getLast.mockReturnValue(new Promise(() => undefined));
    const fix = lastKnownFix();
    jest.advanceTimersByTime(LOCATION_TIMEOUT_MS);
    expect(await fix).toBeNull();
    jest.useRealTimers();
  });

  it('waits at most one second', () => {
    expect(LOCATION_TIMEOUT_MS).toBeLessThanOrEqual(1000);
  });
});
