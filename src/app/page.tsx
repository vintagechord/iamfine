'use client';

import Link from 'next/link';
import { MapPinned, NotebookPen, ShoppingCart, Utensils } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatDateKey, STAGE_TYPE_LABELS, type StageType } from '@/lib/dietEngine';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type HymnVideo = {
    title: string;
    videoId: string;
};

type TreatmentMeta = {
    cancerType: string;
    cancerStage: string;
    updatedAt: string;
};

type StageStatus = 'planned' | 'active' | 'completed';

type TreatmentStageRow = {
    stage_type: StageType;
    status: StageStatus;
    stage_order: number;
    created_at: string;
};

type CustomAlertArticle = {
    source: string;
    title: string;
    url: string;
    publishedAt: string;
};

const DAILY_HYMN_VIDEOS: HymnVideo[] = [
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'SfUoRQy-LH4' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'wbWtTmUNjrI' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'yUDzQoX9GWI' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'XzBClmpxg6o' },
    { title: '찬송가 369장 죄짐 맡은 우리 구주', videoId: 'xvhFVkVw9ks' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'IIb0HREOXe0' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: 'zh8KHxu40G4' },
    { title: '찬송가 305장 나 같은 죄인 살리신', videoId: '6cRWbCWQvcw' },
];

const SHOW_DAILY_HYMN = false;
const ALERT_PAGE_SIZE = 5;
const ALERT_AUTO_SLIDE_MS = 6000;

const TREATMENT_META_PREFIX = 'treatment-meta-v1';

function getTreatmentMetaKey(userId: string) {
    return `${TREATMENT_META_PREFIX}:${userId}`;
}

function parseTreatmentMeta(raw: string | null): TreatmentMeta | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<TreatmentMeta>;
        if (!parsed.cancerType || !parsed.cancerStage) {
            return null;
        }
        return {
            cancerType: parsed.cancerType,
            cancerStage: parsed.cancerStage,
            updatedAt: parsed.updatedAt ?? '',
        };
    } catch {
        return null;
    }
}

function formatAlertDate(raw: string) {
    if (!raw) {
        return '날짜 미표기';
    }

    const normalized = raw.replace(/\.\s*/g, '-').replace(/\.\s*$/, '');
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
        return raw;
    }

    const date = new Date(parsed);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

