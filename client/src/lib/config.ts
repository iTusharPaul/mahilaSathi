// Client-side configuration (Single source of truth for frontend)
/// <reference types="vite/client" />

export {
  PRODUCT_CONSTANTS,
  SCORE_WEIGHTS,
  HANDLE_WORD_LIST,
  SEEDED_NEIGHBOURHOODS,
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  NEXCONN_CUSTOM_MESSAGE_REGISTRATIONS,
  type ScoreFactorKey,
  type CustomMessageType,
  type TripStartedPayload,
  type CheckinPayload,
  type ImOkPayload,
  type ArrivedPayload,
  type GuardianSosPayload,
  type JourneyRoomSosPayload,
  type HavenCardPayload,
  type ReportPayload,
  type LivePingPayload,
  buildTripStartedPayload,
  buildCheckinPayload,
  buildImOkPayload,
  buildArrivedPayload,
  buildGuardianSosPayload,
  buildJourneyRoomSosPayload,
  buildHavenCardPayload,
  buildReportPayload,
  buildLivePingPayload,
  haversineDistanceMeters,
  trimRouteGeometry,
  computeCorridorKey,
  generateSegmentId,
  calculateNightActivityScore,
} from '@nightwise/shared';

export const CLIENT_CONFIG = {
  NEXCONN_APP_KEY: (import.meta.env.VITE_NEXCONN_APP_KEY || '') as string,
  GEOAPIFY_API_KEY: (import.meta.env.VITE_GEOAPIFY_API_KEY || '') as string,
  API_BASE_URL: '/api',
};
