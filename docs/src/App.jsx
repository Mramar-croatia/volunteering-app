import React, { useState, useEffect } from 'react';
import AppShell from './components/layout/AppShell';

// Import all views from the 'views' folder
import Dashboard from './views/Dashboard';
import Volunteers from './views/Volunteers';
import Events from './views/Events';
import Analytics from './views/Analytics';

import { useStats } from './hooks/useStats';
import { fetchFromApi } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [volunteers, setVolunteers] = useState([]);
  
  // Stats for the dashboard KPI cards
  const { stats } = useStats();

  const loadVolunteers = async () => {
    try {
      const data = await fetchFromApi('/api/names');
      setVolunteers(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadVolunteers(); }, []);

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'dashboard' && (
        <Dashboard 
            stats={stats} 
            volunteers={volunteers} 
            onNavigate={setActiveTab} 
        />
      )}
      {activeTab === 'volunteers' && (
        <Volunteers volunteers={volunteers} isLoading={volunteers.length === 0} />
      )}
      {activeTab === 'events' && (
        <Events volunteers={volunteers} onRefresh={loadVolunteers} />
      )}
      {activeTab === 'analytics' && (
        <Analytics />
      )}
    </AppShell>
  );
}