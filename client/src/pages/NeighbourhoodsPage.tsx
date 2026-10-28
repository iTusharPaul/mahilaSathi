import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import {
  nexconnChannels,
  nexconnEngine,
  ChatMessageItem,
} from '../nexconn/index.js';
import {
  SEEDED_NEIGHBOURHOODS,
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  buildReportPayload,
  CommunityReportCategory,
} from '../lib/config.js';
import { MessageCard } from '../components/MessageCard.js';
import {
  Compass,
  Send,
  MessageSquare,
  AlertCircle,
  Lightbulb,
  Moon,
  Sparkles,
  Store,
  DoorClosed,
  Megaphone,
  ChevronLeft,
} from 'lucide-react';

export const NeighbourhoodsPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedArea, setSelectedArea] = useState<typeof SEEDED_NEIGHBOURHOODS[number]>(
    SEEDED_NEIGHBOURHOODS[0]
  );
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [activeChipCategory, setActiveChipCategory] = useState<CommunityReportCategory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load channel history & enter OpenChannel (§6.4)
  useEffect(() => {
    setLoadingHistory(true);
    nexconnChannels.enterOpenChannel(selectedArea.id).catch(console.error);

    nexconnChannels.fetchHistory('open', selectedArea.id, 50)
      .then((hist) => {
        setMessages(hist);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingHistory(false);
      });
  }, [selectedArea]);

  // Realtime listener
  useEffect(() => {
    const unsub = nexconnEngine.onRawMessages((rawMsgs) => {
      const areaMsgs = rawMsgs.filter(
        (m: any) =>
          m.channelId === selectedArea.id ||
          m.targetId === selectedArea.id ||
          (m as any).conversationId === selectedArea.id
      );

      if (areaMsgs.length > 0) {
        setMessages((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          const additions: ChatMessageItem[] = [];
          for (const m of areaMsgs as any[]) {
            const id = m.messageId || m.id || String(m.sentTime);
            if (!ids.has(id)) {
              additions.push({
                id,
                channelType: 'open',
                channelId: selectedArea.id,
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
  }, [selectedArea]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');

    await nexconnChannels.sendTextMessage('open', selectedArea.id, txt);
  };

  // Quick report submit (§6.2, §7.5)
  const handleQuickReport = async (category: CommunityReportCategory) => {
    const segmentRef = `seg_${selectedArea.slug}_corridor`;
    const note = reportNote.trim() || undefined;

    const payload = buildReportPayload({
      category,
      segmentRef,
      note,
    });

    // 1. Post NW:report custom message in the OpenChannel
    await nexconnChannels.sendCustomMessage(
      'open',
      selectedArea.id,
      NEXCONN_CUSTOM_MESSAGE_TYPES.REPORT,
      payload
    );

    // 2. Submit to backend community reports registry (feeds Community Pulse score)
    await api.submitCommunityReport({
      category,
      segmentId: segmentRef,
      areaLabel: selectedArea.area,
      note,
    });

    setReportNote('');
    setActiveChipCategory(null);
  };

  const chips: Array<{ category: CommunityReportCategory; label: string; icon: any; color: string }> = [
    { category: 'streetlight_out', label: 'Streetlight out', icon: Lightbulb, color: 'text-amber-400 bg-amber-950/60 border-amber-800/60' },
    { category: 'deserted', label: 'Deserted stretch', icon: Moon, color: 'text-slate-300 bg-slate-900 border-slate-700' },
    { category: 'lively', label: 'Lively & active', icon: Sparkles, color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60' },
    { category: 'place_open', label: 'Place open', icon: Store, color: 'text-teal-400 bg-teal-950/60 border-teal-800/60' },
    { category: 'place_closed', label: 'Place closed', icon: DoorClosed, color: 'text-rose-400 bg-rose-950/60 border-rose-800/60' },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Area Selector Column */}
      <div className="w-full md:w-80 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/40">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Compass className="w-5 h-5 text-teal-400" />
            <span>Bengaluru Areas</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Public community open channels & live reports.
          </p>
        </div>

        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {SEEDED_NEIGHBOURHOODS.map((nh) => (
            <button
              key={nh.id}
              onClick={() => setSelectedArea(nh)}
              className={`w-full text-left px-3.5 py-3 rounded-xl transition ${
                selectedArea.id === nh.id
                  ? 'bg-teal-950/60 text-white border border-teal-500/50 shadow-md'
                  : 'hover:bg-slate-800/60 text-slate-300'
              }`}
            >
              <div className="font-semibold text-sm">{nh.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">{nh.area} Night Watch</div>
            </button>
          ))}
        </div>
      </div>

      {/* Area Chat & Quick Reports */}
      <div className="flex-1 flex flex-col bg-slate-950">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>{selectedArea.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-950 text-teal-300 border border-teal-800">
                OpenChannel
              </span>
            </h3>
            <div className="text-xs text-slate-400">
              Community pulse active • Reports update route scores in real time
            </div>
          </div>
        </div>

        {/* Quick Report Chips Row (§9 page 5) */}
        <div className="p-3 bg-slate-900/40 border-b border-slate-800/80 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Quick Report in {selectedArea.area}
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.category}
                  onClick={() => handleQuickReport(chip.category)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${chip.color}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loadingHistory ? (
            <div className="text-center py-12 text-xs text-slate-500">Loading community messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              <Compass className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No reports or messages yet in {selectedArea.name}.</p>
              <p className="mt-1">Tap a quick-report chip above to log streetlight or road conditions.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                isSelf={msg.senderId === user?.id}
                onReport={() => {}}
                onBlock={() => {}}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Text Input */}
        <form onSubmit={handleSendText} className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Post public note in ${selectedArea.name}...`}
            className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white transition flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
