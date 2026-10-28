import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/authContext.js';
import { Navbar } from './components/Navbar.js';
import { LoginPage } from './pages/LoginPage.js';
import { HomePage } from './pages/HomePage.js';
import { TripPage } from './pages/TripPage.js';
import { ChatsPage } from './pages/ChatsPage.js';
import { NeighbourhoodsPage } from './pages/NeighbourhoodsPage.js';
import { CirclesPage } from './pages/CirclesPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { api } from './lib/api.js';
import { TripDTO, RouteAlternative, PlanTripResponseDTO } from '@nightwise/shared';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('plan');
  const [activeTrip, setActiveTrip] = useState<{
    trip: TripDTO;
    route: RouteAlternative;
    plan: PlanTripResponseDTO;
    headcount: number;
  } | null>(null);

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

  const handleStartTrip = async (plan: PlanTripResponseDTO, route: RouteAlternative) => {
    try {
      const res = await api.startTrip({ planId: plan.planId, routeId: route.id });
      setActiveTrip({
        trip: res.trip,
        route,
        plan,
        headcount: res.headcount,
      });
      setCurrentTab('trip');
    } catch (err: any) {
      alert(`Could not start trip: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 md:pb-0">
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
        }}
      />
      <main className="flex-1">
        {currentTab === 'trip' && activeTrip && (
          <TripPage
            trip={activeTrip.trip}
            route={activeTrip.route}
            plan={activeTrip.plan}
            initialHeadcount={activeTrip.headcount}
            onTripEnded={() => {
              setActiveTrip(null);
              setCurrentTab('plan');
            }}
          />
        )}
        {currentTab === 'plan' && <HomePage onStartTrip={handleStartTrip} />}
        {currentTab === 'chats' && <ChatsPage />}
        {currentTab === 'neighbourhoods' && <NeighbourhoodsPage />}
        {currentTab === 'circles' && <CirclesPage />}
        {currentTab === 'profile' && <ProfilePage />}
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
