import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { PlanTripResponseDTO, RouteAlternative, TravelMode } from '@nightwise/shared';
import { MapComponent } from '../components/MapComponent.js';
import { RouteCard } from '../components/RouteCard.js';
import {
  Navigation,
  MapPin,
  Footprints,
  Car,
  Search,
  Sparkles,
  Shield,
  Layers,
  Store,
  Eye,
  AlertCircle,
  Locate,
} from 'lucide-react';

interface HomePageProps {
  onStartTrip: (plan: PlanTripResponseDTO, route: RouteAlternative) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onStartTrip }) => {
  const [originText, setOriginText] = useState('Manyata Tech Park');
  const [destText, setDestText] = useState('Whitefield');
  const [mode, setMode] = useState<TravelMode>('walk');
  const [planResult, setPlanResult] = useState<PlanTripResponseDTO | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showHavens, setShowHavens] = useState(true);
  const [showCameras, setShowCameras] = useState(false);

  // Automatically plan demo corridor on initial load
  useEffect(() => {
    handlePlan();
  }, []);

  const handlePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!originText.trim() || !destText.trim()) return;

    setError(null);
    setLoading(true);
    try {
      const res = await api.planTrip({
        originText: originText.trim(),
        destText: destText.trim(),
        mode,
      });
      setPlanResult(res);

      // Select Safest route by default
      const safest = res.routes.find((r: RouteAlternative) => r.label === 'Safest') || res.routes[0];
      setSelectedRouteId(safest ? safest.id : null);
    } catch (err: any) {
      setError(err.message || 'Failed to compute routes');
    } finally {
      setLoading(false);
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOriginText(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => {
        alert('Could not retrieve current GPS position. Please type your location.');
      }
    );
  };

  const selectedRoute = planResult?.routes.find((r) => r.id === selectedRouteId) || planResult?.routes[0];

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] bg-slate-950 overflow-hidden text-slate-100">
      {/* Left Planning Column */}
      <div className="w-full lg:w-[480px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/40 overflow-y-auto">
        <div className="p-4 sm:p-5 border-b border-slate-800 space-y-4">
          <div>
            <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <span>NightWise Route Engine</span>
            </h1>
            <p className="text-xs text-indigo-300 font-medium mt-0.5">
              Scores routes by what is alive along the path after dark.
            </p>
          </div>

          {/* Quick Corridor Presets for Bengaluru */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="text-[11px] text-slate-400 py-1 font-semibold">Demo Corridors:</span>
            <button
              type="button"
              onClick={() => {
                setOriginText('Manyata Tech Park');
                setDestText('Whitefield');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px]"
            >
              Manyata ↔ Whitefield
            </button>
            <button
              type="button"
              onClick={() => {
                setOriginText('Koramangala 5th Block');
                setDestText('100ft Rd, Indiranagar');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px]"
            >
              Koramangala ↔ Indiranagar
            </button>
          </div>

          {/* Input Form */}
          <form onSubmit={handlePlan} className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Origin</span>
                </label>
                <button
                  type="button"
                  onClick={handleUseLocation}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Locate className="w-3 h-3" />
                  <span>Use current location</span>
                </button>
              </div>
              <input
                type="text"
                value={originText}
                onChange={(e) => setOriginText(e.target.value)}
                placeholder="Origin in Bengaluru..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-teal-400" />
                <span>Destination</span>
              </label>
              <input
                type="text"
                value={destText}
                onChange={(e) => setDestText(e.target.value)}
                placeholder="Destination in Bengaluru..."
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Travel Mode Toggle */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700">
                <button
                  type="button"
                  onClick={() => setMode('walk')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    mode === 'walk' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Footprints className="w-3.5 h-3.5" />
                  <span>Walking</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('drive')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    mode === 'drive' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" />
                  <span>Driving / Auto</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !originText || !destText}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
              >
                {loading ? (
                  <span>Scoring...</span>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Plan Routes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Route Alternatives List */}
        <div className="flex-1 p-4 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400 space-y-2">
              <div className="w-8 h-8 mx-auto border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p>Analyzing open pharmacies, hospitals, lighting, and turns along routes...</p>
            </div>
          ) : planResult && planResult.routes.length > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Route Alternatives ({planResult.routes.length})</span>
                <span className="text-[11px] text-indigo-300">Fastest vs Safest</span>
              </div>

              {planResult.routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  isSelected={route.id === selectedRouteId}
                  onSelect={() => setSelectedRouteId(route.id)}
                  onStartTrip={() => onStartTrip(planResult, route)}
                />
              ))}

              {/* Safe Havens on selected route preview */}
              {selectedRoute && selectedRoute.safeHavens.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-400 uppercase tracking-wider">
                    <Store className="w-4 h-4" />
                    <span>Open Safe Havens along {selectedRoute.label} Route</span>
                  </div>
                  <div className="space-y-1.5 divide-y divide-slate-800/80">
                    {selectedRoute.safeHavens.slice(0, 4).map((h) => (
                      <div key={h.id} className="pt-1.5 first:pt-0 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-semibold text-white">{h.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {h.category} • ~{h.distanceFromRouteM}m from path
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                          {h.openUntil || 'Open now'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs">
              Enter an origin and destination in Bengaluru to compare Fastest vs Safest routes.
            </div>
          )}
        </div>
      </div>

      {/* Right Map Canvas */}
      <div className="flex-1 relative flex flex-col p-3 lg:p-4 h-[340px] lg:h-full">
        <MapComponent
          routes={planResult ? planResult.routes : []}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          showHavens={showHavens}
          showCameras={showCameras}
        />

        {/* Map Overlays Toggle Bar */}
        <div className="absolute bottom-6 right-6 z-20 flex gap-2">
          <button
            onClick={() => setShowHavens(!showHavens)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur border shadow-lg flex items-center gap-1.5 transition ${
              showHavens
                ? 'bg-teal-900/90 text-teal-100 border-teal-500'
                : 'bg-slate-900/80 text-slate-400 border-slate-700'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Safe Havens</span>
          </button>
        </div>
      </div>
    </div>
  );
};
