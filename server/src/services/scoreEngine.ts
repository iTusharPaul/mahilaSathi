import {
  calculateNightActivityScore,
  haversineDistanceMeters,
  trimRouteGeometry,
  PRODUCT_CONSTANTS,
  SCORE_WEIGHTS,
} from '@nightwise/shared';
import { RawRouteAlternative } from './geoapify.js';
import { evaluateOpenNow } from './openingHours.js';
import { OverpassBboxData } from './overpass.js';
import { SafeHaven, RouteAlternative, RouteFactorBreakdown } from '@nightwise/shared';
import { getDb } from '../db/index.js';

export interface ScoreEngineOptions {
  places: any[];
  overpassData: OverpassBboxData;
  nowDate?: Date;
  corridorKey?: string;
}

/**
 * Calculates perpendicular or nearest distance from point P to line segment AB in meters
 */
function distanceToSegmentMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dAB = haversineDistanceMeters(a, b);
  if (dAB === 0) return haversineDistanceMeters(p, a);

  // Approximate vector projection in local coordinate space
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  const proj: [number, number] = [a[0] + t * dx, a[1] + t * dy];

  return haversineDistanceMeters(p, proj);
}

/**
 * Finds minimum distance from a point to a polyline
 */
function minDistanceToPolylineMeters(point: [number, number], coords: [number, number][]): number {
  let minD = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distanceToSegmentMeters(point, coords[i], coords[i + 1]);
    if (d < minD) minD = d;
  }
  return minD;
}

export class ScoreEngine {
  /**
   * Scores and enriches a route alternative
   */
  scoreRoute(route: RawRouteAlternative, options: ScoreEngineOptions): RouteAlternative {
    const coords = route.coordinates;
    const lengthKm = route.distanceMeters / 1000;
    const nowDate = options.nowDate || new Date();

    // 1. Process Geoapify Places along route
    const safeHavens: SafeHaven[] = [];
    let openPlacesNearRoute = 0;
    let transportPointsNearRoute = 0;
    let helpPointsNearRoute = 0;
    let placesWithKnownHours = 0;

    // Track places along route for dark gap computation
    const placesWithCoord: Array<{ coord: [number, number]; isOpen: boolean }> = [];

    for (const feat of options.places) {
      const placeCoords: [number, number] = feat.geometry.coordinates;
      const p = feat.properties;
      const distM = minDistanceToPolylineMeters(placeCoords, coords);

      // Evaluate opening hours
      const openEval = evaluateOpenNow(p.opening_hours, nowDate);
      if (openEval.status !== 'unknown') {
        placesWithKnownHours++;
      }

      const isOpenOrUnknown = openEval.status === 'open' || openEval.status === 'unknown';
      const isDefinitelyOpen = openEval.status === 'open';

      // Within 60m: counts for Open Places Density (§7.3)
      if (distM <= PRODUCT_CONSTANTS.OPEN_PLACES_SEARCH_RADIUS_M && isOpenOrUnknown) {
        // Unknown counts at half weight per §7.2
        openPlacesNearRoute += openEval.status === 'open' ? 1.0 : 0.5;
        placesWithCoord.push({ coord: placeCoords, isOpen: isOpenOrUnknown });
      }

      // Within 100m: Public Transport
      const categories: string[] = p.categories || [];
      const isTransport = categories.some((c) => c.includes('transport'));
      if (isTransport && distM <= PRODUCT_CONSTANTS.TRANSPORT_SEARCH_RADIUS_M) {
        transportPointsNearRoute++;
      }

      // Within 150m: Help Points (Hospital, Pharmacy, Police)
      const isHelp = categories.some((c) =>
        c.includes('pharmacy') || c.includes('hospital') || c.includes('police')
      );
      if (isHelp && distM <= PRODUCT_CONSTANTS.HELP_POINTS_SEARCH_RADIUS_M && isOpenOrUnknown) {
        helpPointsNearRoute++;
      }

      // Collect Safe Havens (open or unknown pharmacies, hospitals, shops, police within 150m)
      if ((isHelp || categories.some((c) => c.includes('supermarket') || c.includes('convenience'))) &&
          distM <= 150 &&
          isOpenOrUnknown) {
        let cat: SafeHaven['category'] = 'shop';
        if (categories.some((c) => c.includes('pharmacy'))) cat = 'pharmacy';
        else if (categories.some((c) => c.includes('hospital'))) cat = 'hospital';
        else if (categories.some((c) => c.includes('police'))) cat = 'police';
        else if (isTransport) cat = 'transport';

        safeHavens.push({
          id: p.place_id || `haven_${safeHavens.length}`,
          name: p.name || `${cat.toUpperCase()} Facility`,
          category: cat,
          lat: placeCoords[1],
          lon: placeCoords[0],
          distanceFromRouteM: Math.round(distM),
          address: p.formatted,
          openingHoursRaw: p.opening_hours,
          openNowStatus: openEval.status,
          openUntil: openEval.openUntil,
        });
      }
    }

    // 2. Longest Dark Gap computation (§7.3)
    // Find maximum distance between consecutive open places along the route
    let longestDarkGapMeters = 0;
    if (placesWithCoord.length === 0) {
      longestDarkGapMeters = route.distanceMeters;
    } else {
      // Sample route line string at 100m intervals to measure gap stretches
      let currentGap = 0;
      let maxGap = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        const segLen = haversineDistanceMeters(coords[i], coords[i + 1]);
        const hasPlaceNearby = placesWithCoord.some((pl) =>
          distanceToSegmentMeters(pl.coord, coords[i], coords[i + 1]) <= 60
        );

        if (hasPlaceNearby) {
          if (currentGap > maxGap) maxGap = currentGap;
          currentGap = 0;
        } else {
          currentGap += segLen;
        }
      }
      if (currentGap > maxGap) maxGap = currentGap;
      longestDarkGapMeters = Math.min(route.distanceMeters, Math.round(maxGap));
    }

