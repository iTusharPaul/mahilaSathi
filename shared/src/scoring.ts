import { SCORE_WEIGHTS, ScoreFactorKey } from './config.js';
import { RouteFactorBreakdown } from './types.js';

export interface RawRouteMetrics {
  openPlacesPerKm: number;      // raw count per km
  transportPointsPerKm: number; // raw count per km
  mainRoadRatio: number;        // 0..1 fraction of route on primary/secondary/tertiary
  longestDarkGapMeters: number; // in meters
  routeLengthMeters: number;    // in meters
  turnsPerKm: number;           // turns count per km
  helpPointsPerKm: number;      // raw count per km
  cameraCoverageRatio: number;  // 0..1 fraction of route within 75m of CCTV
  communityPulseScore: number;  // 0..1 blend of reports, completions, active rooms (default 0.5)

  // Flags indicating whether data was available for each factor (Rule R5 & §7.4)
  hasOpenPlacesData: boolean;
  hasTransportData: boolean;
  hasRoadClassData: boolean;
  hasLightingOrGapData: boolean;
  hasTurnsData: boolean;
  hasHelpPointsData: boolean;
  hasCameraData: boolean;
  hasCommunityData: boolean;

  // Fraction of route length covered by known data (for confidence)
  knownCoverageRatio: number; // 0..1
}

export interface ScoreComputationResult {
  score: number; // 0..100
  confidence: 'high' | 'medium' | 'low';
  confidenceValue: number; // 0..1
  breakdown: RouteFactorBreakdown;
  excludedFactors: ScoreFactorKey[];
}

/**
 * Computes Night Activity Score (0–100) and confidence per §7.3 and §7.4
 */
export function calculateNightActivityScore(metrics: RawRouteMetrics): ScoreComputationResult {
  // Normalize each factor to 0..1
  // 1. Open places density: ceiling of 15 places/km
  const normOpenPlaces = Math.min(1.0, Math.max(0.0, metrics.openPlacesPerKm / 15.0));

  // 2. Transport points: ceiling of 8 points/km
  const normTransport = Math.min(1.0, Math.max(0.0, metrics.transportPointsPerKm / 8.0));

  // 3. Main road share: already 0..1
  const normMainRoad = Math.min(1.0, Math.max(0.0, metrics.mainRoadRatio));

  // 4. Longest dark gap: 1 - (longest stretch with no open place within 60 m / route length), floored at 0
  const gapFraction = metrics.routeLengthMeters > 0
    ? metrics.longestDarkGapMeters / metrics.routeLengthMeters
    : 1.0;
  const normDarkGap = Math.min(1.0, Math.max(0.0, 1.0 - gapFraction));

  // 5. Simplicity: fewer turns per km scores higher (10 turns/km baseline)
  const normSimplicity = Math.min(1.0, Math.max(0.0, 1.0 - metrics.turnsPerKm / 10.0));

  // 6. Help points: ceiling of 5 per km
  const normHelpPoints = Math.min(1.0, Math.max(0.0, metrics.helpPointsPerKm / 5.0));

  // 7. Camera coverage: fraction of route within 75m of CCTV (0..1)
  const normCamera = Math.min(1.0, Math.max(0.0, metrics.cameraCoverageRatio));

  // 8. Community pulse: 0..1 (neutral 0.5)
  const normCommunity = Math.min(1.0, Math.max(0.0, metrics.communityPulseScore));

  const factorValues: Record<ScoreFactorKey, number> = {
    openPlacesDensity: normOpenPlaces,
    transportPoints: normTransport,
    mainRoadShare: normMainRoad,
    longestDarkGap: normDarkGap,
    simplicity: normSimplicity,
    helpPoints: normHelpPoints,
    cameraCoverage: normCamera,
    communityPulse: normCommunity,
  };

  const factorAvailability: Record<ScoreFactorKey, boolean> = {
    openPlacesDensity: metrics.hasOpenPlacesData,
    transportPoints: metrics.hasTransportData,
    mainRoadShare: metrics.hasRoadClassData,
    longestDarkGap: metrics.hasLightingOrGapData,
    simplicity: metrics.hasTurnsData,
    helpPoints: metrics.hasHelpPointsData,
    cameraCoverage: metrics.hasCameraData,
    communityPulse: metrics.hasCommunityData,
  };

  // Identify excluded factors whose inputs are completely absent
  const excludedFactors: ScoreFactorKey[] = [];
  let availableWeightSum = 0;

  for (const key of Object.keys(SCORE_WEIGHTS) as ScoreFactorKey[]) {
    if (factorAvailability[key]) {
      availableWeightSum += SCORE_WEIGHTS[key];
    } else {
      excludedFactors.push(key);
    }
  }

  // If somehow all factors are absent, fall back to neutral
  if (availableWeightSum <= 0) {
    return {
      score: 50,
      confidence: 'low',
      confidenceValue: 0,
      breakdown: {
        openPlacesDensity: 0.5,
        transportPoints: 0.5,
        mainRoadShare: 0.5,
        longestDarkGap: 0.5,
        simplicity: 0.5,
        helpPoints: 0.5,
        cameraCoverage: 0.5,
        communityPulse: 0.5,
        excludedFactors,
      },
      excludedFactors,
    };
  }

  // Proportional redistribution of weights for excluded factors (§7.4)
  let weightedScoreSum = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as ScoreFactorKey[]) {
    if (factorAvailability[key]) {
      const adjustedWeight = SCORE_WEIGHTS[key] / availableWeightSum;
      weightedScoreSum += adjustedWeight * factorValues[key];
    }
  }

  const finalScore = Math.round(Math.min(100, Math.max(0, weightedScoreSum * 100)));

  // Confidence computation
  const confVal = Math.min(1.0, Math.max(0.0, metrics.knownCoverageRatio));
  let confidence: 'high' | 'medium' | 'low';
  if (confVal >= 0.7) {
    confidence = 'high';
  } else if (confVal >= 0.35) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    score: finalScore,
    confidence,
    confidenceValue: Math.round(confVal * 100) / 100,
    breakdown: {
      openPlacesDensity: Math.round(normOpenPlaces * 100) / 100,
      transportPoints: Math.round(normTransport * 100) / 100,
      mainRoadShare: Math.round(normMainRoad * 100) / 100,
      longestDarkGap: Math.round(normDarkGap * 100) / 100,
      simplicity: Math.round(normSimplicity * 100) / 100,
      helpPoints: Math.round(normHelpPoints * 100) / 100,
      cameraCoverage: Math.round(normCamera * 100) / 100,
      communityPulse: Math.round(normCommunity * 100) / 100,
      excludedFactors,
    },
    excludedFactors,
  };
}
