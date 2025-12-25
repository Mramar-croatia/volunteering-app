import { useState, useEffect } from 'react';
import { fetchFromApi } from '../services/api';

export function useStats(refreshTrigger) {
  const [stats, setStats] = useState({ 
    volunteersCount: 0, totalHours: 0, eventsCount: 0, totalChildren: 0, charts: [] 
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [vols, evs, chartsData] = await Promise.all([
          fetchFromApi('/api/names'), 
          fetchFromApi('/api/evidencija'),
          fetchFromApi('/api/statistika')
        ]);
        
        setStats({
          volunteersCount: vols.length,
          totalHours: Math.round(vols.reduce((a, v) => a + (parseFloat(v.hours) || 0), 0)),
          eventsCount: evs.length,
          totalChildren: evs.reduce((a, e) => a + (parseInt(e.childrenCount) || 0), 0),
          charts: chartsData.charts || []
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshTrigger]);

  return { stats, loading };
}