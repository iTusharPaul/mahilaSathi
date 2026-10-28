import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RouteAlternative, SafeHaven } from '@nightwise/shared';
import { CLIENT_CONFIG } from '../lib/config.js';

interface MapComponentProps {
  routes: RouteAlternative[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  showHavens?: boolean;
  showCameras?: boolean;
}

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

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Use dark style: Geoapify vector dark-matter if key available, or CartoDB Dark Matter raster fallback
    const geoapifyKey = CLIENT_CONFIG.GEOAPIFY_API_KEY;
    const style = geoapifyKey
      ? `https://maps.geoapify.com/v1/styles/dark-matter/style.json?apiKey=${geoapifyKey}`
      : {
          version: 8 as const,
          sources: {
            'carto-dark': {
              type: 'raster' as const,
              tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors, © CARTO',
            },
          },
          layers: [
            {
              id: 'carto-dark-layer',
              type: 'raster' as const,
              source: 'carto-dark',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        };

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style,
      center: [77.6200, 13.0000], // Bengaluru center
      zoom: 11,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update route layers when routes or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderRoutes = () => {
      if (!map.isStyleLoaded()) return;

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Remove existing route layers and sources
      routes.forEach((r, idx) => {
        if (map.getLayer(`route-glow-${r.id}`)) map.removeLayer(`route-glow-${r.id}`);
        if (map.getLayer(`route-line-${r.id}`)) map.removeLayer(`route-line-${r.id}`);
        if (map.getSource(`route-source-${r.id}`)) map.removeSource(`route-source-${r.id}`);
      });

      if (routes.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();

      // Render each route alternative
      routes.forEach((r) => {
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

        map.addSource(`route-source-${r.id}`, {
          type: 'geojson',
          data: geojson,
        });

        // Glow layer for safest or selected route
        map.addLayer({
          id: `route-glow-${r.id}`,
          type: 'line',
          source: `route-source-${r.id}`,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': isSafest ? '#818cf8' : '#38bdf8',
            'line-width': isSelected ? 10 : 6,
            'line-opacity': isSelected ? 0.35 : 0.15,
          },
        });

        // Core route line
        map.addLayer({
          id: `route-line-${r.id}`,
          type: 'line',
          source: `route-source-${r.id}`,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': isSafest ? '#6366f1' : isSelected ? '#38bdf8' : '#64748b',
            'line-width': isSelected ? 5 : 3.5,
            'line-opacity': isSelected ? 1.0 : 0.6,
          },
        });

        // Click to select route
        map.on('click', `route-line-${r.id}`, () => {
          onSelectRoute(r.id);
        });

        // Extend bounds
        r.coordinates.forEach((c) => bounds.extend(c as [number, number]));
      });

      // Fit bounds to show entire route
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 45, maxZoom: 15 });
      }

      // Add Haven Markers for selected route
      const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
      if (showHavens && activeRoute?.safeHavens) {
        activeRoute.safeHavens.forEach((haven) => {
          const el = document.createElement('div');
          el.className = 'haven-marker';
          el.innerHTML = `
            <div style="background:#0f766e; color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #2dd4bf; box-shadow:0 0 10px rgba(45,212,191,0.5); cursor:pointer;">
              <span style="font-size:11px; font-weight:bold;">H</span>
            </div>
          `;

          const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
            <div style="color:#0f172a; padding:4px; font-family:sans-serif;">
              <div style="font-size:11px; font-weight:bold; color:#0f766e; text-transform:uppercase;">${haven.category} SAFE HAVEN</div>
              <div style="font-weight:bold; font-size:12px; margin-top:2px;">${haven.name}</div>
              <div style="font-size:11px; color:#475569; margin-top:2px;">${haven.openUntil || 'Open now'} • ~${haven.distanceFromRouteM}m from path</div>
            </div>
          `);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([haven.lon, haven.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });
      }
    };

    if (map.isStyleLoaded()) {
      renderRoutes();
    } else {
      map.once('load', renderRoutes);
    }
  }, [routes, selectedRouteId, showHavens]);

  return (
    <div className="relative w-full h-full min-h-[320px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 text-[11px] text-slate-300 flex items-center gap-2 shadow-lg">
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block shadow-[0_0_8px_#6366f1]" />
        <span>Safest Route</span>
        <span className="text-slate-500">|</span>
        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
        <span>Alternatives</span>
      </div>
    </div>
  );
};
