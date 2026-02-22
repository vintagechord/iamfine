import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const AUTH_STORAGE_KEY = 'iamfine:auth-session:v1';
const AUTH_CLIENT_STORAGE_KEY = 'iamfine-supabase-auth';

function parseSupabaseProjectRef(url?: string) {
    if (!url) {
        return '';
    }
    try {
        const hostname = new URL(url).hostname;
        return hostname.split('.')[0] ?? '';
    } catch {
        return '';
    }
}

const supabaseProjectRef = parseSupabaseProjectRef(supabaseUrl);
const LEGACY_AUTH_COOKIE_BASE = supabaseProjectRef ? `sb-${supabaseProjectRef}-auth-token` : '';

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

const browserStorage = {
    getItem: (key: string) => {
        if (typeof window === 'undefined') {
            return null;
        }
        return window.localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.setItem(key, value);
    },
    removeItem: (key: string) => {
        if (typeof window === 'undefined') {
            return;
        }
        window.localStorage.removeItem(key);
    },
};

export const supabase: SupabaseClient | null = hasSupabaseEnv
    ? createClient(supabaseUrl!, supabaseAnonKey!, {
          auth: {
              storage: browserStorage,
              storageKey: AUTH_CLIENT_STORAGE_KEY,
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              flowType: 'pkce',
          },
      })
    : null;

type AuthSessionUserResult = {
    user: User | null;
    error: Error | null;
};

type AuthSessionSnapshot = {
    accessToken: string;
    refreshToken: string;
};

function saveSessionSnapshot(session: Session | null) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        if (!session) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return;
        }

        const snapshot: AuthSessionSnapshot = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        // no-op: localStorage access can fail in private mode or restricted contexts.
    }
}

function clearCookie(name: string) {
    const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const parts = host.split('.');
    const topLevelDomain = parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : '';

    const candidates = [
        `${name}=; expires=${expires}; path=/`,
        `${name}=; expires=${expires}; path=/; domain=${host}`,
        topLevelDomain ? `${name}=; expires=${expires}; path=/; domain=${topLevelDomain}` : '',
    ].filter(Boolean);

    candidates.forEach((cookie) => {
        document.cookie = cookie;
    });
}

function clearLegacySupabaseAuthCookies() {
    if (typeof document === 'undefined') {
        return;
    }

    const cookieNames = new Set<string>([
        'sb-access-token',
        'sb-refresh-token',
        'supabase-auth-token',
    ]);

    if (LEGACY_AUTH_COOKIE_BASE) {
        cookieNames.add(LEGACY_AUTH_COOKIE_BASE);
        for (let chunk = 0; chunk <= 5; chunk += 1) {
            cookieNames.add(`${LEGACY_AUTH_COOKIE_BASE}.${chunk}`);
        }
    }

    cookieNames.forEach((name) => clearCookie(name));
}

function readSessionSnapshot() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<AuthSessionSnapshot>;
        if (
            typeof parsed.accessToken !== 'string' ||
            parsed.accessToken.length === 0 ||
            typeof parsed.refreshToken !== 'string' ||
            parsed.refreshToken.length === 0
        ) {
            return null;
        }
        return {
            accessToken: parsed.accessToken,
            refreshToken: parsed.refreshToken,
        } satisfies AuthSessionSnapshot;
    } catch {
        return null;
    }
}

async function restoreSessionFromSnapshot() {
    if (!supabase) {
        return false;
    }

    const snapshot = readSessionSnapshot();
    if (!snapshot) {
        return false;
    }

    const { data, error } = await supabase.auth.setSession({
        access_token: snapshot.accessToken,
        refresh_token: snapshot.refreshToken,
    });

    if (error || !data.session) {
        const errorText = error?.message?.toLowerCase() ?? '';
        const shouldClearSnapshot =
            errorText.includes('refresh token') ||
            errorText.includes('invalid') ||
            errorText.includes('expired') ||
            errorText.includes('jwt');
        if (shouldClearSnapshot) {
            saveSessionSnapshot(null);
        }
        return false;
    }

    saveSessionSnapshot(data.session);
    return true;
}

export async function getAuthSessionUser(): Promise<AuthSessionUserResult> {
    if (!supabase) {
        return { user: null, error: null };
    }

    clearLegacySupabaseAuthCookies();

    let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (!sessionData.session) {
        const restored = await restoreSessionFromSnapshot();
        if (restored) {
            const nextSession = await supabase.auth.getSession();
            sessionData = nextSession.data;
            sessionError = nextSession.error;
        }
    }

    const sessionUser = sessionData.session?.user ?? null;
    if (sessionData.session) {
        saveSessionSnapshot(sessionData.session);
    }

    // getSession() user metadata can be stale across devices.
    // Refresh from Auth server first so shared account data is consistent.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userData.user) {
        if (sessionData.session) {
            saveSessionSnapshot(sessionData.session);
        }
        return {
            user: userData.user,
            error: null,
        };
    }

    if (sessionUser) {
        return {
            user: sessionUser,
            error: null,
        };
    }

    const authErrorText = `${userError?.message ?? ''} ${sessionError?.message ?? ''}`.toLowerCase();
    if (
        authErrorText.includes('auth session missing') ||
        authErrorText.includes('refresh token') ||
        authErrorText.includes('invalid') ||
        authErrorText.includes('expired')
    ) {
        saveSessionSnapshot(null);
    }

    return {
        user: null,
        error: userError ?? sessionError,
    };
}
