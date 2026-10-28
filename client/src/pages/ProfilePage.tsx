import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import {
  User,
  Shield,
  RefreshCw,
  Lock,
  EyeOff,
  UserX,
  LogOut,
  CheckCircle,
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, updateHandle, logout } = useAuth();
  const [handleInput, setHandleInput] = useState(user?.handle || '');
  const [updating, setUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blockedList, setBlockedList] = useState<Array<{ userId: string; handle: string }>>([]);

  useEffect(() => {
    if (user) {
      setHandleInput(user.handle);
    }
    api.getBlockedUsers().then((res) => setBlockedList(res.blocked)).catch(console.error);
  }, [user]);

  const handleSaveHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handleInput.trim() || handleInput === user?.handle) return;

    setUpdating(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      await updateHandle(handleInput.trim());
      setStatusMsg('Handle updated successfully!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update handle');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <User className="w-6 h-6 text-indigo-400" />
          <span>Profile & Safety</span>
        </h1>
        <button
          onClick={logout}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Handle Management Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-white">Your Anonymous Handle</h3>
          <p className="text-xs text-slate-400 mt-1">
            NightWise uses pseudonyms only. Your real name and phone number never leave the backend.
          </p>
        </div>

        <form onSubmit={handleSaveHandle} className="flex gap-2">
          <input
            type="text"
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-semibold"
          />
          <button
            type="submit"
            disabled={updating || handleInput === user?.handle}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs transition"
          >
            {updating ? 'Saving...' : 'Update'}
          </button>
        </form>
      </div>

      {/* Ofcom-style Bundled Safety Defaults Card (§9 page 7) */}
      <div className="bg-slate-900 border border-indigo-900/50 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
          <Shield className="w-5 h-5 text-indigo-400" />
          <span>Your Safety Defaults (Always Active)</span>
        </div>
        <p className="text-xs text-slate-300">
          NightWise is built with safety-by-design principles. These guarantees are bundled ON by default to protect your privacy and security:
        </p>

        <div className="space-y-3 pt-1">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">R1: Pseudonyms Enforced</div>
              <div className="text-[11px] text-slate-400">
                You are identified across all chat rooms solely as <strong>{user?.handle}</strong>.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
            <EyeOff className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">R2: No Exact Location to Strangers</div>
              <div className="text-[11px] text-slate-400">
                Journey Rooms and Neighbourhoods see area-level corridor presence only. Exact GPS is shared ONLY with your Guardian Circle during active trips.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">R3: 300m Route Endpoint Trimming</div>
              <div className="text-[11px] text-slate-400">
                Any route geometry shown to anyone other than you is trimmed by 300 meters at both ends. Home/hostel addresses cannot be inferred.
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
            <Lock className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-white">R4: No Stranger DMs</div>
              <div className="text-[11px] text-slate-400">
                Direct 1-to-1 chats can only be opened inside your Guardian Circle or after mutual Walk Together acceptance.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Users Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <UserX className="w-4 h-4 text-rose-400" />
          <span>Blocked Users ({blockedList.length})</span>
        </h3>
        {blockedList.length === 0 ? (
          <p className="text-xs text-slate-500">You have not blocked any users.</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {blockedList.map((b) => (
              <div key={b.userId} className="py-2 text-xs flex justify-between items-center text-slate-300">
                <span>{b.handle}</span>
                <span className="text-[10px] text-slate-500 font-mono">{b.userId}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
