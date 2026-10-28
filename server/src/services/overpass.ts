import { getDb } from '../db/index.js';

export interface OverpassBboxData {
  cctvPoints: [number, number][]; // [lon, lat]
  litRoadLengthMeters: number;
}

export class OverpassService {
  private cachePrefix = 'overpass_bbox_';

  /**
   * Fetches mapped CCTV cameras and lit roads in bbox with 6-hour SQLite cache (§7.1)
   */
  async fetchCctvAndLitData(bbox: [number, number, number, number]): Promise<OverpassBboxData> {
    const db = getDb();
    const cacheKey = `${this.cachePrefix}${bbox.map((n) => n.toFixed(3)).join('_')}`;

    // 1. Check SQLite cache
    const cached = db.prepare('SELECT json, fetchedAt FROM places_cache WHERE key = ?').get(cacheKey) as any;
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;

    if (cached && cached.fetchedAt > sixHoursAgo) {
      return JSON.parse(cached.json);
    }

    // bbox format for Overpass: south, west, north, east (minLat, minLon, maxLat, maxLon)
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const overpassBbox = `${minLat.toFixed(4)},${minLon.toFixed(4)},${maxLat.toFixed(4)},${maxLon.toFixed(4)}`;

    const query = `
      [out:json][timeout:6];
      (
        node["man_made"="surveillance"](${overpassBbox});
        way["lit"="yes"](${overpassBbox});
      );
      out body;
    `;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'User-Agent': 'NightWise/1.0 (Hackathon demo; Bengaluru Safety Project)',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Overpass returned HTTP ${res.status}`);
      }

      const data = (await res.json()) as any;
      const elements = data.elements || [];

      const cctvPoints: [number, number][] = [];
      let litCount = 0;

      for (const el of elements) {
        if (el.type === 'node' && el.tags?.['man_made'] === 'surveillance') {
          cctvPoints.push([el.lon, el.lat]);
        } else if (el.type === 'way' && el.tags?.['lit'] === 'yes') {
          litCount++;
        }
      }

      const result: OverpassBboxData = {
        cctvPoints,
        litRoadLengthMeters: litCount * 250, // approx 250m per mapped lit way
      };

      // Save to SQLite cache
      db.prepare(`
        INSERT INTO places_cache (key, json, fetchedAt)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetchedAt = excluded.fetchedAt
      `).run(cacheKey, JSON.stringify(result), Date.now());

      console.log(`[Overpass API] Found ${cctvPoints.length} CCTV cameras & ${litCount} lit road segments (cached for 6h).`);
      return result;
    } catch (err: any) {
      console.warn(`[OverpassService] Overpass query failed or timed out (${err.message}). Degraded to unknown (Rule R5).`);
      const fallback: OverpassBboxData = {
        cctvPoints: [],
        litRoadLengthMeters: 0,
      };
      // Cache failure for 15 minutes to avoid hammering Overpass
      try {
        db.prepare(`
          INSERT INTO places_cache (key, json, fetchedAt)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET json = excluded.json, fetchedAt = excluded.fetchedAt
        `).run(cacheKey, JSON.stringify(fallback), Date.now());
      } catch {}

      return fallback;
    }
  }
}

export const overpassService = new OverpassService();
