import React, { useState } from 'react';
import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  TripStartedPayload,
  CheckinPayload,
  ImOkPayload,
  ArrivedPayload,
  GuardianSosPayload,
  JourneyRoomSosPayload,
  HavenCardPayload,
  ReportPayload,
} from '../lib/config.js';
import { ChatMessageItem } from '../nexconn/channels.js';
import {
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Shield,
  MapPin,
  Clock,
  MoreVertical,
  Flag,
  UserX,
  Store,
  Footprints,
  Car,
} from 'lucide-react';

interface MessageCardProps {
  message: ChatMessageItem;
  isSelf: boolean;
  onReport: (messageId: string, senderId: string) => void;
  onBlock: (senderId: string) => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({
  message,
  isSelf,
  onReport,
  onBlock,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { messageType, content, senderId, senderName, sentTime } = message;

  const timeStr = new Date(sentTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Custom Card: Trip Started
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED) {
    const p = content as TripStartedPayload;
    return (
      <div className="my-3 px-3 py-3 rounded-2xl bg-indigo-950/60 border border-indigo-700/50 shadow-lg text-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase">
            {p.mode === 'walk' ? <Footprints className="w-4 h-4" /> : <Car className="w-4 h-4" />}
            <span>Trip Started</span>
          </div>
          <span className="text-[11px] text-slate-400">{timeStr}</span>
        </div>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{p.originArea || 'Origin'}</span>
          <span className="text-slate-500">→</span>
          <span className="text-indigo-300 font-semibold">{p.destArea || 'Destination'}</span>
        </div>
        <div className="mt-2.5 pt-2 border-t border-indigo-900/60 flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            ETA ~{p.etaMinutes} mins
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
            Safety Score: {p.score}/100
          </span>
        </div>
      </div>
    );
  }

  // Custom Card: Check-in
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN) {
    const p = content as CheckinPayload;
    return (
      <div className="my-2 flex justify-center">
        <div className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-2 border shadow-sm ${
          p.escalated
            ? 'bg-amber-950/80 border-amber-500/60 text-amber-200 animate-pulse'
            : 'bg-slate-900/90 border-slate-700/60 text-slate-300'
        }`}>
          <MapPin className={`w-3.5 h-3.5 ${p.escalated ? 'text-amber-400' : 'text-teal-400'}`} />
          <span>
            {senderName || senderId} checked in at <strong className="text-white">{p.segmentLabel}</strong>
            {p.minutesRemaining !== undefined ? ` (~${p.minutesRemaining}m left)` : ''}
          </span>
          <span className="text-[10px] text-slate-500">{timeStr}</span>
        </div>
      </div>
    );
  }

  // Custom Card: I'm OK
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK) {
    return (
      <div className="my-2 flex justify-center">
        <div className="px-3 py-1.5 rounded-full text-xs flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{senderName || senderId} confirmed: <strong>"I am okay"</strong></span>
          <span className="text-[10px] text-emerald-400/70">{timeStr}</span>
        </div>
      </div>
    );
  }

  // Custom Card: Arrived Safely
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED) {
    const p = content as ArrivedPayload;
    return (
      <div className="my-3 px-4 py-3 rounded-2xl bg-emerald-950/70 border border-emerald-600/50 shadow-lg text-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4" />
            <span>Arrived Safely</span>
          </div>
          <span className="text-[11px] text-slate-400">{timeStr}</span>
        </div>
        <p className="text-sm text-slate-200 font-medium">
          {senderName || senderId} reached their destination safely.
        </p>
        <div className="mt-2 text-xs text-emerald-300/90 flex gap-4">
          <span>Duration: {p.durationMinutes} mins</span>
          <span>Route Score: {p.score}/100</span>
        </div>
      </div>
    );
  }

  // Custom Card: SOS Priority Alert
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.SOS) {
    const p = content as (GuardianSosPayload | JourneyRoomSosPayload);
    const hasCoords = 'preciseCoords' in p && p.preciseCoords;

    return (
      <div className="my-3 px-4 py-3.5 rounded-2xl bg-rose-950/90 border-2 border-rose-600 text-rose-50 shadow-2xl animate-in fade-in">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-rose-400 font-extrabold text-sm tracking-wider uppercase">
            <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
            <span>EMERGENCY SOS ALERT</span>
          </div>
          <span className="text-xs text-rose-300/80">{timeStr}</span>
        </div>
        <p className="text-sm font-semibold text-white">
          {senderName || senderId} triggered an SOS emergency alert near{' '}
          <span className="underline underline-offset-2 decoration-rose-500">{p.coarseArea}</span>.
        </p>

        {p.nearestHavenName && (
          <div className="mt-3 p-2.5 rounded-xl bg-black/40 border border-rose-800/60 text-xs">
            <div className="flex items-center gap-1.5 text-rose-300 font-medium mb-1">
              <Shield className="w-3.5 h-3.5 text-rose-400" />
              <span>Nearest Open Safe Haven:</span>
            </div>
            <div className="text-white font-bold">{p.nearestHavenName}</div>
            <div className="text-slate-400 mt-0.5">
              ~{p.havenDistanceM}m away • {p.havenOpenUntil || 'Open now'}
            </div>
          </div>
        )}

        {hasCoords && (
          <div className="mt-2 text-[11px] text-emerald-400 bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">
            ✓ Guardian Live GPS Pin: {p.preciseCoords.lat.toFixed(4)}, {p.preciseCoords.lon.toFixed(4)}
          </div>
        )}
      </div>
    );
  }

  // Custom Card: Safe Haven Card
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.HAVEN_CARD) {
    const p = content as HavenCardPayload;
    return (
      <div className="my-2 p-3 rounded-xl bg-slate-900 border border-slate-700/60 text-xs">
        <div className="flex items-center gap-1.5 text-teal-400 font-semibold mb-1">
          <Store className="w-3.5 h-3.5" />
          <span>{p.category.toUpperCase()} SAFE HAVEN</span>
        </div>
        <div className="text-sm font-bold text-white">{p.name}</div>
        <div className="text-slate-400 mt-0.5">
          {p.areaLabel} • ~{p.distanceM}m away • <span className="text-teal-300">{p.openUntil}</span>
        </div>
      </div>
    );
  }

  // Custom Card: Community Report Chip
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.REPORT) {
    const p = content as ReportPayload;
    const categoryLabels: Record<string, string> = {
      streetlight_out: '💡 Streetlight Out',
      deserted: '🌑 Deserted Stretch',
      lively: '✨ Lively & Active',
      place_open: '🏪 Place Open Now',
      place_closed: '🚪 Place Closed',
      other: '📢 Community Note',
    };
    return (
      <div className="my-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
        <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
          <span>{senderName || senderId} posted a report</span>
          <span>{timeStr}</span>
        </div>
        <div className="inline-block px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 font-semibold text-[11px]">
          {categoryLabels[p.category] || p.category}
        </div>
        {p.note && <p className="mt-1.5 text-slate-300 italic">"{p.note}"</p>}
      </div>
    );
  }

  // Live Ping (status message)
  if (messageType === NEXCONN_CUSTOM_MESSAGE_TYPES.LIVE_PING) {
    return null; // Not rendered in visible chat history per §6.2
  }

  // Standard Text Message Bubble
  const textContent = content?.content || content?.text || (typeof content === 'string' ? content : '');

  // Unknown custom or fallback message type: generic system line (never crash)
  if (messageType.startsWith('NW:') && !textContent) {
    return (
      <div className="my-1 text-center text-[11px] text-slate-500 italic">
        [System notification: {messageType}]
      </div>
    );
  }

  return (
    <div className={`my-1.5 flex flex-col ${isSelf ? 'items-end' : 'items-start'} group relative`}>
      {!isSelf && (
        <span className="text-[11px] font-semibold text-slate-400 mb-0.5 ml-2">
          {senderName || senderId}
        </span>
      )}
      <div className="flex items-center gap-1.5 max-w-[85%]">
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
            isSelf
              ? 'bg-indigo-600 text-white rounded-br-sm shadow-md'
              : 'bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/60'
          }`}
        >
          {textContent}
          <div className={`text-[10px] text-right mt-1 ${isSelf ? 'text-indigo-200' : 'text-slate-400'}`}>
            {timeStr}
          </div>
        </div>

        {/* Menu button for Report / Block (§6.7) */}
        {!isSelf && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800/80 transition"
              title="Message options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-30 w-36 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 text-xs">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onReport(message.id, senderId);
                  }}
                  className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-950/40 flex items-center gap-1.5"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onBlock(senderId);
                  }}
                  className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Block User</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
