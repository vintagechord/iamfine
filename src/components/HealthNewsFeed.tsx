'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import { filterAlertArticles, parseArticleDate } from '@/lib/alertArticles';
import {
    isNewsSnapshotFresh, mergeNewsSnapshot, parseNewsSnapshot, readNewsSnapshot,
    requestNewsSnapshot, shouldRefreshNews, type NewsSnapshot,
} from '@/lib/healthNews';
import { getAuthSessionUser, supabase } from '@/lib/supabaseClient';

type AlertContext = {
    key: string;
    cancerType: string;
};

type FeedState = NewsSnapshot & {
    contextKey: string;
    loading: boolean;
    error: string;
};

const PAGE_SIZE = 3;
const CACHE_PREFIX = 'custom-alert-cache-v3';

function readCancerType(raw: unknown): string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const cancerType = (raw as { cancerType?: unknown }).cancerType;
    return typeof cancerType === 'string' ? cancerType.trim() : '';
}

function contextForUser(user: { id: string; user_metadata?: unknown } | null): AlertContext {
    if (!user) return { key: 'guest', cancerType: '' };
    const metadata = user.user_metadata;
    const root = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};
    const scoped = root.iamfine && typeof root.iamfine === 'object' && !Array.isArray(root.iamfine)
        ? root.iamfine as Record<string, unknown>
        : {};
    let cancerType = readCancerType(scoped.treatmentMeta);
    if (!cancerType) {
        try {
            const local = localStorage.getItem(`treatment-meta-v1:${user.id}`);
            cancerType = local ? readCancerType(JSON.parse(local)) : '';
        } catch {
            // Account metadata remains usable when browser storage is unavailable.
        }
    }
    return { key: `${user.id}:${cancerType}`, cancerType };
}

function formatDate(raw: string) {
    const timestamp = parseArticleDate(raw);
    return timestamp === null ? '' : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', month: 'long', day: 'numeric',
    }).format(new Date(timestamp));
}

function formatUpdatedAgo(raw: string) {
    const timestamp = parseArticleDate(raw);
    if (timestamp === null) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    if (minutes < 1) return '방금 업데이트';
    if (minutes < 60) return `${minutes}분 전 업데이트`;
    const hours = Math.floor(minutes / 60);
    return hours < 48 ? `${hours}시간 전 업데이트` : `${Math.floor(hours / 24)}일 전 업데이트`;
}

