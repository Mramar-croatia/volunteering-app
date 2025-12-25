import { useState, useMemo, useEffect } from 'react';
import { fetchFromApi } from '../services/api';

export function useVolunteers() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetchFromApi('/api/names');
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Logic for sorting and filtering
  const useFilteredVolunteers = (search, sortDir = 'asc') => {
    return useMemo(() => {
      return data
        .filter(v => (v.name + v.school).toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => {
          return sortDir === 'asc' 
            ? a.name.localeCompare(b.name) 
            : b.name.localeCompare(a.name);
        });
    }, [data, search, sortDir]);
  };

  return { data, loading, error, refresh, useFilteredVolunteers };
}