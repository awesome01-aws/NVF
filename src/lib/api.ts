/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getOfflineDb, saveOfflineDb, executeLocalMutation, syncPendingQueue, getSyncQueue } from './offlineStore';
import { apiUrl } from './apiOrigin';

const originalFetch = window.fetch;

// Initialize Global Interceptor for /api/* calls
export function setupOfflineInterceptor() {
  const customFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const remoteInput = typeof input === 'string' ? apiUrl(input) : input;

    // Only intercept relative or absolute /api/ endpoints
    if (!urlString.includes('/api/')) {
      return originalFetch.call(window, remoteInput, init);
    }

    const method = (init?.method || 'GET').toUpperCase();
    let bodyData: any = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        bodyData = JSON.parse(init.body);
      } catch (e) {
        bodyData = init.body;
      }
    }

    const token = (init?.headers as any)?.['Authorization'] || (init?.headers as any)?.['x-auth-token'] || localStorage.getItem('nvf_operator_token') || 'open-access-operator';

    // GET /api/data or GET /api/db: Offline data snapshot serving
    if ((urlString.includes('/api/data') || urlString.includes('/api/db')) && method === 'GET') {
      if (navigator.onLine) {
        try {
          // Background reads must never replay queued writes. Replay has its own
          // bounded scheduler below; otherwise a failed write makes every poll retry.
          if (getSyncQueue().length > 0) {
            return new Response(JSON.stringify(getOfflineDb()), { status: 200, headers: { 'Content-Type': 'application/json', 'X-NVF-Offline': 'pending' } });
          }
          const response = await originalFetch.call(window, remoteInput, init);
          if (response.ok) {
            const cloned = response.clone();
            cloned.json().then(data => {
              saveOfflineDb(data);
            }).catch(() => {});
          }
          return response; // Preserve 401 and server errors; cached data must not hide them.
        } catch (netErr) {
          console.warn('[Offline Mode] Network failed fetching /api/data, serving from local cache:', netErr);
        }
      }

      // Offline Fallback for GET /api/data
      const offlineDb = getOfflineDb();
      if (!localStorage.getItem('nvf_offline_db_cache_v2') || !token) {
        return new Response(JSON.stringify({ error: 'No saved farm data is available on this device.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(offlineDb), {
        status: 200,
        statusText: 'OK (Offline Cache)',
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/auth/status: Offline check fallback
    if (urlString.includes('/api/auth/status') && method === 'GET') {
      if (navigator.onLine) {
        try {
          return await originalFetch.call(window, remoteInput, init);
        } catch (e) {}
      }
      return new Response(JSON.stringify({ setupRequired: false, userCount: 1, offlineMode: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mutation endpoints: POST, PUT, DELETE
    if (['POST', 'PUT', 'DELETE'].includes(method) && !urlString.includes('/api/auth/')) {
      if (!navigator.onLine) {
        console.log(`[Offline Mode] Intercepted ${method} ${urlString} - Applying locally & queuing`);
        const { responseData, offlineQueued } = executeLocalMutation(urlString, method, bodyData);
        if (responseData && (responseData as any).error) {
          return new Response(JSON.stringify(responseData), {
            status: 400,
            statusText: 'Bad Request',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(responseData), {
          status: offlineQueued ? 202 : 507,
          statusText: 'OK (Saved Offline)',
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Online: Try server request first
      try {
        const response = await originalFetch.call(window, remoteInput, init);
        if (response.ok) {
          const cloned = response.clone();
          cloned.json().then(() => {
            // Re-sync local cache snapshot when online mutation succeeds
            const currentToken = localStorage.getItem('nvf_operator_token');
            if (currentToken) {
              originalFetch.call(window, apiUrl('/api/data'), { headers: { 'Authorization': currentToken } })
                .then(r => r.json())
                .then(d => saveOfflineDb(d))
                .catch(() => {});
            }
          }).catch(() => {});
          return response;
        }
        return response;
      } catch (netError) {
        console.warn(`[Offline Fallback] Server unreachable for ${method} ${urlString}. Storing mutation locally.`, netError);
        const { responseData, offlineQueued } = executeLocalMutation(urlString, method, bodyData);
        if (responseData && (responseData as any).error) {
          return new Response(JSON.stringify(responseData), {
            status: 400,
            statusText: 'Bad Request',
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify(responseData), {
          status: offlineQueued ? 202 : 507,
          statusText: 'OK (Saved Offline)',
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default fallback
    try {
      return await originalFetch.call(window, remoteInput, init);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Network unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };

  try {
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true
    });
  } catch (err) {
    console.warn('Could not define custom fetch on window, attempting direct assignment fallback:', err);
    try {
      (window as any).fetch = customFetch;
    } catch (e) {
      console.warn('Direct fetch assignment failed:', e);
    }
  }
}

// One retry controller owns background replay. Routine data reads and status
// notifications never start a write, so an unavailable server cannot spin.
let autoSyncInitialized = false;
export function initAutoSyncListeners() {
  if (autoSyncInitialized) return;
  autoSyncInitialized = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let failures = 0;
  let blocked = false;

  const schedule = (delay: number) => {
    if (timer || running || blocked || !navigator.onLine || getSyncQueue().length === 0) return;
    timer = setTimeout(run, delay);
  };

  const run = async () => {
    timer = undefined;
    if (running || blocked || !navigator.onLine || getSyncQueue().length === 0) return;
    running = true;
    const token = localStorage.getItem('nvf_operator_token') || 'open-access-operator';
    try {
      const result = await syncPendingQueue(token);
      if (result.success) failures = 0;
      else if (!result.retryable) blocked = true;
      else failures = Math.min(failures + 1, 4);
    } finally {
      running = false;
      if (!blocked) schedule(Math.min(120000, 15000 * 2 ** Math.max(0, failures - 1)));
    }
  };

  window.addEventListener('nvf_offline_change', (event: Event) => {
    if ((event as CustomEvent).detail?.change !== 'queue') return;
    if (getSyncQueue().length === 0) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      failures = 0;
      blocked = false;
    } else {
      schedule(1500);
    }
  });
  window.addEventListener('online', () => schedule(1000));
  window.addEventListener('focus', () => schedule(1000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(1000);
  });
  schedule(2000);
}
