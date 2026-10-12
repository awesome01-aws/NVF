import { useEffect, useState } from 'react';
import { getCameroonTodayISO } from '../utils/dateUtils';

export function useFarmToday() {
  const [, setTick] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setTick(Date.now());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return getCameroonTodayISO();
}
