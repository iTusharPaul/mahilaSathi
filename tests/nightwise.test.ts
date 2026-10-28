import { describe, it, expect } from 'vitest';
import {
  calculateNightActivityScore,
  SCORE_WEIGHTS,
} from '../shared/src/scoring.js';
import {
  trimRouteGeometry,
  computeCorridorKey,
  haversineDistanceMeters,
} from '../shared/src/geometry.js';
import {
  buildGuardianSosPayload,
  buildJourneyRoomSosPayload,
} from '../shared/src/messages.js';
import { evaluateOpenNow } from '../server/src/services/openingHours.js';

describe('11(a) Night Activity Score Formula & Weight Redistribution', () => {
  it('correctly calculates score with all factors available and normalizes 0..100', () => {
    const result = calculateNightActivityScore({
      openPlacesPerKm: 15, // 1.0 (at ceiling)
      transportPointsPerKm: 8, // 1.0
      mainRoadRatio: 1.0, // 1.0
      longestDarkGapMeters: 0, // 1.0 (no gap)
      routeLengthMeters: 5000,
      turnsPerKm: 0, // 1.0 (no turns)
      helpPointsPerKm: 5, // 1.0 (at ceiling)
      cameraCoverageRatio: 1.0, // 1.0
      communityPulseScore: 1.0, // 1.0
      hasOpenPlacesData: true,
      hasTransportData: true,
      hasRoadClassData: true,
      hasLightingOrGapData: true,
      hasTurnsData: true,
      hasHelpPointsData: true,
      hasCameraData: true,
      hasCommunityData: true,
      knownCoverageRatio: 0.95,
    });

    expect(result.score).toBe(100);
    expect(result.confidence).toBe('high');
    expect(result.confidenceValue).toBe(0.95);
    expect(result.excludedFactors.length).toBe(0);
  });

  it('redistributes weights proportionally when factors are excluded (§7.4)', () => {
    // Exclude cameraCoverage (0.05) and communityPulse (0.10)
    // Remaining weight sum = 0.85
    const result = calculateNightActivityScore({
      openPlacesPerKm: 7.5, // 0.5
      transportPointsPerKm: 4, // 0.5
      mainRoadRatio: 0.5, // 0.5
      longestDarkGapMeters: 2500, // 0.5
      routeLengthMeters: 5000,
      turnsPerKm: 5, // 0.5
      helpPointsPerKm: 2.5, // 0.5
      cameraCoverageRatio: 0,
      communityPulseScore: 0,
      hasOpenPlacesData: true,
      hasTransportData: true,
      hasRoadClassData: true,
      hasLightingOrGapData: true,
      hasTurnsData: true,
      hasHelpPointsData: true,
      hasCameraData: false, // EXCLUDED
      hasCommunityData: false, // EXCLUDED
      knownCoverageRatio: 0.5,
    });

    expect(result.score).toBe(50);
    expect(result.excludedFactors).toContain('cameraCoverage');
    expect(result.excludedFactors).toContain('communityPulse');
    expect(result.confidence).toBe('medium');
  });

  it('computes confidence category correctly (high >= 0.70, medium >= 0.35, low < 0.35)', () => {
    const base = {
      openPlacesPerKm: 5,
      transportPointsPerKm: 2,
      mainRoadRatio: 0.6,
      longestDarkGapMeters: 100,
      routeLengthMeters: 1000,
      turnsPerKm: 2,
      helpPointsPerKm: 1,
      cameraCoverageRatio: 0.2,
      communityPulseScore: 0.5,
      hasOpenPlacesData: true,
      hasTransportData: true,
      hasRoadClassData: true,
      hasLightingOrGapData: true,
      hasTurnsData: true,
      hasHelpPointsData: true,
      hasCameraData: true,
      hasCommunityData: true,
    };

    expect(calculateNightActivityScore({ ...base, knownCoverageRatio: 0.85 }).confidence).toBe('high');
    expect(calculateNightActivityScore({ ...base, knownCoverageRatio: 0.55 }).confidence).toBe('medium');
    expect(calculateNightActivityScore({ ...base, knownCoverageRatio: 0.20 }).confidence).toBe('low');
  });
});

