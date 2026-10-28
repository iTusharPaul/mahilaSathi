import { ScoreFactorKey } from './config.js';

export interface UserDTO {
  id: string;
  phone: string;
  handle: string;
  createdAt: number;
}

export interface AuthResponseDTO {
  jwt: string;
  user: UserDTO;
  nexconnToken: string;
  demoOtp?: string; // only returned when DEMO_MODE=true
}

export interface CircleMemberDTO {
  userId: string;
  handle: string;
  role: 'owner' | 'guardian';
  joinedAt: number;
}

export interface CircleDTO {
  id: string;
  ownerId: string;
  nexconnGroupId: string;
  members: CircleMemberDTO[];
}

export type TravelMode = 'walk' | 'drive';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface SafeHaven {
  id: string;
  name: string;
  category: 'pharmacy' | 'hospital' | 'shop' | 'transport' | 'police' | 'fuel' | 'restaurant' | 'cafe' | 'other';
  lat: number;
  lon: number;
  distanceFromRouteM: number;
  address?: string;
  openingHoursRaw?: string;
  openNowStatus: 'open' | 'closed' | 'unknown';
  openUntil?: string;
}

export interface RouteFactorBreakdown {
  openPlacesDensity: number; // 0..1
  transportPoints: number;    // 0..1
  mainRoadShare: number;      // 0..1
  longestDarkGap: number;     // 0..1
  simplicity: number;         // 0..1
  helpPoints: number;         // 0..1
  cameraCoverage: number;     // 0..1
  communityPulse: number;     // 0..1
  excludedFactors?: ScoreFactorKey[];
}

export interface RouteAlternative {
  id: string;
  label: 'Fastest' | 'Safest' | 'Balanced';
  distanceMeters: number;
  durationMinutes: number;
  score: number; // 0..100
  confidence: 'high' | 'medium' | 'low';
  confidenceValue: number; // 0..1
  breakdown: RouteFactorBreakdown;
  longestDarkGapMeters: number;
  coordinates: [number, number][]; // [lon, lat] pairs for GeoJSON / MapLibre
  trimmedCoordinates?: [number, number][]; // coordinates trimmed by 300m at both ends
  safeHavens: SafeHaven[];
  cctvCameraCount: number;
  litRoadLengthMeters: number;
  summary: string;
}

export interface PlanTripResponseDTO {
  planId: string;
  origin: {
    name: string;
    coords: LatLon;
    area: string;
    areaSlug: string;
  };
  destination: {
    name: string;
    coords: LatLon;
    area: string;
    areaSlug: string;
  };
  mode: TravelMode;
  routes: RouteAlternative[];
  timestamp: number;
}

export type TripStatus = 'active' | 'arrived' | 'overdue' | 'cancelled';

export interface TripDTO {
  id: string;
  userId: string;
  corridorKey: string;
  journeyGroupId: string;
  circleGroupId: string;
  originArea: string;
  destArea: string;
  mode: TravelMode;
  score: number;
  startedAt: number;
  etaMinutes: number;
  etaAt: number;
  status: TripStatus;
  endedAt?: number;
  lastCheckinAt?: number;
}

export type CommunityReportCategory =
  | 'streetlight_out'
  | 'deserted'
  | 'lively'
  | 'place_open'
  | 'place_closed'
  | 'other';

export interface CommunityReportDTO {
  id: string;
  userId: string;
  userHandle: string;
  category: CommunityReportCategory;
  segmentId: string;
  areaLabel: string;
  note?: string;
  createdAt: number;
}

export interface WalkTogetherRequestDTO {
  id: string;
  requesterId: string;
  requesterHandle: string;
  targetId: string;
  targetHandle: string;
  corridorKey: string;
  havenName: string;
  havenCoords: LatLon;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}
