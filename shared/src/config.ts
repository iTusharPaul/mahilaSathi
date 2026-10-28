// Product constants & scoring weights (Single source of truth)

export const PRODUCT_CONSTANTS = {
  CITY: 'Bengaluru',
  ROUTE_TRIM_METRES: 300,
  CORRIDOR_WINDOW_MIN: 45,
  CHECKIN_INTERVAL_MIN: 10,
  ESCALATION_GRACE_MIN: 10,
  ESCALATION_RESPONSE_TIMEOUT_MIN: 5,
  PLACES_CACHE_HOURS: 6,
  SEGMENT_LENGTH_M: 250,
  COMMUNITY_PULSE_WINDOW_HOURS: 3,

  // Radius for scoring
  OPEN_PLACES_SEARCH_RADIUS_M: 60,
  TRANSPORT_SEARCH_RADIUS_M: 100,
  HELP_POINTS_SEARCH_RADIUS_M: 150,
  CAMERA_SEARCH_RADIUS_M: 75,

  // Ceilings for factor normalization
  OPEN_PLACES_PER_KM_CEILING: 15,
  TRANSPORT_PER_KM_CEILING: 8,
  HELP_POINTS_PER_KM_CEILING: 5,
  CAMERA_COVERAGE_RATIO_CEILING: 1.0,
  TURNS_PER_KM_BASELINE: 10 // fewer turns per km = higher score
} as const;

export const SCORE_WEIGHTS = {
  openPlacesDensity: 0.22,
  transportPoints: 0.10,
  mainRoadShare: 0.16,
  longestDarkGap: 0.20,
  simplicity: 0.07,
  helpPoints: 0.10,
  cameraCoverage: 0.05,
  communityPulse: 0.10,
} as const;

export type ScoreFactorKey = keyof typeof SCORE_WEIGHTS;

export const HANDLE_WORD_LIST = [
  'Lotus', 'Jasmine', 'Neem', 'Pearl', 'Amber', 'Ruby', 'Emerald',
  'Tulip', 'Marigold', 'Coral', 'Sapphire', 'Opal', 'Beryl', 'Topaz',
  'Orchid', 'Gulmohar', 'Champa', 'Mogra', 'Parijat', 'Kadam',
  'Amethyst', 'Garnet', 'Zircon', 'Iris', 'Lily', 'Rose', 'Dahlia'
] as const;

export const SEEDED_NEIGHBOURHOODS = [
  { id: 'whitefield-late', name: 'Whitefield after 9 PM', area: 'Whitefield', slug: 'whitefield' },
  { id: 'koramangala-night', name: 'Koramangala Night Owls', area: 'Koramangala', slug: 'koramangala' },
  { id: 'hsr-after-dark', name: 'HSR after Dark', area: 'HSR Layout', slug: 'hsr-layout' },
  { id: 'indiranagar-late', name: 'Indiranagar Late Hours', area: 'Indiranagar', slug: 'indiranagar' }
] as const;
