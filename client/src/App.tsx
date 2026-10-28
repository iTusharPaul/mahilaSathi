import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/authContext.js';
import { Navbar } from './components/Navbar.js';
import { LoginPage } from './pages/LoginPage.js';
import { HomePage } from './pages/HomePage.js';
import { ChatsPage } from './pages/ChatsPage.js';
import { CirclesPage } from './pages/CirclesPage.js';
import { ProfilePage } from './pages/ProfilePage.js';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('plan'); // Start on Plan Route

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Initializing NightWise...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 md:pb-0">
      <Navbar currentTab={currentTab} onTabChange={setCurrentTab} />
      <main className="flex-1">
        {currentTab === 'plan' && (
          <HomePage
            onStartTrip={(plan, route) => {
              // Switches to chats/trip
              setCurrentTab('chats');
            }}
          />
        )}
        {currentTab === 'chats' && <ChatsPage />}
        {currentTab === 'circles' && <CirclesPage />}
        {currentTab === 'profile' && <ProfilePage />}
        {currentTab === 'neighbourhoods' && (
          <div className="p-6 text-center text-slate-400 text-sm">
            Neighbourhood channels & quick reports will be active in Phase 3.
          </div>
        )}
      </main>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
