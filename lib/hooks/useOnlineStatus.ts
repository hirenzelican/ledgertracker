'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks connectivity so the app can warn before the user tries to save.
 * `navigator.onLine` only proves the device has a network, so it is treated as a hint:
 * saves still depend on Supabase confirming the write.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
