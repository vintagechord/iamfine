'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

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
        const { user, error: userError } = await getAuthSessionUser();

        if (userError || !user) {
            setLoggedInUserId(null);
            setNickname('');
            setCheckingAuth(false);
            return;
        }

        const uid = user.id;
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
            setMessage('서비스에 연결하지 못했어요. 잠시 후 다시 이용해 주세요.');
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
            setMessage('서비스에 연결하지 못했어요. 잠시 후 다시 이용해 주세요.');
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
            setMessage('서비스에 연결하지 못했어요. 잠시 후 다시 이용해 주세요.');
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
        <main className="mx-auto w-full max-w-md py-6 sm:py-12">
            <section className="uiCard p-6 sm:p-8">
                <header className="uiPageHeader mb-7 text-center">
                    <span className="uiBadge mb-4">IamFine</span>
                    <h1>{loggedInUserId ? '반가워요' : authMode === 'signup' ? '함께 시작해요' : '나의 식사를 이어가세요'}</h1>
                    <p>{loggedInUserId ? `${nickname || '회원'}님, 오늘의 식사를 준비해 볼까요?` : '나에게 맞는 식단과 기록을 한곳에서 관리해요.'}</p>
                </header>

                {!hasSupabaseEnv && (
                    <div role="alert" className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                        서비스에 연결하지 못했어요. 잠시 후 다시 이용해 주세요.
                    </div>
                )}

                {checkingAuth && hasSupabaseEnv && (
                    <p role="status" className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">로그인 상태를 확인하고 있어요…</p>
                )}

                {!checkingAuth && loggedInUserId && (
                    <div className="space-y-3">
                        <Link href="/diet" className="uiButton uiButton--primary w-full">식단 제안 보기</Link>
                        <Link href="/diet?view=record" className="uiButton uiButton--secondary w-full">식단 관리하기</Link>
                        <button type="button" onClick={signOut} disabled={loading || !hasSupabaseEnv} className="uiButton uiButton--ghost w-full">
                            {loading ? '처리 중…' : '로그아웃'}
                        </button>
                    </div>
                )}

                {!checkingAuth && !loggedInUserId && (
                    <>
                        <nav className="uiSegmented mb-6 grid grid-cols-2" aria-label="로그인 또는 회원가입">
                            <button type="button" onClick={() => changeAuthMode('login')} disabled={loading} aria-pressed={authMode === 'login'} className="uiButton uiButton--ghost">로그인</button>
                            <button type="button" onClick={() => changeAuthMode('signup')} disabled={loading} aria-pressed={authMode === 'signup'} className="uiButton uiButton--ghost">회원가입</button>
                        </nav>
                        <form noValidate onSubmit={(event) => { event.preventDefault(); if (!loading) void (authMode === 'signup' ? signUp() : signIn()); }} aria-busy={loading}>
                            <fieldset disabled={loading || !hasSupabaseEnv} className="space-y-5">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                    이메일
                                    <input
                                        type="email"
                                        aria-label="이메일"
                                        autoComplete="email"
                                        inputMode="email"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        enterKeyHint="next"
                                        placeholder="example@email.com"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#497561] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    />
                                </label>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                    비밀번호
                                    <input
                                        type="password"
                                        aria-label="비밀번호"
                                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                                        enterKeyHint={authMode === 'signup' ? 'next' : 'go'}
                                        placeholder="비밀번호를 입력해 주세요"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#497561] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                    />
                                </label>
                                {authMode === 'signup' && (
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                        비밀번호 확인
                                        <input
                                            type="password"
                                            aria-label="비밀번호 확인"
                                            autoComplete="new-password"
                                            enterKeyHint="go"
                                            placeholder="비밀번호를 한 번 더 입력해 주세요"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#497561] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                        />
                                    </label>
                                )}
                                <button type="submit" className="uiButton uiButton--primary w-full">
                                    {loading ? '처리 중…' : authMode === 'signup' ? '회원가입' : '로그인'}
                                </button>
                            </fieldset>
                        </form>
                    </>
                )}

                {message && (
                    <p role="status" aria-live="polite" className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700 dark:bg-gray-950 dark:text-gray-200">{message}</p>
                )}
            </section>
        </main>
    );
}
