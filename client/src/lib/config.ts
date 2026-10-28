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
  type CommunityReportCategory,
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

let runtimeGeoapifyKey = CLIENT_CONFIG.GEOAPIFY_API_KEY;

export async function getGeoapifyApiKey(): Promise<string> {
  if (runtimeGeoapifyKey) return runtimeGeoapifyKey;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.geoapifyApiKey) {
        runtimeGeoapifyKey = data.geoapifyApiKey;
        CLIENT_CONFIG.GEOAPIFY_API_KEY = runtimeGeoapifyKey;
        return runtimeGeoapifyKey;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch runtime config:', err);
  }
  return '';
}
