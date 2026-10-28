import { CommunityReportCategory, LatLon, TravelMode } from './types.js';

export const NEXCONN_CUSTOM_MESSAGE_TYPES = {
  TRIP_STARTED: 'NW:trip_started',
  CHECKIN: 'NW:checkin',
  IM_OK: 'NW:im_ok',
  ARRIVED: 'NW:arrived',
  SOS: 'NW:sos',
  HAVEN_CARD: 'NW:haven_card',
  REPORT: 'NW:report',
  LIVE_PING: 'NW:live_ping',
} as const;

export type CustomMessageType = typeof NEXCONN_CUSTOM_MESSAGE_TYPES[keyof typeof NEXCONN_CUSTOM_MESSAGE_TYPES];

// SDK registration configurations (includes both isPersisted and isPersited for safety)
export const NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS = [
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED, isPersisted: true, isPersited: true, isCounted: true },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN, isPersisted: true, isPersited: true, isCounted: false },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK, isPersisted: true, isPersited: true, isCounted: false },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED, isPersisted: true, isPersited: true, isCounted: true },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.SOS, isPersisted: true, isPersited: true, isCounted: true },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.HAVEN_CARD, isPersisted: true, isPersited: true, isCounted: false },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.REPORT, isPersisted: true, isPersited: true, isCounted: false },
  { messageType: NEXCONN_CUSTOM_MESSAGE_TYPES.LIVE_PING, isPersisted: false, isPersited: false, isCounted: false, isStatusMessage: true },
];

export interface TripStartedPayload {
  tripId: string;
  originArea: string;
  destArea: string;
  etaMinutes: number;
  score: number;
  mode: TravelMode;
}

export interface CheckinPayload {
  tripId: string;
  segmentLabel: string;
  minutesRemaining: number;
  escalated?: boolean;
}

export interface ImOkPayload {
  tripId: string;
  inResponseTo?: string;
}

export interface ArrivedPayload {
  tripId: string;
  durationMinutes: number;
  score: number;
}

// Guardian Circle SOS payload: includes precise coordinates (Rule R2)
export interface GuardianSosPayload {
  tripId: string;
  coarseArea: string;
  nearestHavenName: string;
  havenDistanceM: number;
  havenOpenUntil: string;
  preciseCoords: LatLon; // ALLOWED only in Guardian Circle
}

// Journey Room SOS payload: STRICTLY NO PRECISE COORDINATES (Rule R2)
export interface JourneyRoomSosPayload {
  tripId: string;
  coarseArea: string;
  nearestHavenName: string;
  havenDistanceM: number;
  havenOpenUntil: string;
  // preciseCoords must NOT exist here!
}

export interface HavenCardPayload {
  name: string;
  category: string;
  distanceM: number;
  openUntil: string;
  areaLabel: string;
}

export interface ReportPayload {
  category: CommunityReportCategory;
  segmentRef: string;
  note?: string;
}

export interface LivePingPayload {
  tripId: string;
  progressPct: number;
}

// ================= Builders =================

export function buildTripStartedPayload(p: TripStartedPayload): TripStartedPayload {
  return { ...p };
}

export function buildCheckinPayload(p: CheckinPayload): CheckinPayload {
  return { ...p };
}

export function buildImOkPayload(p: ImOkPayload): ImOkPayload {
  return { ...p };
}

export function buildArrivedPayload(p: ArrivedPayload): ArrivedPayload {
  return { ...p };
}

/**
 * Builds Guardian Circle SOS payload (with exact coordinates)
 */
export function buildGuardianSosPayload(params: {
  tripId: string;
  coarseArea: string;
  nearestHavenName: string;
  havenDistanceM: number;
  havenOpenUntil: string;
  preciseCoords: LatLon;
}): GuardianSosPayload {
  return {
    tripId: params.tripId,
    coarseArea: params.coarseArea,
    nearestHavenName: params.nearestHavenName,
    havenDistanceM: Math.round(params.havenDistanceM),
    havenOpenUntil: params.havenOpenUntil,
    preciseCoords: {
      lat: params.preciseCoords.lat,
      lon: params.preciseCoords.lon,
    },
  };
}

/**
 * Builds Journey Room SOS payload (coarse only - no precise coords, Rule R2)
 */
export function buildJourneyRoomSosPayload(params: {
  tripId: string;
  coarseArea: string;
  nearestHavenName: string;
  havenDistanceM: number;
  havenOpenUntil: string;
  // Notice: even if caller had coords, this function signature prevents coords
}): JourneyRoomSosPayload {
  return {
    tripId: params.tripId,
    coarseArea: params.coarseArea,
    nearestHavenName: params.nearestHavenName,
    havenDistanceM: Math.round(params.havenDistanceM),
    havenOpenUntil: params.havenOpenUntil,
  };
}

export function buildHavenCardPayload(p: HavenCardPayload): HavenCardPayload {
  return { ...p };
}

export function buildReportPayload(p: ReportPayload): ReportPayload {
  return {
    category: p.category,
    segmentRef: p.segmentRef,
    note: p.note ? p.note.slice(0, 140) : undefined,
  };
}

export function buildLivePingPayload(p: LivePingPayload): LivePingPayload {
  return { ...p };
}
