import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import {
  nexconnChannels,
  nexconnEngine,
  SupportedChannelType,
  ChatMessageItem,
} from '../nexconn/index.js';
import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  SEEDED_NEIGHBOURHOODS,
  buildTripStartedPayload,
  buildCheckinPayload,
  buildImOkPayload,
  buildArrivedPayload,
  buildGuardianSosPayload,
  buildJourneyRoomSosPayload,
} from '../lib/config.js';
import { MessageCard } from '../components/MessageCard.js';
import {
  Shield,
  Users,
  Compass,
  MessageSquare,
  Send,
  AlertCircle,
  Flag,
  UserX,
  Play,
  CheckCircle,
  AlertTriangle,
  MapPin,
  ChevronLeft,
} from 'lucide-react';

interface ActiveChannelInfo {
  type: SupportedChannelType;
  id: string;
  title: string;
  subtitle?: string;
  isCircle?: boolean;
}

export const ChatsPage: React.FC = () => {
  const { user, connectionState } = useAuth();
  const [circleGroupId, setCircleGroupId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<ActiveChannelInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);

  // Report & Block Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ messageId: string; senderId: string } | null>(null);
  const [reportReason, setReportReason] = useState('Spam or inappropriate behavior');
  const [blockConfirmUser, setBlockConfirmUser] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load user's Guardian Circle group ID on mount
  useEffect(() => {
    api.getCircle().then(({ circle }) => {
      if (circle) {
        setCircleGroupId(circle.nexconnGroupId);
        // Default to guardian circle
        setActiveChannel({
          type: 'group',
          id: circle.nexconnGroupId,
          title: 'My Guardian Circle',
          subtitle: `${circle.members.length} members`,
          isCircle: true,
        });
      }
    }).catch(console.error);
  }, []);

  // Listen to incoming realtime messages
  useEffect(() => {
    const unsub = nexconnEngine.onRawMessages((rawMessages) => {
      if (!activeChannel) return;
      const incomingForCurrent = rawMessages.filter(
        (m: any) =>
          m.channelId === activeChannel.id ||
          m.targetId === activeChannel.id ||
          (m as any).conversationId === activeChannel.id
      );

      if (incomingForCurrent.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((x) => x.id));
          const newItems: ChatMessageItem[] = [];
          for (const m of incomingForCurrent as any[]) {
            const id = m.messageId || m.id || String(m.sentTime);
            if (!existingIds.has(id)) {
              newItems.push({
                id,
                channelType: activeChannel.type,
                channelId: activeChannel.id,
                senderId: m.senderUserId || m.senderId || 'unknown',
                senderName: m.senderName,
                messageType: m.messageType,
                content: m.content,
                sentTime: m.sentTime || Date.now(),
              });
            }
          }
          return [...prev, ...newItems];
        });
      }
    });

    return () => {
      unsub();
    };
  }, [activeChannel]);

  // Load history when active channel changes
  useEffect(() => {
    if (!activeChannel) return;
    setLoadingHistory(true);

    if (activeChannel.type === 'open') {
      nexconnChannels.enterOpenChannel(activeChannel.id).catch(console.error);
    }

    nexconnChannels.fetchHistory(activeChannel.type, activeChannel.id, 50)
      .then((history) => {
        setMessages(history);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error('Error fetching history:', err);
        setLoadingHistory(false);
      });
  }, [activeChannel]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannel || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    const res = await nexconnChannels.sendTextMessage(activeChannel.type, activeChannel.id, text);
    if (!res.success) {
      alert(`Failed to send message: ${res.error}`);
    }
    setSending(false);
  };

  // Phase 1 Spike / Demo Simulation triggers for Guardian trip narration
  const handleSimulateTripStarted = async () => {
    if (!activeChannel) return;
    const payload = buildTripStartedPayload({
      tripId: `trip_sim_${Date.now()}`,
      originArea: 'Manyata Tech Park',
      destArea: 'Whitefield',
      etaMinutes: 35,
      score: 84,
      mode: 'walk',
    });
    await nexconnChannels.sendCustomMessage(
      activeChannel.type,
      activeChannel.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.TRIP_STARTED,
      payload
    );
  };

  const handleSimulateCheckin = async (escalated = false) => {
    if (!activeChannel) return;
    const payload = buildCheckinPayload({
      tripId: `trip_sim_${Date.now()}`,
      segmentLabel: 'Kalyan Nagar Main Road',
      minutesRemaining: 20,
      escalated,
    });
    await nexconnChannels.sendCustomMessage(
      activeChannel.type,
      activeChannel.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.CHECKIN,
      payload
    );
  };

  const handleSimulateImOk = async () => {
    if (!activeChannel) return;
    const payload = buildImOkPayload({
      tripId: `trip_sim_${Date.now()}`,
    });
    await nexconnChannels.sendCustomMessage(
      activeChannel.type,
      activeChannel.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.IM_OK,
      payload
    );
  };

  const handleSimulateArrived = async () => {
    if (!activeChannel) return;
    const payload = buildArrivedPayload({
      tripId: `trip_sim_${Date.now()}`,
      durationMinutes: 32,
      score: 84,
    });
    await nexconnChannels.sendCustomMessage(
      activeChannel.type,
      activeChannel.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.ARRIVED,
      payload
    );
  };

  const handleSimulateSos = async () => {
    if (!activeChannel) return;
    const payload = activeChannel.isCircle
      ? buildGuardianSosPayload({
          tripId: `trip_sim_${Date.now()}`,
          coarseArea: 'Kalyan Nagar Main Road',
          nearestHavenName: 'MedPlus 24/7 Pharmacy',
          havenDistanceM: 85,
          havenOpenUntil: 'Open 24/7',
          preciseCoords: { lat: 13.0285, lon: 77.6395 },
        })
      : buildJourneyRoomSosPayload({
          tripId: `trip_sim_${Date.now()}`,
          coarseArea: 'Kalyan Nagar Main Road',
          nearestHavenName: 'MedPlus 24/7 Pharmacy',
          havenDistanceM: 85,
          havenOpenUntil: 'Open 24/7',
        });

    await nexconnChannels.sendCustomMessage(
      activeChannel.type,
      activeChannel.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.SOS,
      payload
    );
  };

  const handleReportSubmit = async () => {
    if (!reportTarget) return;
    try {
      await api.submitReport({
        targetType: 'message',
        targetId: reportTarget.messageId,
        channelId: activeChannel?.id,
        reason: reportReason,
      });
      alert('Report submitted to moderators. Thank you for keeping our community safe.');
    } catch (err: any) {
      alert(`Report failed: ${err.message}`);
    } finally {
      setReportModalOpen(false);
      setReportTarget(null);
    }
  };

  const handleBlockConfirm = async () => {
    if (!blockConfirmUser) return;
    try {
      await api.blockUser(blockConfirmUser);
      alert('User has been blocked. They will not be able to send you direct messages.');
    } catch (err: any) {
      alert(`Block failed: ${err.message}`);
    } finally {
      setBlockConfirmUser(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar: Channel list */}
      <div className={`w-full md:w-80 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/40 ${
        activeChannel ? 'hidden md:flex' : 'flex'
      }`}>
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <span>Channels & Circles</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Realtime Nexconn Chat SDK</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
          {/* Section: Guardian Circle */}
          <div className="pb-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              <span>Guardian Circle</span>
            </div>
            {circleGroupId ? (
              <button
                onClick={() =>
                  setActiveChannel({
                    type: 'group',
                    id: circleGroupId,
                    title: 'My Guardian Circle',
                    isCircle: true,
                  })
                }
                className={`w-full text-left px-3 py-2.5 rounded-xl transition flex items-center justify-between ${
                  activeChannel?.id === circleGroupId ? 'bg-indigo-600/30 text-white border border-indigo-500/50' : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">Guardian Circle</div>
                  <div className="text-xs text-slate-400">Trip narration & live check-ins</div>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              </button>
            ) : (
              <div className="px-3 py-2 text-xs text-slate-500 italic">No Guardian Circle created yet</div>
            )}
          </div>

          {/* Section: Neighbourhood Channels */}
          <div className="pt-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-teal-400" />
              <span>Neighbourhood Channels</span>
            </div>
            {SEEDED_NEIGHBOURHOODS.map((nh) => (
              <button
                key={nh.id}
                onClick={() =>
                  setActiveChannel({
                    type: 'open',
                    id: nh.id,
                    title: nh.name,
                    subtitle: `${nh.area} Late Hours`,
                  })
                }
                className={`w-full text-left px-3 py-2.5 rounded-xl transition ${
                  activeChannel?.id === nh.id ? 'bg-teal-600/20 text-white border border-teal-500/40' : 'hover:bg-slate-800/60 text-slate-300'
                }`}
              >
                <div className="text-sm font-semibold">{nh.name}</div>
                <div className="text-xs text-slate-400">Public area channel • Bengaluru</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-slate-950 ${!activeChannel ? 'hidden md:flex' : 'flex'}`}>
        {activeChannel ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveChannel(null)}
                  className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {activeChannel.title}
                    {activeChannel.isCircle && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Private Circle
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>SDK: {connectionState}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 1 Trip Narration Simulation Panel (Gate helper for §12 Phase 1) */}
            <div className="bg-indigo-950/40 border-b border-indigo-900/50 px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-indigo-300 font-semibold flex items-center gap-1">
                <Play className="w-3.5 h-3.5" />
                <span>Simulate Trip Event:</span>
              </span>
              <button
                onClick={handleSimulateTripStarted}
                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition font-medium"
              >
                Trip Started
              </button>
              <button
                onClick={() => handleSimulateCheckin(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Check-in
              </button>
              <button
                onClick={handleSimulateImOk}
                className="px-2.5 py-1 rounded bg-emerald-800/80 hover:bg-emerald-700 text-emerald-100 transition"
              >
                I'm OK
              </button>
              <button
                onClick={handleSimulateArrived}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition font-medium"
              >
                Arrived Safely
              </button>
              <button
                onClick={handleSimulateSos}
                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3" />
                SOS Alert
              </button>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingHistory ? (
                <div className="text-center py-10 text-xs text-slate-500">Loading conversation history...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No messages yet in this channel.</p>
                  <p className="mt-1">Send a message below or simulate a trip event.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageCard
                    key={msg.id}
                    message={msg}
                    isSelf={msg.senderId === user?.id}
                    onReport={(msgId, senderId) => {
                      setReportTarget({ messageId: msgId, senderId });
                      setReportModalOpen(true);
                    }}
                    onBlock={(senderId) => {
                      setBlockConfirmUser(senderId);
                    }}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleSendText} className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Message as ${user?.handle || 'User'}...`}
                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <Shield className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="text-base font-semibold text-slate-300">Select a Channel</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Choose your Guardian Circle to view journey check-ins, or join a Neighbourhood Channel to coordinate with women nearby.
            </p>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {reportModalOpen && reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <Flag className="w-4 h-4" />
              <span>Report Content or User</span>
            </div>
            <p className="text-xs text-slate-300">
              Your report will be reviewed immediately by our moderation engine and admin team.
            </p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
            >
              <option value="Spam or inappropriate behavior">Spam or inappropriate behavior</option>
              <option value="Harassment or abuse">Harassment or abuse</option>
              <option value="Suspicious location probing">Suspicious location probing</option>
              <option value="Hate speech">Hate speech</option>
              <option value="Other safety violation">Other safety violation</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReportModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReportSubmit}
                className="px-4 py-1.5 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Confirm Modal */}
      {blockConfirmUser && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-slate-200 font-bold text-sm">
              <UserX className="w-4 h-4 text-rose-400" />
              <span>Block User</span>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to block this user? They will not be able to message you or see your community notes.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setBlockConfirmUser(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockConfirm}
                className="px-4 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700"
              >
                Confirm Block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
