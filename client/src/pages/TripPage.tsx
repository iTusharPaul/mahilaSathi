import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import {
  TripDTO,
  RouteAlternative,
  PlanTripResponseDTO,
  SafeHaven,
} from '@nightwise/shared';
import {
  nexconnChannels,
  nexconnEngine,
  nexconnPresence,
  ChatMessageItem,
} from '../nexconn/index.js';
import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  buildCheckinPayload,
  buildImOkPayload,
  buildArrivedPayload,
  buildGuardianSosPayload,
  buildJourneyRoomSosPayload,
  buildLivePingPayload,
} from '../lib/config.js';
import { MapComponent } from '../components/MapComponent.js';
import { MessageCard } from '../components/MessageCard.js';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  Navigation,
  MessageSquare,
  Lock,
  ChevronDown,
  ChevronUp,
  Send,
  Footprints,
  UserCheck,
  Check,
} from 'lucide-react';

interface TripPageProps {
  trip: TripDTO;
  route: RouteAlternative;
  plan: PlanTripResponseDTO;
  initialHeadcount: number;
  onTripEnded: () => void;
}

export const TripPage: React.FC<TripPageProps> = ({
  trip,
  route,
  plan,
  initialHeadcount,
  onTripEnded,
}) => {
  const { user } = useAuth();
  const [minutesRemaining, setMinutesRemaining] = useState(trip.etaMinutes);
  const [headcount, setHeadcount] = useState(initialHeadcount);
  const [lastCheckinTime, setLastCheckinTime] = useState<number>(Date.now());
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // SOS button press state
  const [sosHolding, setSosHolding] = useState(false);
  const [sosProgress, setSosProgress] = useState(0);
  const [sosTriggered, setSosTriggered] = useState(false);
  const holdIntervalRef = useRef<any>(null);

  // Escalation prompt state (§6.5)
  const [escalationPromptOpen, setEscalationPromptOpen] = useState(false);
  const [escalationSecondsLeft, setEscalationSecondsLeft] = useState(300); // 5 mins

  // Journey Room Chat state
  const [roomMessages, setRoomMessages] = useState<ChatMessageItem[]>([]);
  const [roomInput, setRoomInput] = useState('');
  const [roomOpen, setRoomOpen] = useState(true);

  // Walk Together Modal state
  const [walkTogetherModalOpen, setWalkTogetherModalOpen] = useState(false);
  const [selectedHavenForWalk, setSelectedHavenForWalk] = useState<SafeHaven | null>(
    route.safeHavens[0] || null
  );

  // Completion modal
  const [arrivedSummaryOpen, setArrivedSummaryOpen] = useState(false);

  // 1. Initial narration: send NW:trip_started to Guardian Circle
  useEffect(() => {
    // Send trip started card to guardian circle
    nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED,
      {
        tripId: trip.id,
        originArea: trip.originArea,
        destArea: trip.destArea,
        etaMinutes: trip.etaMinutes,
        score: trip.score,
        mode: trip.mode,
      }
    ).catch(console.error);

    // Load initial room messages
    nexconnChannels.fetchHistory('group', trip.journeyGroupId, 30)
      .then(setRoomMessages)
      .catch(console.error);
  }, []);

  // 2. Journey Room realtime listener
  useEffect(() => {
    const unsub = nexconnEngine.onRawMessages((rawMessages) => {
      const roomMsgs = rawMessages.filter(
        (m: any) =>
          m.channelId === trip.journeyGroupId ||
          m.targetId === trip.journeyGroupId ||
          (m as any).conversationId === trip.journeyGroupId
      );

      if (roomMsgs.length > 0) {
        setRoomMessages((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          const additions: ChatMessageItem[] = [];
          for (const m of roomMsgs as any[]) {
            const id = m.messageId || m.id || String(m.sentTime);
            if (!ids.has(id)) {
              additions.push({
                id,
                channelType: 'group',
                channelId: trip.journeyGroupId,
                senderId: m.senderUserId || m.senderId || 'unknown',
                senderName: m.senderName,
                messageType: m.messageType,
                content: m.content,
                sentTime: m.sentTime || Date.now(),
              });
            }
          }
          return [...prev, ...additions];
        });
      }
    });

    return () => unsub();
  }, [trip.journeyGroupId]);

  // 3. Heartbeat timers: emit live_ping every 60s & update progress
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.round((now - trip.startedAt) / 60000);
      setElapsedMinutes(elapsed);

      const rem = Math.max(0, trip.etaMinutes - elapsed);
      setMinutesRemaining(rem);

      // Status ping every 60s (not persisted, drives room liveness per §6.2)
      const progressPct = Math.min(100, Math.round((elapsed / trip.etaMinutes) * 100));
      nexconnChannels.sendCustomMessage(
        'group',
        trip.journeyGroupId,
        NEXCONN_CUSTOM_MESSAGE_TYPES.LIVE_PING,
        buildLivePingPayload({ tripId: trip.id, progressPct })
      ).catch(() => {});

      // Call backend heartbeat
      api.checkinTrip(trip.id).catch(() => {});

      // Check for escalation prompt trigger: ETA + 10 mins
      if (now > trip.etaAt + 10 * 60 * 1000 && !escalationPromptOpen && !arrivedSummaryOpen) {
        setEscalationPromptOpen(true);
      }
    }, 10000); // check every 10s

    return () => clearInterval(interval);
  }, [trip, escalationPromptOpen, arrivedSummaryOpen]);

  // 4. Escalation prompt countdown (§6.5)
  useEffect(() => {
    if (!escalationPromptOpen) return;

    const timer = setInterval(() => {
      setEscalationSecondsLeft((sec) => {
        if (sec <= 1) {
          clearInterval(timer);
          triggerAutoEscalation();
          return 0;
        }
        return sec - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [escalationPromptOpen]);

  const triggerAutoEscalation = async () => {
    setEscalationPromptOpen(false);
    // Auto-alert to Guardian Circle
    const nearestHaven = route.safeHavens[0];
    const sosPayload = buildGuardianSosPayload({
      tripId: trip.id,
      coarseArea: trip.destArea,
      nearestHavenName: nearestHaven?.name || 'Safe Haven Area',
      havenDistanceM: nearestHaven?.distanceFromRouteM || 100,
      havenOpenUntil: nearestHaven?.openUntil || 'Open now',
      preciseCoords: { lat: plan.destination.coords.lat, lon: plan.destination.coords.lon },
    });

    await nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      sosPayload
    );

    await nexconnChannels.sendTextMessage(
      'group',
      trip.circleGroupId,
      '⚠️ AUTOMATED ESCALATION ALERT: Traveller did not respond to the arrival safety check-in.'
    );
  };

  // Handle manual Check-in "I'm okay"
  const handleCheckin = async () => {
    const now = Date.now();
    setLastCheckinTime(now);

    const payload = buildCheckinPayload({
      tripId: trip.id,
      segmentLabel: `${trip.originArea} Corridor`,
      minutesRemaining,
      escalated: false,
    });

    // Send check-in card to guardian circle
    await nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN,
      payload
    );

    // Call backend
    await api.checkinTrip(trip.id);
  };

  // Handle Escalation Prompt "Yes, I'm okay"
  const handleConfirmImOk = async () => {
    setEscalationPromptOpen(false);
    const imOk = buildImOkPayload({ tripId: trip.id });
    await nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK,
      imOk
    );
  };

  // Handle SOS Button (long-press 1.5s to confirm)
  const handleSosStart = () => {
    setSosHolding(true);
    let prog = 0;
    holdIntervalRef.current = setInterval(() => {
      prog += 10;
      setSosProgress(prog);
      if (prog >= 100) {
        clearInterval(holdIntervalRef.current);
        setSosHolding(false);
        triggerSosFanOut();
      }
    }, 150); // 1.5 seconds total hold
  };

  const handleSosEnd = () => {
    clearInterval(holdIntervalRef.current);
    setSosHolding(false);
    setSosProgress(0);
  };

  const triggerSosFanOut = async () => {
    setSosTriggered(true);
    const nearestHaven = route.safeHavens[0];
    const havenName = nearestHaven?.name || 'Local Safe Haven';
    const havenDist = nearestHaven?.distanceFromRouteM || 150;
    const havenOpen = nearestHaven?.openUntil || 'Open now';

    // 1. Guardian Circle SOS (includes exact coordinates)
    const guardianPayload = buildGuardianSosPayload({
      tripId: trip.id,
      coarseArea: trip.destArea,
      nearestHavenName: havenName,
      havenDistanceM: havenDist,
      havenOpenUntil: havenOpen,
      preciseCoords: { lat: plan.destination.coords.lat, lon: plan.destination.coords.lon },
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      guardianPayload
    );

    // 2. Journey Room SOS (coarse only - strictly NO coordinates, Rule R2)
    const roomPayload = buildJourneyRoomSosPayload({
      tripId: trip.id,
      coarseArea: trip.destArea,
      nearestHavenName: havenName,
      havenDistanceM: havenDist,
      havenOpenUntil: havenOpen,
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      trip.journeyGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      roomPayload
    );

    // 3. Backend recording
    await api.triggerSos(trip.id, roomPayload);
  };

  // Handle "I've Arrived"
  const handleArrive = async () => {
    const elapsed = Math.max(1, Math.round((Date.now() - trip.startedAt) / 60000));

    // 1. Send NW:arrived card to Guardian Circle
    const arrivedPayload = buildArrivedPayload({
      tripId: trip.id,
      durationMinutes: elapsed,
      score: trip.score,
    });
    await nexconnChannels.sendCustomMessage(
      'group',
      trip.circleGroupId,
      NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED,
      arrivedPayload
    );

    // 2. Call backend end-trip endpoint (cleans up Journey Room when 0 active)
    await api.endTrip(trip.id, 'arrived');

    setArrivedSummaryOpen(true);
  };

  // Send message in Journey Room
  const handleSendRoomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInput.trim()) return;
    const txt = roomInput.trim();
    setRoomInput('');

    await nexconnChannels.sendTextMessage('group', trip.journeyGroupId, txt);
  };

  // Request Walk Together
  const handleRequestWalkTogether = async () => {
    if (!selectedHavenForWalk) return;
    try {
      await api.requestWalkTogether({
        targetId: 'room_fellow',
        targetHandle: 'Corridor Companion',
        corridorKey: trip.corridorKey,
        havenName: selectedHavenForWalk.name,
        havenCoords: { lat: selectedHavenForWalk.lat, lon: selectedHavenForWalk.lon },
      });
      alert(`Walk Together invite sent! Meeting point: ${selectedHavenForWalk.name}. 1-to-1 chat will unlock upon mutual acceptance.`);
      setWalkTogetherModalOpen(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const minutesSinceCheckin = Math.round((Date.now() - lastCheckinTime) / 60000);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Left Active Dashboard */}
      <div className="w-full lg:w-[460px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/60 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Active Trip Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Trip In Progress</span>
            </div>
            <h2 className="text-lg font-extrabold text-white mt-0.5">
              {trip.originArea} <span className="text-slate-500">→</span> {trip.destArea}
            </h2>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium">ETA Remaining</div>
            <div className="text-2xl font-black text-white">{minutesRemaining}m</div>
          </div>
        </div>

        {/* Rule R3 Privacy Banner */}
        <div className="p-3 rounded-xl bg-indigo-950/50 border border-indigo-900/60 text-xs text-indigo-200/90 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Safety Rule R3:</strong> Your route endpoints are trimmed by 300m for anyone outside your Guardian Circle. Home addresses cannot be inferred.
          </span>
        </div>

        {/* Guardian Status Line */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Guardians notified in private circle</span>
          </div>
          <span className="text-slate-400">
            Last check-in {minutesSinceCheckin === 0 ? 'just now' : `${minutesSinceCheckin}m ago`}
          </span>
        </div>

        {/* Main Action Buttons: Check-in & SOS */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          {/* Big Check-in Button */}
          <button
            onClick={handleCheckin}
            className="py-4 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex flex-col items-center justify-center gap-1 shadow-lg shadow-indigo-600/30"
          >
            <CheckCircle2 className="w-6 h-6 text-indigo-200" />
            <span className="text-sm">Check-in: I'm OK</span>
            <span className="text-[10px] text-indigo-200/80 font-normal">Sends update to guardians</span>
          </button>

          {/* Big SOS Button with Long-press Progress */}
          <div className="relative">
            <button
              onMouseDown={handleSosStart}
              onMouseUp={handleSosEnd}
              onTouchStart={handleSosStart}
              onTouchEnd={handleSosEnd}
              className={`w-full h-full py-4 px-3 rounded-2xl font-bold transition flex flex-col items-center justify-center gap-1 shadow-xl relative overflow-hidden select-none ${
                sosTriggered
                  ? 'bg-rose-950 border-2 border-rose-600 text-rose-300'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
              }`}
            >
              {sosHolding && (
                <div
                  className="absolute inset-0 bg-rose-800 opacity-60 transition-all duration-100"
                  style={{ width: `${sosProgress}%` }}
                />
              )}
              <AlertTriangle className="w-6 h-6 relative z-10" />
              <span className="text-sm relative z-10">
                {sosTriggered ? 'SOS SENT' : sosHolding ? 'HOLDING...' : 'HOLD FOR SOS'}
              </span>
              <span className="text-[10px] text-rose-200/90 font-normal relative z-10">
                {sosHolding ? `${Math.round(sosProgress)}%` : 'Hold 1.5s to confirm'}
              </span>
            </button>
          </div>
        </div>

        {/* Arrival Confirmation Button */}
        <button
          onClick={handleArrive}
          className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition"
        >
          <Check className="w-5 h-5" />
          <span>I've Arrived Safely</span>
        </button>

        {/* Journey Room (Community Layer) Accordion */}
        <div className="mt-4 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
          <div
            onClick={() => setRoomOpen(!roomOpen)}
            className="p-3.5 bg-slate-800/60 flex items-center justify-between cursor-pointer border-b border-slate-800"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-400" />
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Journey Room</span>
                  <span className="px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 text-[10px] border border-teal-800">
                    {headcount} women travelling now
                  </span>
                </div>
                <div className="text-[10px] text-slate-400">Scoped to this corridor • Ephemeral</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setWalkTogetherModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-teal-700/80 hover:bg-teal-600 text-white text-[11px] font-semibold transition"
              >
                Walk Together
              </button>
              {roomOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>

          {roomOpen && (
            <div className="p-3 space-y-2">
              {/* Room messages */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 text-xs">
                {roomMessages.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs italic">
                    You joined this corridor Journey Room. Say hi or coordinate with women nearby!
                  </div>
                ) : (
                  roomMessages.map((m) => (
                    <MessageCard
                      key={m.id}
                      message={m}
                      isSelf={m.senderId === user?.id}
                      onReport={() => {}}
                      onBlock={() => {}}
                    />
                  ))
                )}
              </div>

              {/* Room message input */}
              <form onSubmit={handleSendRoomMessage} className="flex gap-2 pt-1 border-t border-slate-800">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder={`Chat anonymously as ${user?.handle}...`}
                  className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!roomInput.trim()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Right Map Canvas with live route and safe havens */}
      <div className="flex-1 relative flex flex-col p-3 lg:p-4 h-[300px] lg:h-full">
        <MapComponent
          routes={[route]}
          selectedRouteId={route.id}
          onSelectRoute={() => {}}
          showHavens={true}
          showCameras={true}
        />
      </div>

      {/* Escalation Prompt Modal (§6.5) */}
      {escalationPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-bounce-short">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Are You Okay?</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your estimated trip time has passed. Please confirm you are safe.
              </p>
            </div>

            <div className="text-xs text-amber-300 font-mono">
              Auto-alerting guardians in {Math.floor(escalationSecondsLeft / 60)}:
              {(escalationSecondsLeft % 60).toString().padStart(2, '0')}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleConfirmImOk}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30"
              >
                Yes, I am okay!
              </button>
              <button
                onClick={() => {
                  setEscalationPromptOpen(false);
                  triggerSosFanOut();
                }}
                className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
              >
                Trigger SOS Emergency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Walk Together Modal (§8.5) */}
      {walkTogetherModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-teal-400 font-bold text-base">
              <Footprints className="w-5 h-5" />
              <span>Walk Together (Mutual Opt-in)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Coordinate to walk alongside other women travelling this corridor. Select an open, staffed Safe Haven as your meeting point. A private direct chat will open only if the other traveller accepts (Rule R4).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Meeting Safe Haven (Open & Staffed)
              </label>
              <select
                value={selectedHavenForWalk?.id}
                onChange={(e) => {
                  const h = route.safeHavens.find((x) => x.id === e.target.value);
                  setSelectedHavenForWalk(h || null);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              >
                {route.safeHavens.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.category}) — {h.openUntil || 'Open now'}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setWalkTogetherModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestWalkTogether}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs"
              >
                Send Walk Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Arrived Summary Modal */}
      {arrivedSummaryOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/60 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">Arrived Safely!</h3>
              <p className="text-xs text-slate-300 mt-1">
                Your Guardian Circle has been notified. The Journey Room for this corridor has dissolved to protect privacy.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex justify-around text-xs">
              <div>
                <div className="text-slate-400">Total Duration</div>
                <div className="text-base font-bold text-white">{elapsedMinutes} mins</div>
              </div>
              <div>
                <div className="text-slate-400">Safety Score</div>
                <div className="text-base font-bold text-emerald-400">{trip.score}/100</div>
              </div>
            </div>

            <button
              onClick={onTripEnded}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition"
            >
              Return to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
