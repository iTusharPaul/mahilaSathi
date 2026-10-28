import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { geoapifyService } from '../services/geoapify.js';
import { overpassService } from '../services/overpass.js';
import { scoreEngine } from '../services/scoreEngine.js';
import { PlanTripResponseDTO, LatLon, TravelMode, RouteAlternative } from '@nightwise/shared';

const router = Router();

// Cache recent plans in memory for fast trip starts
export const activePlansCache = new Map<string, PlanTripResponseDTO>();

router.post('/', async (req, res) => {
  try {
    const { originText, destText, originCoords, destCoords, mode } = req.body;
    const travelMode: TravelMode = mode === 'drive' ? 'drive' : 'walk';

    // 1. Resolve Origin
    let origin: { name: string; coords: LatLon; area: string; areaSlug: string } | null = null;
    if (originCoords && originCoords.lat && originCoords.lon) {
      const rev = await geoapifyService.reverseGeocode(originCoords);
      origin = {
        name: rev.name,
        coords: originCoords,
        area: rev.area,
        areaSlug: rev.areaSlug,
      };
    } else if (originText) {
      origin = await geoapifyService.geocode(originText);
    }

    if (!origin) {
      res.status(400).json({ error: 'Could not resolve origin address in Bengaluru' });
      return;
    }

    // 2. Resolve Destination
    let destination: { name: string; coords: LatLon; area: string; areaSlug: string } | null = null;
    if (destCoords && destCoords.lat && destCoords.lon) {
      const rev = await geoapifyService.reverseGeocode(destCoords);
      destination = {
        name: rev.name,
        coords: destCoords,
        area: rev.area,
        areaSlug: rev.areaSlug,
      };
    } else if (destText) {
      destination = await geoapifyService.geocode(destText);
    }

    if (!destination) {
      res.status(400).json({ error: 'Could not resolve destination address in Bengaluru' });
      return;
    }

    // 3. Fetch Route Alternatives from Geoapify
    const rawRoutes = await geoapifyService.getRouteAlternatives(origin.coords, destination.coords, travelMode);

    if (rawRoutes.length === 0) {
      res.status(404).json({ error: 'No navigable routes found between these locations' });
      return;
    }

    // 4. Compute overall bounding box for Places & Overpass queries
    let minLon = Math.min(origin.coords.lon, destination.coords.lon);
    let maxLon = Math.max(origin.coords.lon, destination.coords.lon);
    let minLat = Math.min(origin.coords.lat, destination.coords.lat);
    let maxLat = Math.max(origin.coords.lat, destination.coords.lat);

    // Add 1 km buffer around bounding box
    minLon -= 0.01;
    maxLon += 0.01;
    minLat -= 0.01;
    maxLat += 0.01;
    const bbox: [number, number, number, number] = [minLon, minLat, maxLon, maxLat];

    // 5. Query Places & Overpass (with 6h SQLite caching)
    const [places, overpassData] = await Promise.all([
      geoapifyService.fetchPlacesInBbox(bbox),
      overpassService.fetchCctvAndLitData(bbox),
    ]);

    // 6. Score each route alternative
    const scoredRoutes: RouteAlternative[] = rawRoutes.map((r) =>
      scoreEngine.scoreRoute(r, {
        places,
        overpassData,
        nowDate: new Date(),
        corridorKey: `${origin.areaSlug}→${destination.areaSlug}`,
      })
    );

    // 7. Rank and label: Fastest vs Safest
    const labeledRoutes = scoreEngine.rankAndLabelRoutes(scoredRoutes);

    const planId = `plan_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const planResponse: PlanTripResponseDTO = {
      planId,
      origin,
      destination,
      mode: travelMode,
      routes: labeledRoutes,
      timestamp: Date.now(),
    };

    activePlansCache.set(planId, planResponse);

    res.json(planResponse);
  } catch (err: any) {
    console.error('[PlanRoute API] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate safe routes' });
  }
});

export default router;