export default function Home() {
    const todayKey = formatDateKey(new Date());
    const [todayHymnVideo, setTodayHymnVideo] = useState<HymnVideo | null>(null);
    const [hymnLoading, setHymnLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [alertContextReady, setAlertContextReady] = useState(false);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stageType, setStageType] = useState<StageType>('medication');
    const [customAlertItems, setCustomAlertItems] = useState<CustomAlertArticle[]>([]);
    const [customAlertLoading, setCustomAlertLoading] = useState(false);
    const [customAlertPage, setCustomAlertPage] = useState(0);

    const startIndex = useMemo(() => {
        const seed = Number(todayKey.replaceAll('-', ''));
        return Number.isFinite(seed) ? seed % DAILY_HYMN_VIDEOS.length : 0;
    }, [todayKey]);

    useEffect(() => {
        let cancelled = false;

        const pickEmbeddableHymn = async () => {
            setHymnLoading(true);

            for (let offset = 0; offset < DAILY_HYMN_VIDEOS.length; offset += 1) {
                const candidate = DAILY_HYMN_VIDEOS[(startIndex + offset) % DAILY_HYMN_VIDEOS.length];
                const watchUrl = `https://www.youtube.com/watch?v=${candidate.videoId}`;
                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

                try {
                    const response = await fetch(oembedUrl);
                    if (response.ok) {
                        if (!cancelled) {
                            setTodayHymnVideo(candidate);
                            setHymnLoading(false);
                        }
                        return;
                    }
                } catch {
                    // 네트워크 오류는 다음 후보를 확인합니다.
                }
            }

            if (!cancelled) {
                setTodayHymnVideo(null);
                setHymnLoading(false);
            }
        };

        void pickEmbeddableHymn();

        return () => {
            cancelled = true;
        };
    }, [startIndex]);

    const todayHymnEmbedUrl = useMemo(
        () =>
            todayHymnVideo
                ? `https://www.youtube-nocookie.com/embed/${todayHymnVideo.videoId}?autoplay=0&rel=0`
                : '',
        [todayHymnVideo]
    );

    const resolvedCancerType = treatmentMeta?.cancerType?.trim() ?? '';
    const resolvedCancerStage = treatmentMeta?.cancerStage?.trim() ?? '';
    const customAlertSummary =
        isLoggedIn && resolvedCancerType
            ? `${resolvedCancerType} / ${STAGE_TYPE_LABELS[stageType]} 기준 소식`
            : '암종 공통 건강 소식';

    useEffect(() => {
        let cancelled = false;

        const loadAlertContext = async () => {
            if (!hasSupabaseEnv || !supabase) {
                if (!cancelled) {
                    setIsLoggedIn(false);
                    setTreatmentMeta(null);
                    setStageType('medication');
                    setAlertContextReady(true);
                }
                return;
            }

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData.user || cancelled) {
                if (!cancelled) {
                    setIsLoggedIn(false);
                    setTreatmentMeta(null);
                    setStageType('medication');
                    setAlertContextReady(true);
                }
                return;
            }

            const uid = userData.user.id;
            setIsLoggedIn(true);
            const meta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
            if (!cancelled) {
                setTreatmentMeta(meta);
            }

            const { data: stageData } = await supabase
                .from('treatment_stages')
                .select('stage_type, status, stage_order, created_at')
                .eq('user_id', uid)
                .order('stage_order', { ascending: true })
                .order('created_at', { ascending: true });

            if (cancelled) {
                return;
            }

            const stages = (stageData as TreatmentStageRow[] | null) ?? [];
            const activeStage = stages.find((stage) => stage.status === 'active') ?? stages[0];
            if (activeStage) {
                setStageType(activeStage.stage_type);
            }
            if (!cancelled) {
                setAlertContextReady(true);
            }
        };

        void loadAlertContext();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!alertContextReady) {
            return;
        }

        let cancelled = false;

        const loadCustomAlerts = async () => {
            setCustomAlertLoading(true);

            try {
                const params = new URLSearchParams();
                if (isLoggedIn && resolvedCancerType) {
                    params.set('cancerType', resolvedCancerType);
                    params.set('stageType', stageType);
                    if (resolvedCancerStage) {
                        params.set('cancerStage', resolvedCancerStage);
                    }
                } else {
                    params.set('mode', 'general');
                }
                const response = await fetch(`/api/custom-alerts?${params.toString()}`);
                const payload = (await response.json()) as { items?: CustomAlertArticle[] };

                if (!cancelled) {
                    setCustomAlertItems(Array.isArray(payload.items) ? payload.items : []);
                }
            } catch {
                if (!cancelled) {
                    setCustomAlertItems([]);
                }
            } finally {
                if (!cancelled) {
                    setCustomAlertLoading(false);
                }
            }
        };

        void loadCustomAlerts();

        return () => {
            cancelled = true;
        };
    }, [alertContextReady, isLoggedIn, resolvedCancerType, resolvedCancerStage, stageType]);

    useEffect(() => {
        setCustomAlertPage(0);
    }, [customAlertItems]);

    const customAlertPageCount = Math.max(1, Math.ceil(customAlertItems.length / ALERT_PAGE_SIZE));

    useEffect(() => {
        if (customAlertPageCount <= 1) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setCustomAlertPage((prev) => (prev + 1) % customAlertPageCount);
        }, ALERT_AUTO_SLIDE_MS);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [customAlertPageCount]);

    const visibleCustomAlerts = useMemo(() => {
        const start = customAlertPage * ALERT_PAGE_SIZE;
        return customAlertItems.slice(start, start + ALERT_PAGE_SIZE);
    }, [customAlertItems, customAlertPage]);

    return (
        <main className="mx-auto max-w-3xl space-y-4 py-6">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Link
                    href="/diet"
                    className="quickTileMono quickTileMono--emerald w-full"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <Utensils className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">오늘 식단</span>
                </Link>
                <Link
                    href="/diet?view=record#today-record-section"
                    className="quickTileMono quickTileMono--amber w-full"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <NotebookPen className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">오늘 기록</span>
                </Link>
                <Link
                    href="/shopping"
                    className="quickTileMono quickTileMono--sky w-full"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <ShoppingCart className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">장보기</span>
                </Link>
                <Link
                    href="/restaurants"
                    className="quickTileMono quickTileMono--emerald w-full"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <MapPinned className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">건강식당 찾기</span>
                </Link>
            </section>

            {SHOW_DAILY_HYMN && (
                <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">오늘 추천 찬송가</h2>
                    </div>
                    {hymnLoading && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">재생 가능한 찬송가를 확인하는 중이에요…</p>}
                    {!hymnLoading && !todayHymnVideo && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                            오늘은 퍼가기 가능한 영상을 찾지 못했어요. 잠시 후 다시 확인해 주세요.
                        </p>
                    )}
                    {!hymnLoading && todayHymnVideo && (
                        <>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">오늘 추천: {todayHymnVideo.title}</p>
                            <div className="mt-3 aspect-video overflow-hidden rounded-xl border border-gray-200 bg-black dark:border-gray-800">
                                <iframe
                                    title={`오늘 추천 찬송가 - ${todayHymnVideo.title}`}
                                    src={todayHymnEmbedUrl}
                                    className="h-full w-full"
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>
                        </>
                    )}
                </section>
            )}

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">맞춤 알림</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{customAlertSummary}</p>

                {isLoggedIn && !treatmentMeta && (
                    <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                        <Link href="/profile" className="font-semibold underline">
                            내 정보
                        </Link>
                        에서 암 종류를 먼저 입력해 주세요.
                    </p>
                )}

                {customAlertLoading && (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">관련 공지를 확인하는 중이에요…</p>
                )}

                {!customAlertLoading && customAlertItems.length === 0 && (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        현재 키워드에 맞는 주요 공지가 아직 없어요.
                    </p>
                )}

                {!customAlertLoading && customAlertItems.length > 0 && (
                    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800">
                        <div className="divide-y divide-gray-200 dark:divide-gray-800">
                            {visibleCustomAlerts.map((alertItem, index) => (
                                <a
                                    key={`${alertItem.url}-${index}`}
                                    href={alertItem.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={alertItem.title}
                                    className="block px-3 py-2 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        {customAlertPage * ALERT_PAGE_SIZE + index + 1}. {alertItem.title}
                                    </p>
                                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                        {alertItem.source} · {formatAlertDate(alertItem.publishedAt)}
                                    </p>
                                </a>
                            ))}
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-1 dark:border-gray-800">
                            <button
                                type="button"
                                onClick={() =>
                                    setCustomAlertPage((prev) => (prev - 1 + customAlertPageCount) % customAlertPageCount)
                                }
                                className="rounded px-2 py-0.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-default disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                disabled={customAlertPageCount <= 1}
                                aria-label="이전 알림 5개 보기"
                            >
                                ◀ 이전
                            </button>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {customAlertPage + 1}/{customAlertPageCount} 페이지 · 총 {customAlertItems.length}건
                            </p>
                            <button
                                type="button"
                                onClick={() => setCustomAlertPage((prev) => (prev + 1) % customAlertPageCount)}
                                className="rounded px-2 py-0.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-default disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                disabled={customAlertPageCount <= 1}
                                aria-label="다음 알림 5개 보기"
                            >
                                다음 ▶
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}
