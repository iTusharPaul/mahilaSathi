import React from 'react';
import { useAuth } from '../lib/authContext.js';
import {
  Navigation,
  MessageSquare,
  Compass,
  Shield,
  User,
  AlertCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange }) => {
  const { user, connectionState } = useAuth();

  return (
    <>
      {/* Top Header */}
      <header className="h-16 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => onTabChange('plan')}>
          <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center font-bold">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="font-extrabold text-white text-base leading-tight tracking-tight flex items-center gap-1.5">
              <span>NightWise</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 font-bold border border-indigo-800">
                BLR
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              Accompanied night mobility
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => onTabChange('plan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              currentTab === 'plan' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Plan Route</span>
          </button>
          <button
            onClick={() => onTabChange('chats')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              currentTab === 'chats' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chats & Circles</span>
          </button>
          <button
            onClick={() => onTabChange('neighbourhoods')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              currentTab === 'neighbourhoods' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Neighbourhoods</span>
          </button>
          <button
            onClick={() => onTabChange('circles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              currentTab === 'circles' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Guardians</span>
          </button>
        </nav>

        {/* User Pill & Connection Status */}
        <div className="flex items-center gap-2">
          {connectionState === 'connected' ? (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full" title="Nexconn Connected">
              <Wifi className="w-3 h-3" />
              <span>Live</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full" title="SDK Reconnecting">
              <WifiOff className="w-3 h-3" />
              <span>{connectionState}</span>
            </div>
          )}

          <button
            onClick={() => onTabChange('profile')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-xs font-semibold text-slate-200 transition"
          >
            <div className="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center text-[10px] font-bold">
              {user?.handle.slice(0, 1) || 'U'}
            </div>
            <span>{user?.handle || 'Profile'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 px-2 py-1.5 flex justify-around items-center backdrop-blur-md">
        <button
          onClick={() => onTabChange('plan')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
            currentTab === 'plan' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Navigation className="w-5 h-5 mb-0.5" />
          <span>Plan</span>
        </button>
        <button
          onClick={() => onTabChange('chats')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
            currentTab === 'chats' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-5 h-5 mb-0.5" />
          <span>Chats</span>
        </button>
        <button
          onClick={() => onTabChange('neighbourhoods')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
            currentTab === 'neighbourhoods' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Areas</span>
        </button>
        <button
          onClick={() => onTabChange('circles')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
            currentTab === 'circles' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-5 h-5 mb-0.5" />
          <span>Circle</span>
        </button>
        <button
          onClick={() => onTabChange('profile')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
            currentTab === 'profile' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <User className="w-5 h-5 mb-0.5" />
          <span>Profile</span>
        </button>
      </nav>
    </>
  );
};
