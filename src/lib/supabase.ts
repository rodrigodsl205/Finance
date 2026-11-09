import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis de ambiente do Supabase não encontradas. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  );
}

logger.info('Inicializando cliente Supabase', { url: supabaseUrl });

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      return fetch(input, init).then(async (res) => {
        if (!res.ok && res.status >= 400) {
          const url = typeof input === 'string' ? input : input.toString();
          let body = '';
          try { body = await res.clone().text(); } catch { /* ignore */ }
          logger.error('Supabase request failed', { url, status: res.status, body });
        }
        return res;
      });
    },
  },
});
