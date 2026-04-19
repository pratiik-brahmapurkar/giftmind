import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ─── Determine which URL to use ─────────────────────────
// In production (Vercel), always use the proxy.
// In local development, use the direct Supabase URL for speed.

const DIRECT_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROXY_URL = import.meta.env.VITE_SUPABASE_PROXY_URL; // e.g., https://giftmind-5.vercel.app/api/supabase
const USE_PROXY = import.meta.env.VITE_USE_SUPABASE_PROXY === 'true';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined');
}
if (!DIRECT_SUPABASE_URL && !PROXY_URL) {
  throw new Error('Neither VITE_SUPABASE_URL nor VITE_SUPABASE_PROXY_URL is defined');
}

// Choose the URL based on environment flag
const SUPABASE_URL = USE_PROXY && PROXY_URL 
  ? PROXY_URL 
  : DIRECT_SUPABASE_URL;

console.log('[Supabase] Using URL:', SUPABASE_URL, '(proxy:', USE_PROXY, ')');

// ─── Create client ──────────────────────────────────────
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    realtime: {
      // Realtime uses WebSockets which the proxy can't handle easily.
      // If realtime is critical, use direct URL here as a fallback:
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-client-info': 'giftmind-web',
      },
    },
  }
);

// Export the URL in case other modules need it for direct calls
export const SUPABASE_CLIENT_URL = SUPABASE_URL;
export const IS_PROXIED = USE_PROXY;