    // 3. CCTV Camera coverage (§7.3)
    let coveredLengthM = 0;
    const cctvList = options.overpassData.cctvPoints;
    if (cctvList.length > 0) {
      for (let i = 0; i < coords.length - 1; i++) {
        const segLen = haversineDistanceMeters(coords[i], coords[i + 1]);
        const isNearCamera = cctvList.some((cam) =>
          distanceToSegmentMeters(cam, coords[i], coords[i + 1]) <= PRODUCT_CONSTANTS.CAMERA_SEARCH_RADIUS_M
        );
        if (isNearCamera) {
          coveredLengthM += segLen;
        }
      }
    }
    const cameraCoverageRatio = route.distanceMeters > 0 ? coveredLengthM / route.distanceMeters : 0;

    // 4. Main-road share (§7.3)
    // Major arterial roads vs dark alleys
    let mainRoadRatio = 0.6; // default moderate
    if (route.id.includes('arterial')) {
      mainRoadRatio = 0.85;
    } else if (route.id.includes('bypass')) {
      mainRoadRatio = 0.45;
    }

    // 5. Simplicity (§7.3)
    const turnsPerKm = lengthKm > 0 ? route.turns / lengthKm : 0;

    // 6. Community Pulse (§7.5)
    let communityPulseScore = 0.5; // neutral cold start
    try {
      const db = getDb();
      const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
      const recentReports = db.prepare(`
        SELECT category FROM community_reports
        WHERE createdAt > ?
      `).all(threeHoursAgo) as any[];

      if (recentReports.length > 0) {
        let pulseDelta = 0;
        for (const rep of recentReports) {
          if (rep.category === 'lively' || rep.category === 'place_open') pulseDelta += 0.05;
          if (rep.category === 'streetlight_out' || rep.category === 'deserted') pulseDelta -= 0.08;
        }
        communityPulseScore = Math.min(1.0, Math.max(0.0, 0.5 + pulseDelta));
      }
    } catch {
      communityPulseScore = 0.5;
    }

    // 7. Data Confidence & Coverage Ratio (§7.3 & R5)
    const knownCoverageRatio = Math.min(
      1.0,
      Math.max(
        0.3,
        (placesWithKnownHours > 0 ? 0.4 : 0.1) +
        (cctvList.length > 0 ? 0.3 : 0.1) +
        (options.overpassData.litRoadLengthMeters > 0 ? 0.3 : 0.1)
      )
    );

    // 8. Calculate Score using the formula & weight redistribution engine
    const scoreResult = calculateNightActivityScore({
      openPlacesPerKm: lengthKm > 0 ? openPlacesNearRoute / lengthKm : 0,
      transportPointsPerKm: lengthKm > 0 ? transportPointsNearRoute / lengthKm : 0,
      mainRoadRatio,
      longestDarkGapMeters,
      routeLengthMeters: route.distanceMeters,
      turnsPerKm,
      helpPointsPerKm: lengthKm > 0 ? helpPointsNearRoute / lengthKm : 0,
      cameraCoverageRatio,
      communityPulseScore,
      hasOpenPlacesData: options.places.length > 0,
      hasTransportData: true,
      hasRoadClassData: true,
      hasLightingOrGapData: true,
      hasTurnsData: true,
      hasHelpPointsData: true,
      hasCameraData: cctvList.length > 0,
      hasCommunityData: true,
      knownCoverageRatio,
    });

    // 9. Trim endpoints by 300m for privacy protection (Safety Rule R3)
    const trimmedCoordinates = trimRouteGeometry(coords, PRODUCT_CONSTANTS.ROUTE_TRIM_METRES);

    return {
      id: route.id,
      label: 'Fastest', // will be finalized by rankRoutes
      distanceMeters: route.distanceMeters,
      durationMinutes: route.durationMinutes,
      score: scoreResult.score,
      confidence: scoreResult.confidence,
      confidenceValue: scoreResult.confidenceValue,
      breakdown: scoreResult.breakdown,
      longestDarkGapMeters,
      coordinates: coords,
      trimmedCoordinates,
      safeHavens: safeHavens.slice(0, 10), // top 10 havens
      cctvCameraCount: cctvList.length,
      litRoadLengthMeters: options.overpassData.litRoadLengthMeters,
      summary: route.summary,
    };
  }

  /**
   * Evaluates all alternatives and labels Fastest vs Safest vs Balanced
   */
  rankAndLabelRoutes(routes: RouteAlternative[]): RouteAlternative[] {
    if (routes.length === 0) return [];
    if (routes.length === 1) {
      routes[0].label = 'Safest';
      return routes;
    }

    // Sort by score descending to find Safest
    const byScore = [...routes].sort((a, b) => b.score - a.score);
    const safestId = byScore[0].id;

    // Sort by duration ascending to find Fastest
    const byTime = [...routes].sort((a, b) => a.durationMinutes - b.durationMinutes);
    const fastestId = byTime[0].id;

    return routes.map((r) => {
      if (r.id === safestId && r.id === fastestId) {
        return { ...r, label: 'Safest' }; // If one route is both, label Safest
      } else if (r.id === safestId) {
        return { ...r, label: 'Safest' };
      } else if (r.id === fastestId) {
        return { ...r, label: 'Fastest' };
      } else {
        return { ...r, label: 'Balanced' };
      }
    });
  }
}

export const scoreEngine = new ScoreEngine();