describe('11(b) Open-Now Evaluation (at least 6 cases)', () => {
  // Pick reference date: Wednesday 22:30 IST
  // 2026-10-28 22:30 IST is Wednesday night
  const wednesdayNight = new Date('2026-10-28T17:00:00Z'); // 22:30 IST (+5:30)

  it('1. Case: 24/7 is open', () => {
    const res = evaluateOpenNow('24/7', wednesdayNight);
    expect(res.status).toBe('open');
  });

  it('2. Case: Closes at 23:00 (currently 22:30) -> open', () => {
    const res = evaluateOpenNow('Mo-Su 10:00-23:00', wednesdayNight);
    expect(res.status).toBe('open');
  });

  it('3. Case: Overnight range 18:00-02:00 -> open at 22:30', () => {
    const res = evaluateOpenNow('Mo-Su 18:00-02:00', wednesdayNight);
    expect(res.status).toBe('open');
  });

  it('4. Case: Missing spec -> unknown (never throws, never closed per R5)', () => {
    const res1 = evaluateOpenNow(null, wednesdayNight);
    const res2 = evaluateOpenNow('', wednesdayNight);
    expect(res1.status).toBe('unknown');
    expect(res2.status).toBe('unknown');
  });

  it('5. Case: Day-specific spec (e.g. closed on Wednesday Mo-Tu,Th-Fr 10:00-20:00) -> closed', () => {
    const res = evaluateOpenNow('Mo-Tu,Th-Fr 10:00-20:00', wednesdayNight);
    expect(res.status).toBe('closed');
  });

  it('6. Case: Malformed spec -> unknown (never throws)', () => {
    const res = evaluateOpenNow('invalid-syntax-xyz-%%% 99:99', wednesdayNight);
    expect(res.status).toBe('unknown');
  });
});

describe('11(c) Route Trimming (Safety Rule R3)', () => {
  it('trimmed geometry starts and ends >= ROUTE_TRIM_METRES (300m) from true endpoints', () => {
    // Create a 2 km straight line from South to North in Bengaluru
    // 1 deg lat is ~111 km, 0.01 deg is ~1110 m, 0.02 deg is ~2220 m
    const startCoord: [number, number] = [77.6000, 12.9000];
    const midCoord: [number, number] = [77.6000, 12.9100];
    const endCoord: [number, number] = [77.6000, 12.9200];
    const originalRoute: [number, number][] = [startCoord, midCoord, endCoord];

    const trimmed = trimRouteGeometry(originalRoute, 300);

    expect(trimmed.length).toBeGreaterThanOrEqual(2);

    const startTrimDistance = haversineDistanceMeters(startCoord, trimmed[0]);
    const endTrimDistance = haversineDistanceMeters(endCoord, trimmed[trimmed.length - 1]);

    // Should be at least 300m trimmed (with small floating point margin)
    expect(startTrimDistance).toBeGreaterThanOrEqual(295);
    expect(endTrimDistance).toBeGreaterThanOrEqual(295);
  });
});

describe('11(d) SOS Payload Builders & Separation (Safety Rule R2)', () => {
  it('Guardian Circle payload contains precise coordinates while Journey Room payload provably does NOT', () => {
    const coords = { lat: 12.9716, lon: 77.5946 };
    const tripId = 'trip_123';
    const coarseArea = 'Indiranagar';
    const nearestHavenName = 'Apollo Pharmacy 24/7';
    const havenDistanceM = 120;
    const havenOpenUntil = 'Open 24/7';

    const guardianPayload = buildGuardianSosPayload({
      tripId,
      coarseArea,
      nearestHavenName,
      havenDistanceM,
      havenOpenUntil,
      preciseCoords: coords,
    });

    const roomPayload = buildJourneyRoomSosPayload({
      tripId,
      coarseArea,
      nearestHavenName,
      havenDistanceM,
      havenOpenUntil,
    });

    // Verify guardian payload HAS precise coordinates
    expect(guardianPayload.preciseCoords).toBeDefined();
    expect(guardianPayload.preciseCoords.lat).toBe(12.9716);
    expect(guardianPayload.preciseCoords.lon).toBe(77.5946);

    // Verify Journey Room payload PROVABLY DOES NOT contain preciseCoords or coordinates
    expect((roomPayload as any).preciseCoords).toBeUndefined();
    expect((roomPayload as any).lat).toBeUndefined();
    expect((roomPayload as any).lon).toBeUndefined();
    expect(JSON.stringify(roomPayload)).not.toContain('12.9716');
    expect(JSON.stringify(roomPayload)).not.toContain('77.5946');
  });
});

describe('11(e) Corridor Key Bucketing', () => {
  it('produces the same corridor key for same areas within 45-min bucket, but different keys across buckets', () => {
    const baseTime = 1730140000000; // arbitrary timestamp
    const tPlus10m = baseTime + 10 * 60 * 1000;
    const tPlus60m = baseTime + 60 * 60 * 1000;

    const key1 = computeCorridorKey('manyata-tech-park', 'whitefield', baseTime, 45);
    const key2 = computeCorridorKey('manyata-tech-park', 'whitefield', tPlus10m, 45);
    const key3 = computeCorridorKey('manyata-tech-park', 'whitefield', tPlus60m, 45);

    expect(key1).toBe(key2); // same 45-min window
    expect(key1).not.toBe(key3); // different bucket
    expect(key1).toContain('manyata-tech-park→whitefield');
  });
});
