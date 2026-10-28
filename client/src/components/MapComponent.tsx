import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteAlternative, SafeHaven } from '@nightwise/shared';
import { CLIENT_CONFIG, getGeoapifyApiKey } from '../lib/config.js';

interface MapComponentProps {
  routes: RouteAlternative[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  showHavens?: boolean;
  showCameras?: boolean;
}

// Guaranteed dark-matter raster fallback style that needs no API key
const RASTER_DARK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors, © CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const MapComponent: React.FC<MapComponentProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  showHavens = true,
  showCameras = false,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [styleLoaded, setStyleLoaded] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    let isMounted = true;
    let resizeObserver: ResizeObserver | null = null;
    let fallbackTriggered = false;

    async function initMap() {
      const geoapifyKey = await getGeoapifyApiKey();
      if (!isMounted || !mapContainer.current) return;

      const style = geoapifyKey
        ? `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${geoapifyKey}`
        : RASTER_DARK_STYLE;

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style,
        center: [77.6200, 13.0000], // Bengaluru city center
        zoom: 11,
        attributionControl: false,
      });

      // Controls
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

      // Error handler: graceful fallback if Geoapify style or network encounters error
      map.on('error', (e) => {
        console.warn('[MapComponent] MapLibre warning/error:', e);
        if (!fallbackTriggered && geoapifyKey) {
          fallbackTriggered = true;
          console.warn('[MapComponent] Switching to CartoDB dark raster fallback style...');
          try {
            map.setStyle(RASTER_DARK_STYLE);
          } catch (err) {
            console.error('[MapComponent] Fallback setStyle failed:', err);
          }
        }
      });

      map.on('load', () => {
        if (!isMounted) return;
        setStyleLoaded(true);
        map.resize();
      });

      map.on('style.load', () => {
        if (!isMounted) return;
        setStyleLoaded(true);
        map.resize();
      });

      // ResizeObserver to handle flex layout expansions
      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(mapContainer.current);

      // Multiple fallback timeouts to guarantee canvas renders when layout settles
      setTimeout(() => map.resize(), 100);
      setTimeout(() => map.resize(), 400);
      setTimeout(() => map.resize(), 1000);

      mapRef.current = map;
    }

    initMap();

    return () => {
      isMounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update route layers when routes, selection, or styleLoaded changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const renderRoutes = () => {
      if (!map.isStyleLoaded()) return;

      // 1. Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // 2. Safe cleanup of existing route layers & sources
      try {
        const style = map.getStyle();
        if (style && style.layers) {
          // Remove layers first
          style.layers.forEach((l) => {
            if (l.id.startsWith('route-glow-') || l.id.startsWith('route-line-')) {
              if (map.getLayer(l.id)) map.removeLayer(l.id);
            }
          });
        }
        if (style && style.sources) {
          // Remove sources second
          Object.keys(style.sources).forEach((sId) => {
            if (sId.startsWith('route-source-')) {
              if (map.getSource(sId)) map.removeSource(sId);
            }
          });
        }
      } catch (err) {
        console.warn('[MapComponent] Cleanup error:', err);
      }

      if (!routes || routes.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();

      // 3. Render each route alternative
      routes.forEach((r) => {
        if (!r.coordinates || r.coordinates.length === 0) return;

        const isSelected = r.id === selectedRouteId;
        const isSafest = r.label === 'Safest';

        const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: r.coordinates,
          },
        };

        const sourceId = `route-source-${r.id}`;
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'geojson',
            data: geojson,
          });
        }

        // Glow layer for safest or selected route
        const glowLayerId = `route-glow-${r.id}`;
        if (!map.getLayer(glowLayerId)) {
          map.addLayer({
            id: glowLayerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': isSafest ? '#818cf8' : '#38bdf8',
              'line-width': isSelected ? 12 : 7,
              'line-opacity': isSelected ? 0.35 : 0.15,
            },
          });
        }

        // Core route line
        const lineLayerId = `route-line-${r.id}`;
        if (!map.getLayer(lineLayerId)) {
          map.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: {
              'line-color': isSafest ? '#6366f1' : isSelected ? '#38bdf8' : '#64748b',
              'line-width': isSelected ? 5.5 : 3.5,
              'line-opacity': isSelected ? 1.0 : 0.6,
            },
          });
        }

        // Click to select route
        map.on('click', lineLayerId, () => {
          onSelectRoute(r.id);
        });

        // Extend bounds
        r.coordinates.forEach((c) => bounds.extend(c as [number, number]));
      });

      // 4. Fit bounds to show entire route with comfortable padding
      if (!bounds.isEmpty()) {
        try {
          map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 800 });
        } catch (e) {
          // Ignore transient geometry fit errors
        }
      }

      // 5. Add Haven Markers for selected route
      const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
      if (showHavens && activeRoute?.safeHavens) {
        activeRoute.safeHavens.forEach((haven) => {
          if (!haven.lon || !haven.lat) return;

          const el = document.createElement('div');
          el.className = 'haven-marker';
          el.innerHTML = `
            <div style="background:#0f766e; color:white; width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #2dd4bf; box-shadow:0 0 12px rgba(45,212,191,0.6); cursor:pointer;">
              <span style="font-size:11px; font-weight:bold;">H</span>
            </div>
          `;

          const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
            <div style="color:#0f172a; padding:6px; font-family:sans-serif; max-width:200px;">
              <div style="font-size:10px; font-weight:bold; color:#0f766e; text-transform:uppercase;">${haven.category} SAFE HAVEN</div>
              <div style="font-weight:bold; font-size:12px; margin-top:2px;">${haven.name}</div>
              <div style="font-size:11px; color:#475569; margin-top:3px;">${haven.openUntil || 'Open now'} • ~${haven.distanceFromRouteM}m from path</div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([haven.lon, haven.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });
      }

      map.resize();
    };

    if (map.isStyleLoaded()) {
      renderRoutes();
    } else {
      map.once('load', renderRoutes);
    }
  }, [routes, selectedRouteId, showHavens, styleLoaded]);

  return (
    <div
      style={{ minHeight: '360px', height: '100%', width: '100%' }}
      className="relative flex-1 w-full h-full min-h-[360px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900"
    >
      <div
        ref={mapContainer}
        style={{ width: '100%', height: '100%' }}
        className="absolute inset-0 w-full h-full"
      />
      <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 text-[11px] text-slate-300 flex items-center gap-2 shadow-lg z-10 pointer-events-none">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shadow-[0_0_8px_#6366f1]" />
        <span>Safest Route</span>
        <span className="text-slate-500">|</span>
        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
        <span>Alternatives</span>
      </div>
    </div>
  );
};
