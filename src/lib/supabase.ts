import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** null when either env var is missing: the app is then local-only. */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