export default function HealthNewsFeed() {
    const headingId = useId();
    const [context, setContext] = useState<AlertContext | null>(null);
    const [retry, setRetry] = useState(0);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [feed, setFeed] = useState<FeedState>({
        contextKey: '', items: [], updatedAt: '', loading: true, error: '', partial: false,
    });
    const activeRequest = useRef<AbortController | null>(null);
    const latestFeed = useRef(feed);
    const lastAttemptAt = useRef(0);
    const forceRefresh = useRef(false);

    useEffect(() => { latestFeed.current = feed; }, [feed]);

    useEffect(() => {
        let cancelled = false;
        let authRevision = 0;
        let currentKey = '';
        const applyContext = (next: AlertContext) => {
            if (cancelled || currentKey === next.key) return;
            currentKey = next.key;
            activeRequest.current?.abort();
            lastAttemptAt.current = 0;
            forceRefresh.current = false;
            setContext(next);
            setVisibleCount(PAGE_SIZE);
        };
        const initialRevision = authRevision;
        void getAuthSessionUser().then(({ user }) => {
            if (!cancelled && authRevision === initialRevision) applyContext(contextForUser(user));
        }).catch(() => {
            if (!cancelled && authRevision === initialRevision) applyContext(contextForUser(null));
        });
        const subscription = supabase?.auth.onAuthStateChange((event, session) => {
            if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
            authRevision += 1;
            applyContext(contextForUser(event === 'SIGNED_OUT' ? null : session?.user ?? null));
        }).data.subscription;
        return () => {
            cancelled = true;
            activeRequest.current?.abort();
            subscription?.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!context) return;
        const controller = new AbortController();
        activeRequest.current = controller;
        const bypassCache = forceRefresh.current;
        forceRefresh.current = false;
        const params = new URLSearchParams();
        if (context.cancerType) params.set('cancerType', context.cancerType);
        else params.set('mode', 'general');
        const cacheKey = `${CACHE_PREFIX}:${context.key}:${params.toString()}`;

        const loadNews = async () => {
            let cached: NewsSnapshot | null = null;
            try {
                cached = readNewsSnapshot(sessionStorage.getItem(cacheKey));
            } catch {
                // Fetching news does not depend on browser storage.
            }
            const previous = latestFeed.current.contextKey === context.key
                ? parseNewsSnapshot(latestFeed.current) : null;
            if (previous && (!cached || Date.parse(previous.updatedAt) > Date.parse(cached.updatedAt))) {
                cached = previous;
            }
            setFeed({
                contextKey: context.key, items: cached?.items ?? [], updatedAt: cached?.updatedAt ?? '',
                partial: cached?.partial ?? false, loading: true, error: '',
            });
            try {
                if (cached && isNewsSnapshotFresh(cached) && !bypassCache) {
                    if (!controller.signal.aborted) setFeed({ ...cached, contextKey: context.key, loading: false, error: '' });
                    return;
                }
                lastAttemptAt.current = Date.now();
                const incoming = await requestNewsSnapshot(`/api/custom-alerts?${params.toString()}`, { signal: controller.signal });
                if (controller.signal.aborted || activeRequest.current !== controller) return;
                const next = mergeNewsSnapshot(cached, incoming);
                setFeed({ ...next, contextKey: context.key, loading: false, error: '' });
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(next));
                } catch {
                    // A storage failure does not turn a successful request into an error.
                }
            } catch {
                if (controller.signal.aborted || activeRequest.current !== controller) return;
                const fallbackItems = filterAlertArticles(cached?.items ?? []);
                setFeed({
                    contextKey: context.key,
                    items: fallbackItems,
                    updatedAt: cached?.updatedAt ?? '',
                    partial: cached?.partial === true,
                    loading: false,
                    error: fallbackItems.length
                        ? '최신 소식을 불러오지 못해 저장된 소식을 보여드려요.'
                        : '소식을 불러오지 못했어요. 다시 시도해 주세요.',
                });
            } finally {
                if (activeRequest.current === controller) activeRequest.current = null;
            }
        };
        void loadNews();
        return () => {
            controller.abort();
            if (activeRequest.current === controller) activeRequest.current = null;
        };
    }, [context, retry]);

    useEffect(() => {
        if (!context) return;
        const refreshIfNeeded = () => {
            if (document.visibilityState !== 'visible') return;
            const current = latestFeed.current.contextKey === context.key ? latestFeed.current : null;
            const snapshot = parseNewsSnapshot(current);
            // Long-open tabs also expire articles at the Korean two-calendar-month boundary.
            if (current && snapshot && current.items.length !== snapshot.items.length) {
                setFeed((previous) => previous.contextKey === context.key
                    ? { ...previous, items: snapshot.items } : previous);
            }
            if (activeRequest.current || !shouldRefreshNews(snapshot, lastAttemptAt.current)) return;
            forceRefresh.current = true;
            setRetry((value) => value + 1);
        };
        window.addEventListener('focus', refreshIfNeeded);
        window.addEventListener('online', refreshIfNeeded);
        document.addEventListener('visibilitychange', refreshIfNeeded);
        const timer = window.setInterval(refreshIfNeeded, 60_000);
        return () => {
            window.removeEventListener('focus', refreshIfNeeded);
            window.removeEventListener('online', refreshIfNeeded);
            document.removeEventListener('visibilitychange', refreshIfNeeded);
            window.clearInterval(timer);
        };
    }, [context]);

    const refreshNews = () => {
        forceRefresh.current = true;
        setRetry((value) => value + 1);
    };

    // An account change immediately hides the previous patient's selected news.
    const currentFeed = context?.key === feed.contextKey ? feed : null;
    const loading = !currentFeed || currentFeed.loading;
    const items = currentFeed?.items ?? [];
    const updatedAgo = currentFeed?.updatedAt ? formatUpdatedAgo(currentFeed.updatedAt) : '';

    return (
        <section className="healthNews" aria-labelledby={headingId}>
            <header className="healthNewsHeader">
                <div>
                    <p className="healthNewsEyebrow">
                        <Newspaper className="healthNewsIcon" aria-hidden="true" />
                        읽는 건강 정보
                    </p>
                    <h2 id={headingId} className="healthNewsTitle">건강 소식</h2>
                </div>
                <span className="healthNewsPeriod">최근 2개월</span>
            </header>
            <p className="healthNewsIntro">
                {context?.cancerType ? `${context.cancerType} 관련 기사와 암센터·병원 소식` : '암센터·병원 소식과 건강 기사'}
            </p>
            {loading && <p role="status" className="healthNewsState">{items.length ? '새 소식을 확인하고 있어요…' : '새 소식을 불러오고 있어요…'}</p>}
            {!loading && currentFeed?.error && (
                <div className="healthNewsState" role="status">
                    <p>{currentFeed.error}</p>
                </div>
            )}
            {!loading && !currentFeed?.error && currentFeed?.partial && <p role="status" className="healthNewsState">{items.length ? '일부 출처를 확인하지 못해 확인된 소식을 먼저 보여드려요.' : '일부 출처를 확인하지 못했어요. 다시 불러와 주세요.'}</p>}
            {!loading && !currentFeed?.error && !currentFeed?.partial && items.length === 0 && <p className="healthNewsState">최근 2개월 안에 등록된 관련 소식이 아직 없어요.</p>}
            {items.length > 0 && (
                <>
                    <ul className="healthNewsList">
                        {items.slice(0, visibleCount).map((item) => (
                            <li key={item.url}>
                                <article>
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="healthNewsArticle">
                                        <div className="healthNewsArticleBody">
                                            <p className="healthNewsMeta">
                                                <span className="healthNewsKind">{item.kind === 'official' ? '기관 소식' : '건강 기사'}</span>
                                                <span>{item.source}</span>
                                                <span aria-hidden="true">·</span>
                                                <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
                                            </p>
                                            <h3 className="healthNewsArticleTitle">{item.title}<span className="sr-only"> (새 창)</span></h3>
                                        </div>
                                        <ArrowUpRight className="healthNewsArticleArrow" aria-hidden="true" />
                                    </a>
                                </article>
                            </li>
                        ))}
                    </ul>
                    {visibleCount < items.length && <button type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="uiButton uiButton--secondary healthNewsMore">소식 더 보기</button>}
                </>
            )}
            <div className="flex items-center justify-between gap-3 mt-3">
                <p className="healthNewsFooter">{updatedAgo}</p>
                <button type="button" onClick={refreshNews} disabled={loading} aria-label="건강 소식 새로고침" className="uiButton uiButton--secondary uiButton--small">{loading ? '확인 중…' : '새로고침'}</button>
            </div>
        </section>
    );
}
