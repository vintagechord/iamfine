'use client';

import Link from 'next/link';
import { CalendarClock, MapPinned, NotebookPen, ShoppingCart, Stethoscope, Utensils } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
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

type CustomAlertCache = {
    items: CustomAlertArticle[];
    updatedAt: string;
};

type VisitScheduleItem = {
    id: string;
    visitDate: string;
    visitTime: string;
    hospitalName: string;
    treatmentNote: string;
    preparationNote: string;
    createdAt: string;
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
const ALERT_CACHE_PREFIX = 'custom-alert-cache-v1';
const ALERT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const VISIT_SCHEDULE_PREFIX = 'visit-schedule-v1';

const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const USER_METADATA_NAMESPACE = 'iamfine';

function getTreatmentMetaKey(userId: string) {
    return `${TREATMENT_META_PREFIX}:${userId}`;
}

function parseTreatmentMeta(raw: string | null): TreatmentMeta | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<TreatmentMeta>;
        if (!parsed.cancerType) {
            return null;
        }
        return {
            cancerType: parsed.cancerType,
            cancerStage: typeof parsed.cancerStage === 'string' ? parsed.cancerStage : '',
            updatedAt: parsed.updatedAt ?? '',
        };
    } catch {
        return null;
    }
}

function parseTreatmentMetaFromUnknown(raw: unknown): TreatmentMeta | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const parsed = raw as Partial<TreatmentMeta>;
    if (typeof parsed.cancerType !== 'string' || !parsed.cancerType.trim()) {
        return null;
    }

    return {
        cancerType: parsed.cancerType.trim(),
        cancerStage: typeof parsed.cancerStage === 'string' ? parsed.cancerStage.trim() : '',
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
}

function readIamfineTreatmentMeta(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return null;
    }

    const scoped = namespaced as Record<string, unknown>;
    return parseTreatmentMetaFromUnknown(scoped.treatmentMeta);
}

function formatAlertDate(raw: string) {
    const parsedDate = parseAlertDate(raw);
    if (!parsedDate) {
        return raw || '날짜 미표기';
    }

    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    return `${month}/${day}`;
}

function parseAlertDate(raw: string) {
    if (!raw) {
        return null;
    }

    const directParsed = Date.parse(raw);
    if (!Number.isNaN(directParsed)) {
        return new Date(directParsed);
    }

    const normalized = raw.replace(/\.\s*/g, '-').replace(/\.\s*$/, '');
    const normalizedParsed = Date.parse(normalized);
    if (!Number.isNaN(normalizedParsed)) {
        return new Date(normalizedParsed);
    }

    return null;
}

function formatAlertUpdatedAgo(raw: string) {
    const parsedDate = parseAlertDate(raw);
    if (!parsedDate) {
        return '업데이트 시간 미확인';
    }

    const diffMs = Date.now() - parsedDate.getTime();
    if (diffMs <= 0) {
        return '방금 업데이트';
    }

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 1) {
        return '방금 업데이트';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes}분 전 업데이트`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 48) {
        return `${diffHours}시간 전 업데이트`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}일 전 업데이트`;
}

function buildCustomAlertCacheKey(params: URLSearchParams) {
    return `${ALERT_CACHE_PREFIX}:${params.toString()}`;
}

function parseCustomAlertCache(raw: string | null): CustomAlertCache | null {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<CustomAlertCache>;
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '';
        if (!updatedAt) {
            return null;
        }

        const items = Array.isArray(parsed.items)
            ? parsed.items.filter((item): item is CustomAlertArticle => {
                  if (!item || typeof item !== 'object') {
                      return false;
                  }
                  const candidate = item as Partial<CustomAlertArticle>;
                  return (
                      typeof candidate.source === 'string' &&
                      typeof candidate.title === 'string' &&
                      typeof candidate.url === 'string' &&
                      typeof candidate.publishedAt === 'string'
                  );
              })
            : [];

        return {
            updatedAt,
            items,
        };
    } catch {
        return null;
    }
}

function getVisitScheduleKey(userId: string | null) {
    return `${VISIT_SCHEDULE_PREFIX}:${userId ?? 'guest'}`;
}

