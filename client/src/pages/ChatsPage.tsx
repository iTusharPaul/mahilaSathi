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
  SEEDED_NEIGHBOURHOODS,
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
  Footprints,
  Check,
  X,
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

  // Walk Together 1-to-1 DMs state (§8.5, Rule R4)
  const [walkPartners, setWalkPartners] = useState<Array<{ partnerId: string; partnerHandle: string; meetingHaven: string }>>([]);
  const [pendingWalkRequests, setPendingWalkRequests] = useState<any[]>([]);

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

    // Load Walk Together chats & pending requests
    loadWalkData();
  }, []);

  const loadWalkData = async () => {
    try {
      const [partnersRes, requestsRes] = await Promise.all([
        api.getActiveWalkChats(),
        api.getPendingWalkRequests(),
      ]);
      setWalkPartners(partnersRes.partners || []);
      setPendingWalkRequests(requestsRes.requests || []);
    } catch (err) {
      console.warn('Failed to load walk together chats:', err);
    }
  };

  const handleRespondWalk = async (requestId: string, accept: boolean) => {
    try {
      const res = await api.respondWalkTogether(requestId, accept);
      if (res.directChatEnabled) {
        alert(`Walk Together accepted with ${res.partnerHandle}! Meeting point: ${res.meetingHaven}. Direct 1-to-1 chat is now unlocked.`);
        await loadWalkData();
        setActiveChannel({
          type: 'direct',
          id: res.partnerId,
          title: `Walk: ${res.partnerHandle}`,
          subtitle: `Meeting at ${res.meetingHaven}`,
        });
      } else {
        await loadWalkData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to respond to request');
    }
  };

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
    setMessages([]);

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
      alert('User has been blocked. They will not be able to send you direct messages or Walk Together invites.');
      await loadWalkData();
    } catch (err: any) {
      alert(`Block failed: ${err.message}`);
    } finally {
      setBlockConfirmUser(null);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-slate-950 text-slate-100">
      {/* Sidebar Channel List */}
      <div className={`w-full md:w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col ${activeChannel ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            <span>Community Chats</span>
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {user?.handle}
          </span>
        </div>

        {/* Pending Walk Requests Banner */}
        {pendingWalkRequests.length > 0 && (
          <div className="p-3 bg-teal-950/40 border-b border-teal-800/40 space-y-2">
            <div className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
              <Footprints className="w-3.5 h-3.5" />
              <span>Walk Together Invite ({pendingWalkRequests.length})</span>
            </div>
            {pendingWalkRequests.map((req) => (
              <div key={req.id} className="bg-slate-900/80 p-2.5 rounded-xl border border-teal-700/30 text-xs space-y-1.5">
                <div className="text-slate-300">
                  <span className="font-semibold text-teal-300">{req.requesterHandle}</span> wants to walk together along your corridor.
                </div>
                <div className="text-[11px] text-slate-400">
                  Meet at: <strong className="text-slate-200">{req.havenName}</strong>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleRespondWalk(req.id, true)}
                    className="flex-1 py-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => handleRespondWalk(req.id, false)}
                    className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Section: Guardian Circle */}
          <div>
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

          {/* Section: Walk Together (1-to-1 DirectChannels - Rule R4) */}
          {walkPartners.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-teal-400" />
                <span>Walk Together (1-to-1)</span>
              </div>
              {walkPartners.map((p) => (
                <button
                  key={p.partnerId}
                  onClick={() =>
                    setActiveChannel({
                      type: 'direct',
                      id: p.partnerId,
                      title: `Walk: ${p.partnerHandle}`,
                      subtitle: `Meeting at ${p.meetingHaven}`,
                    })
                  }
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition ${
                    activeChannel?.id === p.partnerId ? 'bg-teal-600/30 text-white border border-teal-500/50' : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="text-sm font-semibold">{p.partnerHandle}</div>
                  <div className="text-xs text-slate-400 truncate">Meeting: {p.meetingHaven}</div>
                </button>
              ))}
            </div>
          )}

          {/* Section: Neighbourhood Channels */}
          <div>
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
                    {activeChannel.type === 'direct' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300 border border-teal-500/30">
                        Mutual Walk DM
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>SDK: {connectionState}</span>
                    {activeChannel.subtitle && <span>• {activeChannel.subtitle}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingHistory ? (
                <div className="text-center py-10 text-xs text-slate-500">Loading conversation history...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>No messages yet in this channel.</p>
                  <p className="mt-1">Send a message below to say hi or coordinate.</p>
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

            {/* Message Input Box */}
            <form onSubmit={handleSendText} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Chat anonymously as ${user?.handle || 'User'}...`}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold flex items-center gap-1.5 transition"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
            <h3 className="text-sm font-semibold text-slate-300">Select a Conversation</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Choose your Guardian Circle, a Neighbourhood Channel, or a Walk Together companion.
            </p>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Flag className="w-4 h-4" />
              <span>Report to Moderators</span>
            </div>
            <p className="text-xs text-slate-300">
              NightWise takes community safety seriously. Reports are reviewed by human moderators.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Reason for report</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
              >
                <option value="Harassment or abusive conduct">Harassment or abusive conduct</option>
                <option value="Spam or unsolicited advertising">Spam or unsolicited advertising</option>
                <option value="Suspicious or unsafe behaviour">Suspicious or unsafe behaviour</option>
                <option value="Hate speech or profanity">Hate speech or profanity</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReportModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleReportSubmit}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Confirmation Modal */}
      {blockConfirmUser && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <UserX className="w-4 h-4" />
              <span>Block User</span>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to block this user? They will not be able to message you or send Walk Together invitations.
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
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
              >
                Block User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
