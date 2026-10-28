import React, { useState } from 'react';
import { RouteAlternative } from '@nightwise/shared';
import {
  Shield,
  Clock,
  Navigation,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Eye,
  Store,
  Footprints,
  Compass,
  CheckCircle2,
  Moon,
} from 'lucide-react';

interface RouteCardProps {
  route: RouteAlternative;
  isSelected: boolean;
  onSelect: () => void;
  onStartTrip: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  onSelect,
  onStartTrip,
}) => {
  const [expanded, setExpanded] = useState(false);
  const isSafest = route.label === 'Safest';

  const confidenceColor =
    route.confidence === 'high'
      ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40'
      : route.confidence === 'medium'
      ? 'text-amber-400 bg-amber-950/60 border-amber-800/40'
      : 'text-slate-400 bg-slate-900 border-slate-800';

  return (
    <div
      onClick={onSelect}
      className={`rounded-2xl transition border p-4 cursor-pointer relative shadow-lg ${
        isSelected
          ? isSafest
            ? 'bg-indigo-950/40 border-indigo-500 shadow-indigo-950/50 ring-1 ring-indigo-500/50'
            : 'bg-slate-900/90 border-sky-500 shadow-sky-950/50 ring-1 ring-sky-500/50'
          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Header: Badge, Duration, Distance */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold tracking-wider uppercase border ${
              isSafest
                ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm shadow-indigo-600/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {route.label}
          </span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${confidenceColor}`}>
            data confidence: {route.confidence}
          </span>
        </div>

        {/* Night Activity Score Dial */}
        <div className="flex items-center gap-1.5">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-medium">Night Score</div>
            <div className="text-base font-extrabold text-white leading-none">
              {route.score}
              <span className="text-[10px] text-slate-500 font-normal">/100</span>
            </div>
          </div>
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm border shadow-md ${
              route.score >= 75
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                : route.score >= 50
                ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300'
                : 'bg-amber-950/80 border-amber-500 text-amber-300'
            }`}
          >
            {route.score}
          </div>
        </div>
      </div>

      {/* Route Time & Distance */}
      <div className="flex items-center gap-4 text-sm font-semibold text-white my-2">
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-indigo-400" />
          {route.durationMinutes} mins
        </span>
        <span className="text-slate-500">•</span>
        <span className="text-slate-300">
          {(route.distanceMeters / 1000).toFixed(1)} km
        </span>
        <span className="text-slate-500">•</span>
        <span className="text-xs text-slate-400 font-normal truncate max-w-[180px]">
          {route.summary}
        </span>
      </div>

      {/* Safety Highlights Callout */}
      <div className="my-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-slate-300">
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
          Dark gap: <strong className="text-white">{route.longestDarkGapMeters}m</strong>
        </span>
        <span className="flex items-center gap-1 text-slate-300">
          <Store className="w-3.5 h-3.5 text-teal-400" />
          Havens: <strong className="text-white">{route.safeHavens?.length || 0} open</strong>
        </span>
        {route.cctvCameraCount > 0 && (
          <span className="flex items-center gap-1 text-slate-300">
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            CCTV: <strong className="text-white">{route.cctvCameraCount}</strong>
          </span>
        )}
      </div>

      {/* Expand Factor Breakdown Button */}
      <div className="pt-1 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition"
        >
          <span>{expanded ? 'Hide score breakdown' : 'View score breakdown'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStartTrip();
            }}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition"
          >
            <Footprints className="w-3.5 h-3.5" />
            <span>Start Trip</span>
          </button>
        )}
      </div>

      {/* Expandable Breakdown Bars (§7.3) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 text-xs" onClick={(e) => e.stopPropagation()}>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Safety Score Breakdown (0–100)
          </div>

          <BreakdownBar
            label="Open Places Density"
            weight="22%"
            value={route.breakdown.openPlacesDensity}
            detail="Shops, pharmacies & cafes open now"
          />
          <BreakdownBar
            label="Longest Dark Gap"
            weight="20%"
            value={route.breakdown.longestDarkGap}
            detail={`Longest stretch without open shops: ${route.longestDarkGapMeters}m`}
          />
          <BreakdownBar
            label="Main Road Share"
            weight="16%"
            value={route.breakdown.mainRoadShare}
            detail="Primary/secondary illuminated roads"
          />
          <BreakdownBar
            label="Help Points"
            weight="10%"
            value={route.breakdown.helpPoints}
            detail="Hospitals, 24/7 pharmacies & police"
          />
          <BreakdownBar
            label="Active Transport"
            weight="10%"
            value={route.breakdown.transportPoints}
            detail="Bus stops, metro & transport hubs"
          />
          <BreakdownBar
            label="Community Pulse"
            weight="10%"
            value={route.breakdown.communityPulse}
            detail="Recent community reports & completions"
          />
          <BreakdownBar
            label="Route Simplicity"
            weight="7%"
            value={route.breakdown.simplicity}
            detail="Fewer turns & straightforward corridors"
          />
          <BreakdownBar
            label="Mapped CCTV Cameras"
            weight="5%"
            value={route.breakdown.cameraCoverage}
            detail="Within 75m of mapped surveillance"
          />

          {route.breakdown.excludedFactors && route.breakdown.excludedFactors.length > 0 && (
            <div className="p-2 rounded-lg bg-slate-950 text-[11px] text-slate-400 italic">
              * Note: Limited data on some segments; weights were redistributed proportionally (Rule R5).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const BreakdownBar: React.FC<{ label: string; weight: string; value: number; detail: string }> = ({
  label,
  weight,
  value,
  detail,
}) => {
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
        <span>
          {label} <span className="text-slate-500 font-mono text-[10px]">({weight})</span>
        </span>
        <span className="font-semibold text-white">{pct}%</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{detail}</div>
    </div>
  );
};
