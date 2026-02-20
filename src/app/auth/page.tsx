'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type AuthMode = 'login' | 'signup';

function toKoreanAuthMessage(rawMessage: string) {
    if (rawMessage.includes('Invalid login credentials')) {
        return '이메일 또는 비밀번호를 다시 확인해 주세요.';
    }
    if (rawMessage.includes('Email not confirmed')) {
        return '이메일 인증을 먼저 완료해 주세요.';
    }
    if (rawMessage.includes('User already registered')) {
        return '이미 가입된 이메일이에요.';
    }
    if (rawMessage.includes('Password should be')) {
        return '비밀번호를 더 길고 안전하게 설정해 주세요.';
    }
    return '요청 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

export default function AuthPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedMode = searchParams.get('mode');
    const [authMode, setAuthMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
    const [nickname, setNickname] = useState('');

    const loadAuthState = useCallback(async () => {
        if (!hasSupabaseEnv || !supabase) {
            setLoggedInUserId(null);
            setNickname('');
            setCheckingAuth(false);
            return;
        }

        setCheckingAuth(true);
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
            setLoggedInUserId(null);
            setNickname('');
            setCheckingAuth(false);
            return;
        }

        const uid = userData.user.id;
        setLoggedInUserId(uid);

        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('user_id', uid)
            .maybeSingle();

        if (profileError) {
            console.error('닉네임 조회 실패', profileError);
            setNickname('');
        } else {
            setNickname((profileData?.nickname ?? '').trim());
        }

        setCheckingAuth(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadAuthState();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [loadAuthState]);

    useEffect(() => {
        const nextMode: AuthMode = requestedMode === 'signup' ? 'signup' : 'login';
        const timer = window.setTimeout(() => {
            setAuthMode(nextMode);
            setMessage('');
            if (nextMode === 'login') {
                setConfirmPassword('');
            }
        }, 0);

        return () => window.clearTimeout(timer);
    }, [requestedMode]);

    const signUp = async () => {
        if (!supabase) {
            setMessage('설정이 필요해요. `.env.local` 파일을 확인해 주세요.');
            return;
        }

        if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
            setMessage('이메일, 비밀번호, 비밀번호 확인을 입력해 주세요.');
            return;
        }

        if (password !== confirmPassword) {
            setMessage('비밀번호가 서로 다릅니다. 다시 확인해 주세요.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password,
        });
        setLoading(false);

        if (error) {
            setMessage(toKoreanAuthMessage(error.message));
        } else {
            setMessage('회원가입을 완료했어요.');
            setConfirmPassword('');
            await loadAuthState();
        }
    };

    const signIn = async () => {
        if (!supabase) {
            setMessage('설정이 필요해요. `.env.local` 파일을 확인해 주세요.');
            return;
        }

        if (!email.trim() || !password.trim()) {
            setMessage('이메일과 비밀번호를 입력해 주세요.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        setLoading(false);

        if (error) {
            setMessage(toKoreanAuthMessage(error.message));
        } else {
            setMessage('로그인했어요.');
            await loadAuthState();
            router.replace('/');
        }
    };

    const signOut = async () => {
        if (!supabase) {
            setMessage('설정이 필요해요. `.env.local` 파일을 확인해 주세요.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signOut();
        setLoading(false);

        if (error) {
            setMessage(toKoreanAuthMessage(error.message));
            return;
        }

        setLoggedInUserId(null);
        setNickname('');
        setPassword('');
        setConfirmPassword('');
        setMessage('로그아웃했어요.');
    };

    const changeAuthMode = (nextMode: AuthMode) => {
        setAuthMode(nextMode);
        setMessage('');
        if (nextMode === 'login') {
            setConfirmPassword('');
        }
    };

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">로그인 / 회원가입</h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    계정이 없으면 회원가입, 계정이 있으면 로그인하세요.
                </p>
            </section>

            {!hasSupabaseEnv && (
                <section
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일에서 연결 설정을 확인해 주세요.</p>
                </section>
            )}

            {checkingAuth && hasSupabaseEnv && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-sm text-gray-700 dark:text-gray-200">로그인 상태를 확인하는 중이에요…</p>
                </section>
            )}

            {!checkingAuth && loggedInUserId && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <h2 className="text-lg font-semibold">로그인된 상태예요</h2>
                    <p className="mt-2 text-sm">
                        닉네임: <span className="font-semibold">{nickname || '닉네임이 아직 없어요.'}</span>
                    </p>
                    <button
                        onClick={signOut}
                        disabled={loading || !hasSupabaseEnv}
                        className="mt-4 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                    >
                        {loading ? '처리 중...' : '로그아웃'}
                    </button>
                </section>
            )}

            {!checkingAuth && !loggedInUserId && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => changeAuthMode('login')}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                authMode === 'login'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                            }`}
                        >
                            로그인
                        </button>
                        <button
                            type="button"
                            onClick={() => changeAuthMode('signup')}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                authMode === 'signup'
                                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                                    : 'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
                            }`}
                        >
                            회원가입
                        </button>
                    </div>

                    <div className="grid gap-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            이메일
                            <input
                                type="email"
                                placeholder="이메일 주소를 입력해 주세요"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                            />
                        </label>

                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            비밀번호
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                            />
                        </label>

                        {authMode === 'signup' && (
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                비밀번호 확인
                                <input
                                    type="password"
                                    placeholder="비밀번호를 다시 입력해 주세요"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                />
                            </label>
                        )}
                    </div>

                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={authMode === 'signup' ? signUp : signIn}
                            disabled={loading || !hasSupabaseEnv}
                            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                        >
                            {loading ? '처리 중...' : authMode === 'signup' ? '회원가입' : '로그인'}
                        </button>
                    </div>
                </section>
            )}

            {message && (
                <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    {message}
                </section>
            )}
        </main>
    );
}
