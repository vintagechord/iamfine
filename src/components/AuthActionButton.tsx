'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type AuthActionButtonProps = {
    showSignUpWhenLoggedOut?: boolean;
};

export default function AuthActionButton({ showSignUpWhenLoggedOut = false }: AuthActionButtonProps) {
    const [loggedIn, setLoggedIn] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadAuth = async () => {
            if (!hasSupabaseEnv || !supabase) {
                if (mounted) {
                    setLoggedIn(false);
                }
                return;
            }

            const { data, error } = await supabase.auth.getUser();
            if (mounted) {
                setLoggedIn(!error && Boolean(data.user));
            }
        };

        void loadAuth();

        if (!hasSupabaseEnv || !supabase) {
            return () => {
                mounted = false;
            };
        }

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setLoggedIn(Boolean(session?.user));
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleSignOut = async () => {
        if (!supabase) {
            return;
        }

        setLoading(true);
        await supabase.auth.signOut();
        setLoading(false);
        setLoggedIn(false);
    };

    const baseClassName =
        'rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';

    if (loggedIn) {
        return (
            <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className={baseClassName}
                aria-label="로그아웃"
            >
                {loading ? '처리 중...' : '로그아웃'}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2">
            {showSignUpWhenLoggedOut && (
                <Link href="/auth" className={baseClassName} aria-label="회원가입">
                    회원가입
                </Link>
            )}
            <Link href="/auth" className={baseClassName} aria-label="로그인">
                로그인
            </Link>
        </div>
    );
}
