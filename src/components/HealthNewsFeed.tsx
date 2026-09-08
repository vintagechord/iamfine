'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Newspaper } from 'lucide-react';
import { filterAlertArticles, parseArticleDate, type AlertArticle } from '@/lib/alertArticles';
import { getAuthSessionUser, supabase } from '@/lib/supabaseClient';

type AlertCache = {
    items: AlertArticle[];
    updatedAt: string;
    partial?: boolean;
};

type AlertContext = {
    key: string;
    cancerType: string;
};

type FeedState = AlertCache & {
    contextKey: string;
    loading: boolean;
    error: string;
};

const PAGE_SIZE = 3;
const CACHE_PREFIX = 'custom-alert-cache-v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

function parseCache(raw: string | null): AlertCache | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<AlertCache>;
        if (!parsed || typeof parsed.updatedAt !== 'string' || !parsed.updatedAt) return null;
        return {
            updatedAt: parsed.updatedAt,
            items: filterAlertArticles(Array.isArray(parsed.items) ? parsed.items : []),
            partial: parsed.partial === true,
        };
    } catch {
        return null;
    }
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

    useEffect(() => {
        let cancelled = false;
        let authRevision = 0;
        let currentKey = '';
        const applyContext = (next: AlertContext) => {
            if (cancelled || currentKey === next.key) return;
            currentKey = next.key;
            activeRequest.current?.abort();
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
        const params = new URLSearchParams();
        if (context.cancerType) params.set('cancerType', context.cancerType);
        else params.set('mode', 'general');
        const cacheKey = `${CACHE_PREFIX}:${params.toString()}`;

        const loadNews = async () => {
            setVisibleCount(PAGE_SIZE);
            setFeed({ contextKey: context.key, items: [], updatedAt: '', loading: true, error: '', partial: false });
            let cached: AlertCache | null = null;
            try {
                cached = parseCache(sessionStorage.getItem(cacheKey));
            } catch {
                // Fetching news does not depend on browser storage.
            }
            const cachedTime = cached ? Date.parse(cached.updatedAt) : Number.NaN;
            const fresh = cached && Number.isFinite(cachedTime) && cachedTime <= Date.now()
                && Date.now() - cachedTime < CACHE_TTL_MS;
            if (fresh && cached && retry === 0) {
                if (!controller.signal.aborted) setFeed({ ...cached, contextKey: context.key, loading: false, error: '' });
                return;
            }
            try {
                const response = await fetch(`/api/custom-alerts?${params.toString()}`, { signal: controller.signal });
                if (!response.ok) throw new Error('News sources unavailable');
                const payload = await response.json() as Partial<AlertCache>;
                const next: AlertCache = {
                    items: filterAlertArticles(Array.isArray(payload.items) ? payload.items : []),
                    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt ? payload.updatedAt : new Date().toISOString(),
                    partial: payload.partial === true,
                };
                if (controller.signal.aborted) return;
                setFeed({ ...next, contextKey: context.key, loading: false, error: '' });
                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify(next));
                } catch {
                    // A storage failure does not turn a successful request into an error.
                }
            } catch {
                if (controller.signal.aborted) return;
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
            }
        };
        void loadNews();
        return () => {
            controller.abort();
            if (activeRequest.current === controller) activeRequest.current = null;
        };
    }, [context, retry]);

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
            {loading && <p role="status" className="healthNewsState">새 소식을 불러오고 있어요…</p>}
            {!loading && currentFeed?.error && (
                <div className="healthNewsState" role="status">
                    <p>{currentFeed.error}</p>
                    <button type="button" onClick={() => setRetry((value) => value + 1)} className="uiButton uiButton--secondary uiButton--small mt-3">다시 불러오기</button>
                </div>
            )}
            {!loading && !currentFeed?.error && items.length === 0 && <p className="healthNewsState">최근 2개월 안에 등록된 관련 소식이 아직 없어요.</p>}
            {!loading && items.length > 0 && (
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
            {!loading && updatedAgo && <p className="healthNewsFooter">{updatedAgo}</p>}
        </section>
    );
}
