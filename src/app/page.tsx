'use client';

import Link from 'next/link';
import { NotebookPen, ShoppingCart, Utensils } from 'lucide-react';
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

export default function Home() {
    const todayKey = formatDateKey(new Date());
    const [todayHymnVideo, setTodayHymnVideo] = useState<HymnVideo | null>(null);
    const [hymnLoading, setHymnLoading] = useState(true);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stageType, setStageType] = useState<StageType>('medication');
    const [customAlertItems, setCustomAlertItems] = useState<CustomAlertArticle[]>([]);
    const [customAlertLoading, setCustomAlertLoading] = useState(false);
    const [customAlertIndex, setCustomAlertIndex] = useState(0);
    const [customAlertSliding, setCustomAlertSliding] = useState(false);

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

    const resolvedCancerType = treatmentMeta?.cancerType?.trim() || '유방암';
    const resolvedCancerStage = treatmentMeta?.cancerStage?.trim() || '2기';
    const customAlertSummary = `${resolvedCancerType} / ${STAGE_TYPE_LABELS[stageType]} 기준 소식`;

    useEffect(() => {
        let cancelled = false;

        const loadAlertContext = async () => {
            if (!hasSupabaseEnv || !supabase) {
                return;
            }

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData.user || cancelled) {
                return;
            }

            const uid = userData.user.id;
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
        };

        void loadAlertContext();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadCustomAlerts = async () => {
            setCustomAlertLoading(true);

            try {
                const params = new URLSearchParams({
                    cancerType: resolvedCancerType,
                    cancerStage: resolvedCancerStage,
                    stageType,
                });
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
    }, [resolvedCancerType, resolvedCancerStage, stageType]);

    useEffect(() => {
        setCustomAlertIndex(0);
        setCustomAlertSliding(false);
    }, [customAlertItems]);

    useEffect(() => {
        if (customAlertItems.length <= 1) {
            return;
        }

        let timeoutId: number | null = null;
        const intervalId = window.setInterval(() => {
            setCustomAlertSliding(true);
            timeoutId = window.setTimeout(() => {
                setCustomAlertIndex((prev) => (prev + 1) % customAlertItems.length);
                setCustomAlertSliding(false);
            }, 420);
        }, 4200);

        return () => {
            window.clearInterval(intervalId);
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [customAlertItems.length]);

    const currentAlert = customAlertItems[customAlertIndex] ?? null;
    const nextAlert =
        customAlertItems.length > 1 ? customAlertItems[(customAlertIndex + 1) % customAlertItems.length] : null;

    return (
        <main className="mx-auto max-w-3xl space-y-4 py-6">
            <section className="flex flex-wrap justify-center gap-4">
                <Link
                    href="/diet"
                    className="quickTileMono quickTileMono--emerald w-full sm:w-[220px]"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <Utensils className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">오늘 식단</span>
                </Link>
                <Link
                    href="/diet?view=record#today-record-section"
                    className="quickTileMono quickTileMono--amber w-full sm:w-[220px]"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <NotebookPen className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">오늘 기록</span>
                </Link>
                <Link
                    href="/shopping"
                    className="quickTileMono quickTileMono--sky w-full sm:w-[220px]"
                >
                    <span className="quickTileMono__iconWrap" aria-hidden="true">
                        <ShoppingCart className="quickTileMono__icon" />
                    </span>
                    <span className="quickTileMono__label text-xl">장보기</span>
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

                {!treatmentMeta && (
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
                        <div className="relative h-11 overflow-hidden">
                            <div
                                className={`absolute inset-x-0 transition-transform duration-500 ${
                                    customAlertSliding ? '-translate-y-11' : 'translate-y-0'
                                }`}
                            >
                                {currentAlert && (
                                    <a
                                        href={currentAlert.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={currentAlert.title}
                                        className="flex h-11 items-center px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        <span className="block w-full truncate">{currentAlert.title}</span>
                                    </a>
                                )}
                                {nextAlert && (
                                    <a
                                        href={nextAlert.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={nextAlert.title}
                                        className="flex h-11 items-center px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        <span className="block w-full truncate">{nextAlert.title}</span>
                                    </a>
                                )}
                            </div>
                        </div>
                        {customAlertItems.length > 1 && (
                            <p className="border-t border-gray-200 px-3 py-1 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                                {customAlertIndex + 1} / {customAlertItems.length}
                            </p>
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}
