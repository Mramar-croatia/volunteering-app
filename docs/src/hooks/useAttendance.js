import { useState } from 'react';
import { fetchFromApi } from '../services/api';

export function useAttendance(onSuccess) {
  const [status, setStatus] = useState(null); // 'saving', 'success', 'error', null

  const submitAttendance = async (formData, selectedVolunteers) => {
    setStatus('saving');
    try {
      await fetchFromApi('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          selected: Array.from(selectedVolunteers)
        })
      });
      setStatus('success');
      if (onSuccess) onSuccess();
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return { status, submitAttendance };
}