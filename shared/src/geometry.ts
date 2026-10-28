import { PRODUCT_CONSTANTS } from './config.js';
import { LatLon } from './types.js';

/**
 * Calculates great-circle distance between two points in meters using Haversine formula
 */
export function haversineDistanceMeters(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Trims a route geometry by at least `trimMeters` at both origin and destination ends.
 * Non-negotiable safety rule R3: Every route shown to strangers must never reveal exact endpoints.
 */
export function trimRouteGeometry(
  coords: [number, number][],
  trimMeters: number = PRODUCT_CONSTANTS.ROUTE_TRIM_METRES
): [number, number][] {
  if (!coords || coords.length < 2) return coords;

  // Calculate cumulative distances from start
  const cumulativeFromStart: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulativeFromStart.push(
      cumulativeFromStart[i - 1] + haversineDistanceMeters(coords[i - 1], coords[i])
    );
  }

  const totalLength = cumulativeFromStart[cumulativeFromStart.length - 1];

  // If route is too short to trim 2 * trimMeters, return midpoint or shorten proportionally
  if (totalLength <= trimMeters * 2) {
    const midIdx = Math.floor(coords.length / 2);
    return [coords[midIdx]];
  }

  // Find start cut index and interpolated point
  let startIdx = 0;
  while (startIdx < coords.length - 1 && cumulativeFromStart[startIdx + 1] < trimMeters) {
    startIdx++;
  }

  // Interpolate start point
  const distBeforeStart = cumulativeFromStart[startIdx];
  const segDistStart = cumulativeFromStart[startIdx + 1] - distBeforeStart;
  const tStart = segDistStart > 0 ? (trimMeters - distBeforeStart) / segDistStart : 0;
  const startPt: [number, number] = [
    coords[startIdx][0] + (coords[startIdx + 1][0] - coords[startIdx][0]) * tStart,
    coords[startIdx][1] + (coords[startIdx + 1][1] - coords[startIdx][1]) * tStart,
  ];

  // Find end cut
  const targetEndDist = totalLength - trimMeters;
  let endIdx = coords.length - 1;
  while (endIdx > 0 && cumulativeFromStart[endIdx - 1] > targetEndDist) {
    endIdx--;
  }

  const distBeforeEnd = cumulativeFromStart[endIdx - 1];
  const segDistEnd = cumulativeFromStart[endIdx] - distBeforeEnd;
  const tEnd = segDistEnd > 0 ? (targetEndDist - distBeforeEnd) / segDistEnd : 0;
  const endPt: [number, number] = [
    coords[endIdx - 1][0] + (coords[endIdx][0] - coords[endIdx - 1][0]) * tEnd,
    coords[endIdx - 1][1] + (coords[endIdx][1] - coords[endIdx - 1][1]) * tEnd,
  ];

  // Build trimmed array
  const trimmed: [number, number][] = [startPt];
  for (let i = startIdx + 1; i < endIdx; i++) {
    trimmed.push(coords[i]);
  }
  trimmed.push(endPt);

  return trimmed;
}

/**
 * Computes corridor key scoped by 45-minute window
 * corridor key = originAreaSlug + '→' + destAreaSlug + timeBucket
 */
export function computeCorridorKey(
  originAreaSlug: string,
  destAreaSlug: string,
  timestamp: number = Date.now(),
  windowMinutes: number = PRODUCT_CONSTANTS.CORRIDOR_WINDOW_MIN
): string {
  const windowMs = windowMinutes * 60 * 1000;
  const bucket = Math.floor(timestamp / windowMs);
  const cleanOrigin = originAreaSlug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  const cleanDest = destAreaSlug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  return `${cleanOrigin}→${cleanDest}-${bucket}`;
}

/**
 * Generates stable segment ID for a 250m stretch
 */
export function generateSegmentId(coord1: [number, number], coord2: [number, number]): string {
  const round = (n: number) => n.toFixed(3);
  return `seg_${round(coord1[0])}_${round(coord1[1])}__${round(coord2[0])}_${round(coord2[1])}`;
}
