import { describe, it, expect } from 'vitest';
import { calculateDistanceKm, formatTravelEstimate } from '../services/geoDistance';

describe('geoDistance calculation and formatting', () => {
  it('calculates zero distance between identical points', () => {
    const lat = 41.3879;
    const lon = 2.16992;
    expect(calculateDistanceKm(lat, lon, lat, lon)).toBe(0);
  });

  it('calculates known distance between Barcelona (Sagrada Família) and Plaça Catalunya accurately (~2.1 km)', () => {
    const sagradaLat = 41.4036;
    const sagradaLon = 2.1744;
    const catalunyaLat = 41.3870;
    const catalunyaLon = 2.1700;

    const distance = calculateDistanceKm(sagradaLat, sagradaLon, catalunyaLat, catalunyaLon);
    expect(distance).toBeGreaterThan(1.7);
    expect(distance).toBeLessThan(2.3);
  });

  it('provides travel estimates with walking for short distances and driving for longer distances', () => {
    const shortEst = formatTravelEstimate(0.8);
    expect(shortEst.walkMinutes).toBeGreaterThanOrEqual(2);
    expect(shortEst.label).toContain('min walk');

    const longEst = formatTravelEstimate(4.5);
    expect(longEst.driveMinutes).toBeGreaterThanOrEqual(10);
    expect(longEst.label).toContain('min drive');
  });
});
