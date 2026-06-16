import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[QurTag] Supabase env vars missing. Copy .env.local.example to .env.local and fill in your project credentials. Auth and data flows will not work until you do.',
  );
}

/**
 * Untyped at the boundary on purpose. Our hand-rolled Database type doesn't
 * pass Supabase's GenericSchema constraint check. We restore strict types at
 * the helper-function layer in `queries.ts`, which is the only place that
 * touches the Supabase client directly.
 *
 * Swap this for `createClient<Database>(...)` once we wire `supabase gen types`.
 */
export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);
