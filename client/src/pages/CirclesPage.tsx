import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import { CircleDTO } from '@nightwise/shared';
import {
  Shield,
  UserPlus,
  Trash2,
  Users,
  CheckCircle,
  AlertCircle,
  Lock,
} from 'lucide-react';

export const CirclesPage: React.FC = () => {
  const { user } = useAuth();
  const [circle, setCircle] = useState<CircleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteMode, setInviteMode] = useState<'phone' | 'handle'>('handle');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadCircle = async () => {
    setLoading(true);
    try {
      const res = await api.getCircle();
      setCircle(res.circle);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCircle();
  }, []);

  const handleCreateCircle = async () => {
    setError(null);
    try {
      const res = await api.createCircle();
      setCircle(res.circle);
      setSuccessMsg('Guardian Circle created successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to create circle');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteInput.trim()) return;

    setError(null);
    setSuccessMsg(null);
    setInviting(true);

    try {
      const params = inviteMode === 'phone' ? { phone: inviteInput.trim() } : { handle: inviteInput.trim() };
      await api.inviteGuardian(params);
      setInviteInput('');
      setSuccessMsg('Guardian added to your circle!');
      loadCircle();
    } catch (err: any) {
      setError(err.message || 'Failed to add guardian');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!circle) return;
    if (!confirm('Remove this guardian from your circle?')) return;

    try {
      await api.removeCircleMember(circle.id, memberUserId);
      loadCircle();
    } catch (err: any) {
      alert(`Failed to remove: ${err.message}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-400" />
            <span>Guardian Circle</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Your trusted people who receive automated trip check-ins and emergency alerts.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading circle...</div>
      ) : !circle ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Create Your Guardian Circle</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Add family members, roommates, or trusted friends. When you travel at night, your trip automatically narratess check-ins directly into this secure chat.
            </p>
          </div>
          <button
            onClick={handleCreateCircle}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition"
          >
            Create My Circle
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Member List Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-xs">
              Circle Members ({circle.members.length})
            </h3>

            <div className="divide-y divide-slate-800/80">
              {circle.members.map((m) => (
                <div key={m.userId} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-indigo-300">
                      {m.handle.slice(0, 2)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        <span>{m.handle}</span>
                        {m.userId === user?.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 capitalize">{m.role}</div>
                    </div>
                  </div>

                  {circle.ownerId === user?.id && m.userId !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(m.userId)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-950/30 transition"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add Guardian Card */}
          {circle.ownerId === user?.id && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>Invite a Guardian</span>
              </h3>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInviteMode('handle')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    inviteMode === 'handle' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  By NightWise Handle
                </button>
                <button
                  type="button"
                  onClick={() => setInviteMode('phone')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    inviteMode === 'phone' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  By Phone Number
                </button>
              </div>

              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder={inviteMode === 'handle' ? 'e.g. Jasmine-17' : '10-digit phone number'}
                  className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteInput.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm transition"
                >
                  {inviting ? 'Adding...' : 'Add'}
                </button>
              </form>
            </div>
          )}

          {/* Privacy Note (Rule R1 & R2) */}
          <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-900/40 text-xs text-indigo-200/80 flex items-start gap-3">
            <Lock className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-indigo-200">Safety & Privacy Guarantee:</strong> Guardians receive automated cards (trip started, 10-minute check-ins, arrival confirm, and emergency SOS) inside a private Nexconn group channel. Your exact live location is shared ONLY with your chosen guardians, and ONLY while a trip is active.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
