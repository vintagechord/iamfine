import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = hasSupabaseEnv
    ? createBrowserClient(supabaseUrl!, supabaseAnonKey!, {
          auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
          },
      })
    : null;

type AuthSessionUserResult = {
    user: User | null;
    error: Error | null;
};

export async function getAuthSessionUser(): Promise<AuthSessionUserResult> {
    if (!supabase) {
        return { user: null, error: null };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user ?? null;
    if (!sessionUser) {
        return {
            user: null,
            error: sessionError,
        };
    }

    // getSession() user metadata can be stale across devices.
    // Refresh from Auth server first so shared account data is consistent.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
        return {
            user: userData.user,
            error: null,
        };
    }

    return {
        user: sessionUser,
        error: null,
    };
}
