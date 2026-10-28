import React, { useState } from 'react';
import { useAuth } from '../lib/authContext.js';
import { api } from '../lib/api.js';
import { Shield, Sparkles, Lock, ArrowRight, Phone } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [demoCodeHint, setDemoCodeHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(phone);
      if (res.demoOtp) {
        setDemoCodeHint(res.demoOtp);
        setOtp(res.demoOtp); // prefill for easy one-click testing
      }
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login(phone, otp);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-3">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">NightWise</h1>
          <p className="text-xs text-indigo-300 font-medium mt-1">
            "Google Maps gets you home fastest. NightWise gets you home accompanied."
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                  +91
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98765 43210"
                  className="w-full pl-14 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || phone.length < 10}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/30"
            >
              <span>{loading ? 'Sending code...' : 'Continue with Phone'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Verification Code (OTP)
                </label>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Change phone
                </button>
              </div>

              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-center tracking-widest text-lg font-bold text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />

              {demoCodeHint && (
                <div className="mt-2 p-2 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200 text-center font-medium">
                  Demo mode active • Code is <strong>{demoCodeHint}</strong>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold transition flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/30"
            >
              <span>{loading ? 'Verifying...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Safety Guarantees (§2 Rules Summary) */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span><strong>Pseudonyms only:</strong> Real name & phone never shown to anyone.</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
            <span><strong>Trimmed endpoints:</strong> Home & destination fuzzed by 300m for strangers.</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span><strong>Accompanied travel:</strong> Corridor presence powered by Nexconn Chat SDK.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