function parseVisitScheduleList(raw: string | null) {
    if (!raw) {
        return [] as VisitScheduleItem[];
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return [] as VisitScheduleItem[];
        }

        return parsed
            .filter((item): item is VisitScheduleItem => {
                if (!item || typeof item !== 'object') {
                    return false;
                }
                const candidate = item as Partial<VisitScheduleItem>;
                return (
                    typeof candidate.id === 'string' &&
                    typeof candidate.visitDate === 'string' &&
                    typeof candidate.visitTime === 'string' &&
                    (typeof candidate.hospitalName === 'string' || candidate.hospitalName === undefined) &&
                    typeof candidate.treatmentNote === 'string' &&
                    typeof candidate.preparationNote === 'string' &&
                    typeof candidate.createdAt === 'string'
                );
            })
            .map((item) => ({
                ...item,
                hospitalName: item.hospitalName?.trim() ?? '',
            }))
            .sort((a, b) => {
                const aKey = `${a.visitDate} ${a.visitTime}`;
                const bKey = `${b.visitDate} ${b.visitTime}`;
                return aKey.localeCompare(bKey);
            });
    } catch {
        return [] as VisitScheduleItem[];
    }
}

function formatVisitScheduleDate(rawDate: string) {
    if (!rawDate) {
        return '날짜 미정';
    }

    const [year, month, day] = rawDate.split('-').map(Number);
    if (!year || !month || !day) {
        return rawDate;
    }

    const date = new Date(year, month - 1, day);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${weekday})`;
}

function formatVisitScheduleTime(rawTime: string) {
    if (!rawTime) {
        return '시간 미정';
    }

    const [hour, minute] = rawTime.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return rawTime;
    }

    const period = hour >= 12 ? '오후' : '오전';
    const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${period} ${normalizedHour}:${String(minute).padStart(2, '0')}`;
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
    const [customAlertUpdatedAt, setCustomAlertUpdatedAt] = useState('');
    const [customAlertLoading, setCustomAlertLoading] = useState(false);
    const [customAlertPage, setCustomAlertPage] = useState(0);
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [visitSchedules, setVisitSchedules] = useState<VisitScheduleItem[]>([]);
    const [showVisitScheduleModal, setShowVisitScheduleModal] = useState(false);
    const [visitDateInput, setVisitDateInput] = useState('');
    const [visitTimeInput, setVisitTimeInput] = useState('');
    const [visitHospitalInput, setVisitHospitalInput] = useState('');
    const [visitTreatmentInput, setVisitTreatmentInput] = useState('');
    const [visitPreparationInput, setVisitPreparationInput] = useState('');
    const [visitFormMessage, setVisitFormMessage] = useState('');
    const [visitFormIsError, setVisitFormIsError] = useState(false);

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
                    setAuthUserId(null);
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
                    setAuthUserId(null);
                    setAlertContextReady(true);
                }
                return;
            }

            const uid = userData.user.id;
            setIsLoggedIn(true);
            setAuthUserId(uid);
            const metadataMeta = readIamfineTreatmentMeta(userData.user.user_metadata);
            const localMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
            const meta = metadataMeta ?? localMeta;
            if (!cancelled) {
                setTreatmentMeta(meta);
            }
            if (!localMeta && meta) {
                localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(meta));
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

        const key = getVisitScheduleKey(authUserId);
        setVisitSchedules(parseVisitScheduleList(localStorage.getItem(key)));
    }, [alertContextReady, authUserId]);

    useEffect(() => {
        if (!alertContextReady) {
            return;
        }

        let cancelled = false;

        const loadCustomAlerts = async () => {
            setCustomAlertLoading(true);
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
            const cacheKey = buildCustomAlertCacheKey(params);
            const cached = parseCustomAlertCache(localStorage.getItem(cacheKey));
            const cachedUpdatedMs = cached ? Date.parse(cached.updatedAt) : Number.NaN;
            const isCacheFresh =
                cached !== null &&
                Number.isFinite(cachedUpdatedMs) &&
                Date.now() - cachedUpdatedMs < ALERT_CACHE_TTL_MS;

            if (isCacheFresh) {
                if (!cancelled) {
                    setCustomAlertItems(cached.items);
                    setCustomAlertUpdatedAt(cached.updatedAt);
                    setCustomAlertLoading(false);
                }
                return;
            }

            try {
                const response = await fetch(`/api/custom-alerts?${params.toString()}`);
                const payload = (await response.json()) as {
                    items?: CustomAlertArticle[];
                    updatedAt?: string;
                };
                const nextItems = Array.isArray(payload.items) ? payload.items : [];
                const nextUpdatedAt =
                    typeof payload.updatedAt === 'string' && payload.updatedAt
                        ? payload.updatedAt
                        : new Date().toISOString();

                if (!cancelled) {
                    setCustomAlertItems(nextItems);
                    setCustomAlertUpdatedAt(nextUpdatedAt);
                }

                localStorage.setItem(
                    cacheKey,
                    JSON.stringify({
                        items: nextItems,
                        updatedAt: nextUpdatedAt,
                    } satisfies CustomAlertCache)
                );
            } catch {
                if (!cancelled) {
                    if (cached) {
                        setCustomAlertItems(cached.items);
                        setCustomAlertUpdatedAt(cached.updatedAt);
                    } else {
                        setCustomAlertItems([]);
                        setCustomAlertUpdatedAt('');
                    }
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

    const upcomingVisit = useMemo(() => {
        if (visitSchedules.length === 0) {
            return null;
        }

        const now = Date.now();
        const upcoming = visitSchedules.find((item) => {
            const parsed = Date.parse(`${item.visitDate}T${item.visitTime || '00:00'}:00`);
            return Number.isFinite(parsed) && parsed >= now;
        });
        return upcoming ?? visitSchedules[visitSchedules.length - 1];
    }, [visitSchedules]);

    const persistVisitSchedules = (nextItems: VisitScheduleItem[]) => {
        const normalized = [...nextItems].sort((a, b) => {
            const aKey = `${a.visitDate} ${a.visitTime}`;
            const bKey = `${b.visitDate} ${b.visitTime}`;
            return aKey.localeCompare(bKey);
        });
        setVisitSchedules(normalized);
        localStorage.setItem(getVisitScheduleKey(authUserId), JSON.stringify(normalized));
    };

    const resetVisitForm = () => {
        setVisitDateInput('');
        setVisitTimeInput('');
        setVisitHospitalInput('');
        setVisitTreatmentInput('');
        setVisitPreparationInput('');
    };

    const handleVisitScheduleSave = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedTreatment = visitTreatmentInput.trim();
        const trimmedPreparation = visitPreparationInput.trim();

        if (!visitDateInput || !visitTimeInput || !trimmedTreatment) {
            setVisitFormIsError(true);
            setVisitFormMessage('방문 일자, 시간, 진료 내용을 입력해 주세요.');
            return;
        }

        const nextItem: VisitScheduleItem = {
            id: `visit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            visitDate: visitDateInput,
            visitTime: visitTimeInput,
            hospitalName: visitHospitalInput.trim(),
            treatmentNote: trimmedTreatment,
            preparationNote: trimmedPreparation,
            createdAt: new Date().toISOString(),
        };

        persistVisitSchedules([...visitSchedules, nextItem]);
        setVisitFormIsError(false);
        setVisitFormMessage('진료 일정이 저장되었어요.');
        resetVisitForm();
    };

    const handleVisitScheduleDelete = (targetId: string) => {
        persistVisitSchedules(visitSchedules.filter((item) => item.id !== targetId));
    };

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

            <section className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                aria-hidden="true"
                            >
                                <CalendarClock className="h-4 w-4" />
                            </span>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">다음 병원 방문/진료 일정</h2>
                            <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                총 {visitSchedules.length}건
                            </span>
                        </div>
                        <p className="mt-1 truncate pl-10 text-sm text-gray-600 dark:text-gray-300">
                            {upcomingVisit
                                ? `${formatVisitScheduleDate(upcomingVisit.visitDate)} ${formatVisitScheduleTime(upcomingVisit.visitTime)} · ${
                                      upcomingVisit.hospitalName ? `${upcomingVisit.hospitalName} · ` : ''
                                  }${upcomingVisit.treatmentNote}`
                                : '다음 병원 방문 일정을 등록해 주세요.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setShowVisitScheduleModal(true);
                            setVisitFormMessage('');
                            setVisitFormIsError(false);
                        }}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                    >
                        일정 입력/보기
                    </button>
                </div>
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
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{customAlertSummary}</p>
                    <span className="rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                        {customAlertUpdatedAt ? formatAlertUpdatedAgo(customAlertUpdatedAt) : '업데이트 시간 미확인'}
                    </span>
                </div>

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
                                        {alertItem.source} · {formatAlertDate(alertItem.publishedAt)} · {formatAlertUpdatedAgo(alertItem.publishedAt)}
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

            {showVisitScheduleModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => {
                        setShowVisitScheduleModal(false);
                        setVisitFormMessage('');
                    }}
                >
                    <section
                        className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">다음 병원 방문/진료 일정</h3>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                    방문 일정은 여러 건 저장되며, 카드 형태로 계속 누적됩니다.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowVisitScheduleModal(false);
                                    setVisitFormMessage('');
                                }}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                닫기
                            </button>
                        </div>

                        <form onSubmit={handleVisitScheduleSave} className="mt-4 grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">방문 일자</span>
                                <input
                                    type="date"
                                    value={visitDateInput}
                                    onChange={(event) => setVisitDateInput(event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200 dark:focus:ring-gray-700"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">방문 시간</span>
                                <input
                                    type="time"
                                    value={visitTimeInput}
                                    onChange={(event) => setVisitTimeInput(event.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200 dark:focus:ring-gray-700"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-2">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">병원 이름(선택)</span>
                                <input
                                    type="text"
                                    value={visitHospitalInput}
                                    onChange={(event) => setVisitHospitalInput(event.target.value)}
                                    placeholder="예: 서울아산병원"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200 dark:focus:ring-gray-700"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-2">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">진료 내용</span>
                                <input
                                    type="text"
                                    value={visitTreatmentInput}
                                    onChange={(event) => setVisitTreatmentInput(event.target.value)}
                                    placeholder="예: 항암 부작용 추적 진료"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200 dark:focus:ring-gray-700"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-2">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">준비사항</span>
                                <textarea
                                    value={visitPreparationInput}
                                    onChange={(event) => setVisitPreparationInput(event.target.value)}
                                    rows={2}
                                    placeholder="예: 최근 검사 결과지, 복용 약 목록 지참"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:border-gray-200 dark:focus:ring-gray-700"
                                />
                            </label>
                            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="submit"
                                    className="rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                                >
                                    일정 저장
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        resetVisitForm();
                                        setVisitFormMessage('');
                                    }}
                                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    입력 초기화
                                </button>
                                {visitFormMessage && (
                                    <p
                                        className={`text-sm font-semibold ${
                                            visitFormIsError
                                                ? 'text-rose-600 dark:text-rose-300'
                                                : 'text-emerald-600 dark:text-emerald-300'
                                        }`}
                                    >
                                        {visitFormMessage}
                                    </p>
                                )}
                            </div>
                        </form>

                        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-800">
                                <Stethoscope className="h-4 w-4 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">등록된 진료 카드</h4>
                            </div>
                            {visitSchedules.length === 0 ? (
                                <p className="px-3 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    아직 저장된 일정이 없어요. 위 입력값을 작성해 첫 일정을 등록해 주세요.
                                </p>
                            ) : (
                                <div className="max-h-[40vh] divide-y divide-gray-200 overflow-y-auto dark:divide-gray-800">
                                    {visitSchedules.map((item) => (
                                        <article key={item.id} className="px-3 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                        {formatVisitScheduleDate(item.visitDate)} ·{' '}
                                                        {formatVisitScheduleTime(item.visitTime)}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                        병원: {item.hospitalName || '미입력'}
                                                    </p>
                                                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{item.treatmentNote}</p>
                                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                        준비사항: {item.preparationNote || '없음'}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleVisitScheduleDelete(item.id)}
                                                    className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </main>
    );
}
