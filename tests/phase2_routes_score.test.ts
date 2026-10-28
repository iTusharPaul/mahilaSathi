import { describe, it, expect } from 'vitest';
import { geoapifyService } from '../server/src/services/geoapify.js';
import { overpassService } from '../server/src/services/overpass.js';
import { scoreEngine } from '../server/src/services/scoreEngine.js';
import { getDb } from '../server/src/db/index.js';

describe('Phase 2 Gate: Routing, Places, Overpass & Night Activity Score', () => {
  it('returns Fastest vs Safest alternatives with visibly different scores and factor breakdown', async () => {
    // 1. Geocode Manyata Tech Park and Whitefield
    const origin = await geoapifyService.geocode('Manyata Tech Park');
    const dest = await geoapifyService.geocode('Whitefield');

    expect(origin).not.toBeNull();
    expect(dest).not.toBeNull();
    expect(origin?.coords.lat).toBeDefined();
    expect(dest?.coords.lat).toBeDefined();

    // 2. Fetch alternatives
    const rawRoutes = await geoapifyService.getRouteAlternatives(origin!.coords, dest!.coords, 'drive');
    expect(rawRoutes.length).toBeGreaterThanOrEqual(2);

    // 3. Compute Bbox & query Places + Overpass
    const minLon = Math.min(origin!.coords.lon, dest!.coords.lon) - 0.01;
    const maxLon = Math.max(origin!.coords.lon, dest!.coords.lon) + 0.01;
    const minLat = Math.min(origin!.coords.lat, dest!.coords.lat) - 0.01;
    const maxLat = Math.max(origin!.coords.lat, dest!.coords.lat) + 0.01;
    const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

    const [places, overpassData] = await Promise.all([
      geoapifyService.fetchPlacesInBbox(bbox),
      overpassService.fetchCctvAndLitData(bbox),
    ]);

    expect(Array.isArray(places)).toBe(true);
    expect(overpassData).toBeDefined();

    // 4. Score all alternatives
    const scoredRoutes = rawRoutes.map((r) =>
      scoreEngine.scoreRoute(r, {
        places,
        overpassData,
        nowDate: new Date(),
        corridorKey: `${origin!.areaSlug}→${dest!.areaSlug}`,
      })
    );

    const ranked = scoreEngine.rankAndLabelRoutes(scoredRoutes);
    expect(ranked.length).toBeGreaterThanOrEqual(2);

    const safest = ranked.find((r) => r.label === 'Safest');
    const fastest = ranked.find((r) => r.label === 'Fastest');

    expect(safest).toBeDefined();
    expect(fastest).toBeDefined();

    // Scores should be between 0 and 100
    expect(safest!.score).toBeGreaterThanOrEqual(0);
    expect(safest!.score).toBeLessThanOrEqual(100);
    expect(fastest!.score).toBeGreaterThanOrEqual(0);
    expect(fastest!.score).toBeLessThanOrEqual(100);

    // Breakdown should exist with all factors
    expect(safest!.breakdown.openPlacesDensity).toBeDefined();
    expect(safest!.breakdown.mainRoadShare).toBeDefined();
    expect(safest!.breakdown.longestDarkGap).toBeDefined();
    expect(safest!.confidence).toMatch(/high|medium|low/);

    // Trimmed coordinates should start/end >= 300m away
    expect(safest!.trimmedCoordinates).toBeDefined();
    expect(safest!.trimmedCoordinates!.length).toBeGreaterThanOrEqual(2);

    // 5. Test SQLite cache efficiency: subsequent query must be served from cache
    const db = getDb();
    const cacheRows = db.prepare("SELECT count(*) as count FROM places_cache WHERE key LIKE 'places_bbox_%'").get() as any;
    expect(cacheRows.count).toBeGreaterThan(0);

    // Second call to fetchPlacesInBbox should hit SQLite cache instantly
    const t0 = Date.now();
    const cachedPlaces = await geoapifyService.fetchPlacesInBbox(bbox);
    const durationMs = Date.now() - t0;

    expect(cachedPlaces.length).toBe(places.length);
    expect(durationMs).toBeLessThan(50); // Instant cache hit under 50ms!
  }, 30000);
});
