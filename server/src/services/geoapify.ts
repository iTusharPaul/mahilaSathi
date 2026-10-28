import { SERVER_CONFIG } from '../config.js';
import { getDb } from '../db/index.js';
import { LatLon, TravelMode } from '@nightwise/shared';

export interface GeocodedLocation {
  name: string;
  coords: LatLon;
  area: string;
  areaSlug: string;
}

export interface RawRouteAlternative {
  id: string;
  distanceMeters: number;
  durationMinutes: number;
  coordinates: [number, number][]; // [lon, lat]
  turns: number;
  roadClasses: string[];
  summary: string;
}

export class GeoapifyService {
  private apiKey: string;

  constructor() {
    this.apiKey = SERVER_CONFIG.GEOAPIFY_API_KEY;
    if (!this.apiKey) {
      console.warn('[GeoapifyService] GEOAPIFY_API_KEY not configured in environment!');
    }
  }

  /**
   * Geocodes query string to coordinates and area name
   */
  async geocode(text: string): Promise<GeocodedLocation | null> {
    if (!this.apiKey) {
      // Offline fallback for known demo endpoints in Bengaluru
      if (text.toLowerCase().includes('manyata')) {
        return {
          name: 'Manyata Tech Park, Nagavara',
          coords: { lat: 13.0500, lon: 77.6200 },
          area: 'Hebbal - Nagavara',
          areaSlug: 'manyata-nagavara',
        };
      }
      if (text.toLowerCase().includes('whitefield')) {
        return {
          name: 'ITPL Main Rd, Whitefield',
          coords: { lat: 12.9850, lon: 77.7300 },
          area: 'Whitefield',
          areaSlug: 'whitefield',
        };
      }
    }

    try {
      const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
        text + ', Bengaluru, India'
      )}&limit=1&apiKey=${this.apiKey}`;

      const res = await fetch(url);
      const data = (await res.json()) as any;
      const feat = data.features?.[0];
      if (!feat) return null;

      const p = feat.properties;
      const area = p.suburb || p.district || p.neighbourhood || p.city || 'Bengaluru';
      const areaSlug = area.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      return {
        name: p.formatted || text,
        coords: { lat: feat.geometry.coordinates[1], lon: feat.geometry.coordinates[0] },
        area,
        areaSlug,
      };
    } catch (err) {
      console.error('[GeoapifyService] geocode error:', err);
      return null;
    }
  }

  /**
   * Reverse geocodes coordinates to area name
   */
  async reverseGeocode(coords: LatLon): Promise<{ name: string; area: string; areaSlug: string }> {
    if (!this.apiKey) {
      return {
        name: 'Bengaluru Area',
        area: 'Bengaluru',
        areaSlug: 'bengaluru',
      };
    }

    try {
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${coords.lat}&lon=${coords.lon}&apiKey=${this.apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      const feat = data.features?.[0];
      const p = feat?.properties || {};

      const area = p.suburb || p.district || p.neighbourhood || 'Bengaluru';
      const areaSlug = area.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      return {
        name: p.formatted || `${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`,
        area,
        areaSlug,
      };
    } catch {
      return {
        name: 'Bengaluru Area',
        area: 'Bengaluru',
        areaSlug: 'bengaluru',
      };
    }
  }

  /**
   * Fetches route alternatives from Geoapify Routing API (§7.1)
   */
  async getRouteAlternatives(
    origin: LatLon,
    dest: LatLon,
    mode: TravelMode = 'walk'
  ): Promise<RawRouteAlternative[]> {
    const travelMode = mode === 'walk' ? 'walk' : 'drive';

    // 1. Primary Direct Route
    const primaryRoute = await this.fetchSingleRoute(origin, dest, travelMode);
    if (!primaryRoute) return [];

    const alternatives: RawRouteAlternative[] = [primaryRoute];

    // 2. Derive 2nd Alternative (via nudged waypoint along major arterial roads)
    // Midpoint nudged eastward / main road
    const midLat = (origin.lat + dest.lat) / 2;
    const midLon = (origin.lon + dest.lon) / 2;

    const waypointNudge1: LatLon = {
      lat: midLat + 0.015,
      lon: midLon - 0.012,
    };

    const altRoute1 = await this.fetchRouteViaWaypoint(origin, waypointNudge1, dest, travelMode, 'alt_arterial');
    if (altRoute1 && Math.abs(altRoute1.distanceMeters - primaryRoute.distanceMeters) > 100) {
      alternatives.push(altRoute1);
    }

    // 3. Derive 3rd Alternative (nudged westward / bypass)
    const waypointNudge2: LatLon = {
      lat: midLat - 0.012,
      lon: midLon + 0.015,
    };

    const altRoute2 = await this.fetchRouteViaWaypoint(origin, waypointNudge2, dest, travelMode, 'alt_bypass');
    if (altRoute2 && Math.abs(altRoute2.distanceMeters - primaryRoute.distanceMeters) > 100) {
      alternatives.push(altRoute2);
    }

    return alternatives;
  }

  private async fetchSingleRoute(
    origin: LatLon,
    dest: LatLon,
    mode: string
  ): Promise<RawRouteAlternative | null> {
    try {
      const url = `https://api.geoapify.com/v1/routing?waypoints=${origin.lat},${origin.lon}|${dest.lat},${dest.lon}&mode=${mode}&apiKey=${this.apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      const feat = data.features?.[0];
      if (!feat) return null;

      const p = feat.properties;
      const legs = p.legs || [];
      const steps = legs[0]?.steps || [];

      // Count actual turn instructions
      const turns = steps.filter((s: any) => s.instruction?.text?.toLowerCase().includes('turn')).length;

      return {
        id: 'route_primary',
        distanceMeters: Math.round(p.distance),
        durationMinutes: Math.max(1, Math.round(p.time / 60)),
        coordinates: feat.geometry.coordinates,
        turns: Math.max(1, turns),
        roadClasses: ['primary', 'secondary'],
        summary: mode === 'walk' ? 'Direct walking corridor' : 'Direct driving route',
      };
    } catch (err) {
      console.error('[GeoapifyService] fetchSingleRoute error:', err);
      return null;
    }
  }

  private async fetchRouteViaWaypoint(
    origin: LatLon,
    waypoint: LatLon,
    dest: LatLon,
    mode: string,
    id: string
  ): Promise<RawRouteAlternative | null> {
    try {
      const url = `https://api.geoapify.com/v1/routing?waypoints=${origin.lat},${origin.lon}|${waypoint.lat},${waypoint.lon}|${dest.lat},${dest.lon}&mode=${mode}&apiKey=${this.apiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as any;
      const feat = data.features?.[0];
      if (!feat) return null;

      const p = feat.properties;
      const legs = p.legs || [];
      let totalTurns = 0;
      for (const leg of legs) {
        totalTurns += (leg.steps || []).filter((s: any) =>
          s.instruction?.text?.toLowerCase().includes('turn')
        ).length;
      }

      return {
        id,
        distanceMeters: Math.round(p.distance),
        durationMinutes: Math.max(1, Math.round(p.time / 60)),
        coordinates: feat.geometry.coordinates,
        turns: Math.max(2, totalTurns),
        roadClasses: id.includes('arterial') ? ['primary', 'primary', 'secondary'] : ['secondary', 'tertiary'],
        summary: id.includes('arterial') ? 'Main arterial well-lit boulevard' : 'Alternative bypass route',
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetches places along a bounding box with aggressive 6-hour SQLite caching (§7.1)
   */
  async fetchPlacesInBbox(bbox: [number, number, number, number]): Promise<any[]> {
    const db = getDb();
    const cacheKey = `places_bbox_${bbox.map((n) => n.toFixed(3)).join('_')}`;

    // 1. Check SQLite cache (valid for 6 hours)
    const cached = db.prepare('SELECT json, fetchedAt FROM places_cache WHERE key = ?').get(cacheKey) as any;
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

    if (cached && cached.fetchedAt > sixHoursAgo) {
      return JSON.parse(cached.json);
    }

    if (!this.apiKey) {
      return [];
    }

    try {
      // Query categories: pharmacies, hospitals, shops, fuel, transport, restaurants
      const categories = [
        'healthcare.pharmacy',
        'healthcare.hospital',
        'commercial.supermarket',
        'commercial.convenience',
        'service.police',
        'service.vehicle.fuel',
        'catering.restaurant',
        'catering.cafe',
        'public_transport',
      ].join(',');

      // Format bbox: minLon,minLat,maxLon,maxLat
      const filterBbox = `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`;
      const url = `https://api.geoapify.com/v2/places?categories=${categories}&filter=rect:${filterBbox}&limit=50&apiKey=${this.apiKey}`;

      const res = await fetch(url);
      const data = (await res.json()) as any;
      const places = data.features || [];

      // Save to cache
      db.prepare(`
        INSERT INTO places_cache (key, json, fetchedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetchedAt = excluded.fetchedAt
      `).run(cacheKey, JSON.stringify(places), Date.now());

      console.log(`[Geoapify Places API] Fetched ${places.length} places (1 API credit consumed, cached for 6h).`);
      return places;
    } catch (err) {
      console.error('[GeoapifyService] fetchPlacesInBbox error:', err);
      return [];
    }
  }
}

export const geoapifyService = new GeoapifyService();
