'use client';

import Link from 'next/link';
import { CalendarClock, ChevronDown, ChevronRight, MapPinned, Newspaper, Plus, ShoppingCart, Stethoscope, UserRound } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import AuthActionButton from '@/components/AuthActionButton';
import ThemeToggle from '@/components/ThemeToggle';
import { filterAlertArticles, parseArticleDate, type AlertArticle as CustomAlertArticle } from '@/lib/alertArticles';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type TreatmentMeta = {
    cancerType: string;
    cancerStage: string;
    updatedAt: string;
};

type CustomAlertCache = {
    items: CustomAlertArticle[];
    updatedAt: string;
    partial?: boolean;
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

const ALERT_PAGE_SIZE = 5;
const ALERT_CACHE_PREFIX = 'custom-alert-cache-v2';
const ALERT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
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
        if (typeof parsed.cancerType !== 'string' || !parsed.cancerType.trim()) {
            return null;
        }

        return {
            cancerType: parsed.cancerType.trim(),
            cancerStage: typeof parsed.cancerStage === 'string' ? parsed.cancerStage : '',
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
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

function parseAlertDate(raw: string) {
    const timestamp = parseArticleDate(raw);
    return timestamp === null ? null : new Date(timestamp);
}

function formatAlertDate(raw: string) {
    const date = parseAlertDate(raw);
    return date ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(date) : '';
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
            items: filterAlertArticles(items),
            partial: parsed.partial === true,
        };
    } catch {
        return null;
    }
}

function getVisitScheduleKey(userId: string | null) {
    return `${VISIT_SCHEDULE_PREFIX}:${userId ?? 'guest'}`;
}

function normalizeVisitScheduleList(items: VisitScheduleItem[]) {
    return [...items]
        .map((item) => ({
            ...item,
            hospitalName: item.hospitalName?.trim() ?? '',
        }))
        .sort((a, b) => {
            const aKey = `${a.visitDate} ${a.visitTime}`;
            const bKey = `${b.visitDate} ${b.visitTime}`;
            return aKey.localeCompare(bKey);
        });
}

function visitScheduleTimestamp(raw: string) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function mergeVisitScheduleLists(...lists: VisitScheduleItem[][]) {
    const byId = new Map<string, VisitScheduleItem>();

    lists.forEach((list) => {
        list.forEach((item) => {
            const current = byId.get(item.id);
            if (!current) {
                byId.set(item.id, item);
                return;
            }

            if (visitScheduleTimestamp(item.createdAt) >= visitScheduleTimestamp(current.createdAt)) {
                byId.set(item.id, item);
            }
        });
    });

    return normalizeVisitScheduleList(Array.from(byId.values()));
}

function areVisitScheduleListsSame(left: VisitScheduleItem[], right: VisitScheduleItem[]) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((item, index) => {
        const compare = right[index];
        return (
            item.id === compare.id &&
            item.visitDate === compare.visitDate &&
            item.visitTime === compare.visitTime &&
            item.hospitalName === compare.hospitalName &&
            item.treatmentNote === compare.treatmentNote &&
            item.preparationNote === compare.preparationNote &&
            item.createdAt === compare.createdAt
        );
    });
}

function parseVisitScheduleListFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as VisitScheduleItem[];
    }

    const readString = (record: Record<string, unknown>, keys: string[]) => {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    return trimmed;
                }
            }
        }
        return '';
    };

    const parsed = raw
        .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return null;
            }

            const candidate = item as Record<string, unknown>;
            const visitDate = readString(candidate, ['visitDate', 'date', 'appointmentDate']);
            if (!visitDate) {
                return null;
            }

            const visitTime = readString(candidate, ['visitTime', 'time', 'appointmentTime']);
            const treatmentNote = readString(candidate, ['treatmentNote', 'treatment', 'note']);
            if (!treatmentNote) {
                return null;
            }

            const hospitalName = readString(candidate, ['hospitalName', 'hospital']);
            const preparationNote = readString(candidate, ['preparationNote', 'preparation']);
            const createdAtRaw = readString(candidate, ['createdAt', 'updatedAt', 'timestamp']);
            const createdAt =
                createdAtRaw && Number.isFinite(Date.parse(createdAtRaw))
                    ? createdAtRaw
                    : `${visitDate}T${visitTime || '00:00'}:00`;
            const idRaw = readString(candidate, ['id', 'visitId']);
            const fallbackIdBase = `${visitDate}-${visitTime || 'na'}-${treatmentNote}`
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-');
            const id = idRaw || `visit-legacy-${index}-${fallbackIdBase}`;

            return {
                id,
                visitDate,
                visitTime,
                hospitalName,
                treatmentNote,
                preparationNote,
                createdAt,
            } satisfies VisitScheduleItem;
        })
        .filter((item): item is VisitScheduleItem => item !== null);

    return normalizeVisitScheduleList(parsed);
}

function parseVisitScheduleList(raw: string | null) {
    if (!raw) {
        return [] as VisitScheduleItem[];
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        return parseVisitScheduleListFromUnknown(parsed);
    } catch {
        return [] as VisitScheduleItem[];
    }
}

function readIamfineVisitSchedules(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return [] as VisitScheduleItem[];
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return [] as VisitScheduleItem[];
    }

    const scoped = namespaced as Record<string, unknown>;
    return parseVisitScheduleListFromUnknown(scoped.visitSchedules);
}

function buildUpdatedUserMetadata(
    raw: unknown,
    visitSchedules: VisitScheduleItem[],
    treatmentMeta?: TreatmentMeta | null
) {
    const root =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
    const namespaced = root[USER_METADATA_NAMESPACE];
    const scoped =
        namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)
            ? { ...(namespaced as Record<string, unknown>) }
            : {};

    scoped.visitSchedules = visitSchedules;
    if (treatmentMeta) {
        scoped.treatmentMeta = treatmentMeta;
    }
    root[USER_METADATA_NAMESPACE] = scoped;
    return root;
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

function formatVisitScheduleDday(rawDate: string) {
    if (!rawDate) {
        return '';
    }

    const [year, month, day] = rawDate.split('-').map(Number);
    if (!year || !month || !day) {
        return '';
    }

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const targetDate = new Date(year, month - 1, day);
    const diffDays = Math.round((targetDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return `D-${diffDays}`;
    }
    if (diffDays === 0) {
        return 'D-Day';
    }
    return `D+${Math.abs(diffDays)}`;
}

export default function MorePage() {
    const [newsExpanded, setNewsExpanded] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [alertContextReady, setAlertContextReady] = useState(false);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [customAlertItems, setCustomAlertItems] = useState<CustomAlertArticle[]>([]);
    const [customAlertUpdatedAt, setCustomAlertUpdatedAt] = useState('');
    const [customAlertLoading, setCustomAlertLoading] = useState(false);
    const [visibleAlertCount, setVisibleAlertCount] = useState(ALERT_PAGE_SIZE);
    const [customAlertError, setCustomAlertError] = useState('');
    const [customAlertPartial, setCustomAlertPartial] = useState(false);
    const [alertRetry, setAlertRetry] = useState(0);
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [visitSchedules, setVisitSchedules] = useState<VisitScheduleItem[]>([]);
    const [visitScheduleExpanded, setVisitScheduleExpanded] = useState(false);
    const [showVisitScheduleForm, setShowVisitScheduleForm] = useState(false);
    const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
    const [visitDateInput, setVisitDateInput] = useState('');
    const [visitTimeInput, setVisitTimeInput] = useState('');
    const [visitHospitalInput, setVisitHospitalInput] = useState('');
    const [visitTreatmentInput, setVisitTreatmentInput] = useState('');
    const [visitPreparationInput, setVisitPreparationInput] = useState('');
    const [visitFormMessage, setVisitFormMessage] = useState('');
    const [visitFormIsError, setVisitFormIsError] = useState(false);
    const [visitScheduleSaving, setVisitScheduleSaving] = useState(false);

    const resolvedCancerType = treatmentMeta?.cancerType?.trim() ?? '';
    const customAlertSummary =
        isLoggedIn && resolvedCancerType
            ? `${resolvedCancerType} 관련 소식과 공통 건강 정보`
            : '암종 공통 건강 소식';

    useEffect(() => {
        let cancelled = false;

        const loadAlertContext = async () => {
            if (!hasSupabaseEnv || !supabase) {
                if (!cancelled) {
                    setIsLoggedIn(false);
                    setTreatmentMeta(null);
                    setAuthUserId(null);
                    setAlertContextReady(true);
                }
                return;
            }

            const { user, error: userError } = await getAuthSessionUser();
            if (userError || !user || cancelled) {
                if (!cancelled) {
                    setIsLoggedIn(false);
                    setTreatmentMeta(null);
                    setAuthUserId(null);
                    setAlertContextReady(true);
                }
                return;
            }

            const uid = user.id;
            setIsLoggedIn(true);
            setAuthUserId(uid);
            const metadataMeta = readIamfineTreatmentMeta(user.user_metadata);
            const localMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
            const meta = metadataMeta ?? localMeta;
            const visitStorageKey = getVisitScheduleKey(uid);
            const metadataVisitSchedules = readIamfineVisitSchedules(user.user_metadata);
            const localVisitSchedules = parseVisitScheduleList(localStorage.getItem(visitStorageKey));
            const resolvedVisitSchedules = mergeVisitScheduleLists(metadataVisitSchedules, localVisitSchedules);
            if (!cancelled) {
                setTreatmentMeta(meta);
                setVisitSchedules(resolvedVisitSchedules);
            }
            if (!localMeta && meta) {
                localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(meta));
            }
            if (!areVisitScheduleListsSame(localVisitSchedules, resolvedVisitSchedules)) {
                localStorage.setItem(visitStorageKey, JSON.stringify(resolvedVisitSchedules));
            }
            const shouldSyncVisitSchedules = !areVisitScheduleListsSame(metadataVisitSchedules, resolvedVisitSchedules);
            const shouldSyncTreatmentMeta = !metadataMeta && Boolean(localMeta && meta);
            if (shouldSyncVisitSchedules || shouldSyncTreatmentMeta) {
                const updatedMetadata = buildUpdatedUserMetadata(
                    user.user_metadata,
                    shouldSyncVisitSchedules ? resolvedVisitSchedules : metadataVisitSchedules,
                    shouldSyncTreatmentMeta ? meta : null
                );
                const { error: syncError } = await supabase.auth.updateUser({
                    data: updatedMetadata,
                });
                if (syncError) {
                    console.error('진료 일정 메타데이터 동기화 실패', syncError);
                }
            }

            if (!cancelled) {
                setAlertContextReady(true);
            }
        };

        void loadAlertContext();
        const subscription = supabase?.auth.onAuthStateChange((event) => {
            if (event !== 'SIGNED_OUT') return;
            // The header signs out in place, so remove the previous patient's data immediately.
            cancelled = true;
            setIsLoggedIn(false);
            setAuthUserId(null);
            setTreatmentMeta(null);
            setVisitSchedules([]);
            setVisitScheduleExpanded(false);
            setShowVisitScheduleForm(false);
            setEditingVisitId(null);
            setVisitDateInput('');
            setVisitTimeInput('');
            setVisitHospitalInput('');
            setVisitTreatmentInput('');
            setVisitPreparationInput('');
            setVisitFormMessage('');
            setNewsExpanded(false);
            setCustomAlertLoading(false);
            setCustomAlertItems([]);
            setCustomAlertUpdatedAt('');
            setCustomAlertError('');
            setCustomAlertPartial(false);
            setAlertContextReady(true);
        }).data.subscription;

        return () => {
            cancelled = true;
            subscription?.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!alertContextReady) {
            return;
        }

        if (isLoggedIn) {
            return;
        }

        const key = getVisitScheduleKey(authUserId);
        setVisitSchedules(parseVisitScheduleList(localStorage.getItem(key)));
    }, [alertContextReady, authUserId, isLoggedIn]);

    useEffect(() => {
        if (!alertContextReady || !newsExpanded) {
            return;
        }

        let cancelled = false;

        const loadCustomAlerts = async () => {
            setCustomAlertLoading(true);
            setCustomAlertError('');
            setCustomAlertPartial(false);
            setVisibleAlertCount(ALERT_PAGE_SIZE);
            const params = new URLSearchParams();
            if (isLoggedIn && resolvedCancerType) {
                params.set('cancerType', resolvedCancerType);
            } else {
                params.set('mode', 'general');
            }
            const cacheKey = buildCustomAlertCacheKey(params);
            let cached: CustomAlertCache | null = null;
            try {
                cached = parseCustomAlertCache(sessionStorage.getItem(cacheKey));
            } catch {
                // News remains usable when browser storage is unavailable.
            }
            const cachedUpdatedMs = cached ? Date.parse(cached.updatedAt) : Number.NaN;
            const isCacheFresh =
                cached !== null &&
                Number.isFinite(cachedUpdatedMs) &&
                cachedUpdatedMs <= Date.now() &&
                Date.now() - cachedUpdatedMs < ALERT_CACHE_TTL_MS;

            if (isCacheFresh && cached && alertRetry === 0) {
                if (!cancelled) {
                    setCustomAlertItems(cached.items);
                    setCustomAlertUpdatedAt(cached.updatedAt);
                    setCustomAlertPartial(cached.partial === true);
                    setCustomAlertLoading(false);
                }
                return;
            }

            try {
                const response = await fetch(`/api/custom-alerts?${params.toString()}`);
                if (!response.ok) throw new Error('Alert sources unavailable');
                const payload = (await response.json()) as {
                    items?: CustomAlertArticle[];
                    updatedAt?: string;
                    partial?: boolean;
                };
                const nextItems = Array.isArray(payload.items) ? payload.items : [];
                const orderedNextItems = filterAlertArticles(nextItems);
                const nextUpdatedAt =
                    typeof payload.updatedAt === 'string' && payload.updatedAt
                        ? payload.updatedAt
                        : new Date().toISOString();

                if (!cancelled) {
                    setCustomAlertItems(orderedNextItems);
                    setCustomAlertUpdatedAt(nextUpdatedAt);
                    setCustomAlertPartial(payload.partial === true);
                }

                try {
                    sessionStorage.setItem(cacheKey, JSON.stringify({
                        items: orderedNextItems,
                        updatedAt: nextUpdatedAt,
                        partial: payload.partial === true,
                    } satisfies CustomAlertCache));
                } catch {
                    // A storage failure does not turn a successful news fetch into an error.
                }
            } catch {
                if (!cancelled) {
                    setCustomAlertError(cached?.items.length
                        ? '최신 소식을 불러오지 못해 저장된 소식을 보여드려요.'
                        : '소식을 불러오지 못했어요. 다시 시도해 주세요.');
                    if (cached) {
                        setCustomAlertItems(filterAlertArticles(cached.items));
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
    }, [alertContextReady, isLoggedIn, resolvedCancerType, alertRetry, newsExpanded]);

    const visibleCustomAlerts = customAlertItems.slice(0, visibleAlertCount);

    const upcomingVisit = useMemo(() => {
        if (visitSchedules.length === 0) {
            return null;
        }

        const now = Date.now();
        const upcoming = visitSchedules.find((item) => {
            const parsed = Date.parse(`${item.visitDate}T${item.visitTime || '00:00'}:00`);
            return Number.isFinite(parsed) && parsed >= now;
        });
        return upcoming ?? null;
    }, [visitSchedules]);

    const syncVisitSchedulesToMetadata = async (nextItems: VisitScheduleItem[]) => {
        if (!isLoggedIn || !supabase) {
            return true;
        }

        const { user, error: userError } = await getAuthSessionUser();
        if (userError || !user) {
            console.error('진료 일정 메타데이터 저장 실패(사용자 세션)', userError);
            return false;
        }

        const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, nextItems);
        const { error: updateError } = await supabase.auth.updateUser({
            data: updatedMetadata,
        });
        if (updateError) {
            console.error('진료 일정 메타데이터 저장 실패', updateError);
            return false;
        }

        return true;
    };

    const persistVisitSchedules = async (
        nextItemsOrUpdater: VisitScheduleItem[] | ((current: VisitScheduleItem[]) => VisitScheduleItem[])
    ) => {
        const nextItems = typeof nextItemsOrUpdater === 'function'
            ? nextItemsOrUpdater(visitSchedules)
            : nextItemsOrUpdater;
        const normalized = normalizeVisitScheduleList(nextItems);
        setVisitSchedules(normalized);
        try {
            localStorage.setItem(getVisitScheduleKey(authUserId), JSON.stringify(normalized));
        } catch (storageError) {
            console.error('진료 일정 로컬 저장 실패', storageError);
        }

        return await syncVisitSchedulesToMetadata(normalized);
    };

    const resetVisitForm = () => {
        setVisitDateInput('');
        setVisitTimeInput('');
        setVisitHospitalInput('');
        setVisitTreatmentInput('');
        setVisitPreparationInput('');
        setEditingVisitId(null);
    };

    const handleVisitScheduleEdit = (item: VisitScheduleItem) => {
        if (visitScheduleSaving) {
            return;
        }

        setEditingVisitId(item.id);
        setVisitDateInput(item.visitDate);
        setVisitTimeInput(item.visitTime);
        setVisitHospitalInput(item.hospitalName);
        setVisitTreatmentInput(item.treatmentNote);
        setVisitPreparationInput(item.preparationNote);
        setShowVisitScheduleForm(true);
        setVisitFormIsError(false);
        setVisitFormMessage('수정할 내용을 변경한 뒤 저장해 주세요.');
    };

    const handleVisitScheduleSave = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (visitScheduleSaving) {
            return;
        }
        const trimmedTreatment = visitTreatmentInput.trim();
        const trimmedPreparation = visitPreparationInput.trim();

        if (!visitDateInput || !visitTimeInput || !trimmedTreatment) {
            setVisitFormIsError(true);
            setVisitFormMessage('방문 일자, 시간, 진료 내용을 입력해 주세요.');
            return;
        }

        setVisitScheduleSaving(true);
        const synced = editingVisitId
            ? await persistVisitSchedules((current) =>
                  current.map((item) =>
                      item.id === editingVisitId
                          ? {
                                ...item,
                                visitDate: visitDateInput,
                                visitTime: visitTimeInput,
                                hospitalName: visitHospitalInput.trim(),
                                treatmentNote: trimmedTreatment,
                                preparationNote: trimmedPreparation,
                            }
                          : item
                  )
              )
            : await persistVisitSchedules((current) => [
                  ...current,
                  {
                      id: `visit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                      visitDate: visitDateInput,
                      visitTime: visitTimeInput,
                      hospitalName: visitHospitalInput.trim(),
                      treatmentNote: trimmedTreatment,
                      preparationNote: trimmedPreparation,
                      createdAt: new Date().toISOString(),
                  },
              ]);
        setVisitScheduleSaving(false);
        if (synced) {
            setVisitFormIsError(false);
            setVisitFormMessage(editingVisitId ? '진료 일정이 수정되었어요.' : '진료 일정이 저장되었어요.');
        } else {
            setVisitFormIsError(true);
            setVisitFormMessage(
                editingVisitId
                    ? '기기에는 수정됐지만 계정 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.'
                    : '기기에는 저장됐지만 계정 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.'
            );
        }
        resetVisitForm();
    };

    const handleVisitScheduleDelete = async (targetId: string) => {
        if (visitScheduleSaving) {
            return;
        }

        setVisitScheduleSaving(true);
        const synced = await persistVisitSchedules((current) => current.filter((item) => item.id !== targetId));
        setVisitScheduleSaving(false);
        if (editingVisitId === targetId) {
            resetVisitForm();
            setShowVisitScheduleForm(false);
        }
        if (synced) {
            setVisitFormIsError(false);
            setVisitFormMessage('선택한 일정을 삭제했어요.');
        } else {
            setVisitFormIsError(true);
            setVisitFormMessage('삭제는 반영됐지만 계정 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
    };

    return (
        <div className="mx-auto max-w-2xl space-y-6 py-3 sm:py-6">
            <header className="uiPageHeader">
                <h1>더보기</h1>
                <p>내 정보와 필요한 도구를 모았어요.</p>
            </header>

            <nav aria-label="추가 기능" className="uiCard overflow-hidden">
                {[
                    { href: '/profile', label: '내 정보', Icon: UserRound },
                    { href: '/shopping', label: '장보기', Icon: ShoppingCart },
                    { href: '/restaurants', label: '건강식당', Icon: MapPinned },
                    { href: '/treatment', label: '치료 일정', Icon: Stethoscope },
                ].map(({ href, label, Icon }, index) => (
                    <Link
                        key={href}
                        href={href}
                        className={`flex min-h-[72px] items-center gap-4 px-5 py-4 transition hover:bg-[var(--ui-surface-muted)] ${index ? 'border-t border-[var(--ui-border)]' : ''}`}
                    >
                        <Icon className="h-5 w-5 shrink-0 text-[var(--ui-accent)]" aria-hidden="true" />
                        <span className="flex-1 text-base font-semibold leading-normal">{label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ui-muted)]" aria-hidden="true" />
                    </Link>
                ))}
            </nav>

            <div className="space-y-3">
                <details
                    className="uiCard group overflow-hidden"
                    open={visitScheduleExpanded}
                    onToggle={(event) => setVisitScheduleExpanded(event.currentTarget.open)}
                >
                    <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                        <CalendarClock className="h-5 w-5 shrink-0 text-[var(--ui-accent)]" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold leading-normal">진료 일정</span>
                            <span className="mt-1 block text-sm leading-relaxed text-[var(--ui-muted)]">
                                {upcomingVisit
                                    ? `${formatVisitScheduleDate(upcomingVisit.visitDate)} · ${upcomingVisit.hospitalName || '예정된 진료'}`
                                    : '다가오는 진료를 기억해요'}
                            </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ui-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="border-t border-[var(--ui-border)] px-5 pb-5 pt-4">
                        {visitSchedules.length === 0 ? (
                            <p className="uiEmptyState">저장된 진료 일정이 없어요.</p>
                        ) : (
                            <div className="divide-y divide-[var(--ui-border)]">
                                {visitSchedules.map((item) => (
                                    <article key={item.id} className="space-y-3 py-4 first:pt-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-base font-semibold leading-relaxed">
                                                {formatVisitScheduleDate(item.visitDate)} · {formatVisitScheduleTime(item.visitTime)}
                                            </p>
                                            <span className="uiBadge">{formatVisitScheduleDday(item.visitDate)}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {item.hospitalName && <p className="text-sm font-medium">{item.hospitalName}</p>}
                                            <p className="break-words text-sm leading-relaxed text-[var(--ui-muted)]">{item.treatmentNote}</p>
                                            {item.preparationNote && <p className="break-words text-sm leading-relaxed text-[var(--ui-muted)]">준비: {item.preparationNote}</p>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button type="button" onClick={() => handleVisitScheduleEdit(item)} disabled={visitScheduleSaving} className="uiButton uiButton--secondary uiButton--small">수정</button>
                                            <button type="button" onClick={() => void handleVisitScheduleDelete(item.id)} disabled={visitScheduleSaving} className="uiButton uiButton--ghost uiButton--small">삭제</button>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                if (showVisitScheduleForm) {
                                    setShowVisitScheduleForm(false);
                                    resetVisitForm();
                                } else {
                                    setShowVisitScheduleForm(true);
                                }
                                setVisitFormMessage('');
                                setVisitFormIsError(false);
                            }}
                            aria-expanded={showVisitScheduleForm}
                            aria-controls="visit-schedule-form"
                            className="uiButton uiButton--secondary mt-3 w-full"
                        >
                            {!showVisitScheduleForm && <Plus className="h-4 w-4" aria-hidden="true" />}
                            {showVisitScheduleForm ? '입력 닫기' : '진료 일정 추가'}
                        </button>

                        {visitFormMessage && (
                            <p role="status" className={`mt-3 text-sm leading-relaxed ${visitFormIsError ? 'text-rose-700 dark:text-rose-300' : 'text-[var(--ui-accent)]'}`}>
                                {visitFormMessage}
                            </p>
                        )}

                        {showVisitScheduleForm && (
                            <form id="visit-schedule-form" onSubmit={handleVisitScheduleSave} className="mt-5 grid gap-4 sm:grid-cols-2">
                                <label className="min-w-0 space-y-2">
                                    <span className="block text-sm font-semibold">방문 날짜</span>
                                    <input type="date" required aria-label="방문 날짜" enterKeyHint="next" value={visitDateInput} onChange={(event) => setVisitDateInput(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="min-w-0 space-y-2">
                                    <span className="block text-sm font-semibold">방문 시간</span>
                                    <input type="time" required aria-label="방문 시간" enterKeyHint="next" value={visitTimeInput} onChange={(event) => setVisitTimeInput(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">병원 이름 <span className="font-normal text-[var(--ui-muted)]">(선택)</span></span>
                                    <input type="text" aria-label="병원 이름" autoComplete="organization" enterKeyHint="next" value={visitHospitalInput} onChange={(event) => setVisitHospitalInput(event.target.value)} placeholder="예: 강북삼성병원" className="min-h-12 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">진료 내용</span>
                                    <input type="text" required aria-label="진료 내용" enterKeyHint="next" maxLength={120} value={visitTreatmentInput} onChange={(event) => setVisitTreatmentInput(event.target.value)} placeholder="예: 정기 검사, 외래 진료" className="min-h-12 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">준비사항 <span className="font-normal text-[var(--ui-muted)]">(선택)</span></span>
                                    <textarea aria-label="준비사항" enterKeyHint="done" maxLength={300} value={visitPreparationInput} onChange={(event) => setVisitPreparationInput(event.target.value)} rows={2} placeholder="예: 검사 결과지, 복용 약 목록" className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-3 text-base" />
                                </label>
                                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                                    <button type="submit" disabled={visitScheduleSaving} className="uiButton uiButton--primary flex-1">{visitScheduleSaving ? '저장 중…' : editingVisitId ? '수정 저장' : '일정 저장'}</button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            resetVisitForm();
                                            setShowVisitScheduleForm(false);
                                            setVisitFormMessage('');
                                            setVisitFormIsError(false);
                                        }}
                                        disabled={visitScheduleSaving}
                                        className="uiButton uiButton--ghost"
                                    >
                                        취소
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </details>

                <details className="uiCard group overflow-hidden" open={newsExpanded} onToggle={(event) => setNewsExpanded(event.currentTarget.open)}>
                    <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                        <Newspaper className="h-5 w-5 shrink-0 text-[var(--ui-accent)]" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold leading-normal">건강 소식</span>
                            <span className="mt-1 block text-sm leading-relaxed text-[var(--ui-muted)]">암센터·병원 소식과 최근 기사</span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ui-muted)] transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <section className="border-t border-[var(--ui-border)] px-5 pb-5 pt-4" aria-label="맞춤 건강 소식">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="flex-1 text-sm leading-relaxed text-[var(--ui-muted)]">{customAlertSummary}</p>
                            <span className="uiBadge">최근 2개월</span>
                        </div>
                        {isLoggedIn && !treatmentMeta && <Link href="/profile" className="uiButton uiButton--ghost uiButton--small mt-2">내 정보로 소식 맞추기</Link>}
                        {(customAlertLoading || !alertContextReady) && <p role="status" className="uiEmptyState">새 소식을 불러오고 있어요…</p>}
                        {!customAlertLoading && customAlertError && (
                            <div className="mt-4 rounded-xl bg-[var(--ui-surface-muted)] p-4" role="status">
                                <p className="text-sm leading-relaxed text-[var(--ui-muted)]">{customAlertError}</p>
                                <button type="button" onClick={() => setAlertRetry((value) => value + 1)} className="uiButton uiButton--secondary uiButton--small mt-3">다시 불러오기</button>
                            </div>
                        )}
                        {alertContextReady && !customAlertLoading && !customAlertError && customAlertItems.length === 0 && <p className="uiEmptyState">최근 2개월 안에 등록된 관련 소식이 아직 없어요.</p>}
                        {!customAlertLoading && customAlertItems.length > 0 && (
                            <>
                                <ul className="mt-2 divide-y divide-[var(--ui-border)]">
                                    {visibleCustomAlerts.map((alertItem) => (
                                        <li key={alertItem.url}>
                                            <a href={alertItem.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg py-4 transition hover:bg-[var(--ui-surface-muted)]">
                                                <p className="break-words text-base font-semibold leading-relaxed">{alertItem.title}<span className="sr-only"> (새 창)</span></p>
                                                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--ui-muted)]">
                                                    {alertItem.kind === 'official' && <span className="font-medium text-[var(--ui-accent)]">기관 소식</span>}
                                                    <span>{alertItem.source}</span>
                                                    <span aria-hidden="true">·</span>
                                                    <time dateTime={alertItem.publishedAt}>{formatAlertDate(alertItem.publishedAt)}</time>
                                                </p>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                                {visibleAlertCount < customAlertItems.length && <button type="button" onClick={() => setVisibleAlertCount((value) => value + ALERT_PAGE_SIZE)} className="uiButton uiButton--secondary mt-2 w-full">소식 더 보기</button>}
                            </>
                        )}
                        {!customAlertLoading && customAlertPartial && !customAlertError && <p className="mt-3 text-sm leading-relaxed text-[var(--ui-muted)]">일부 출처에 연결되지 않아 확인된 소식만 보여드려요.</p>}
                        {!customAlertLoading && customAlertUpdatedAt && <p className="mt-3 text-xs leading-relaxed text-[var(--ui-muted)]">{formatAlertUpdatedAgo(customAlertUpdatedAt)} · 같은 소식은 한 번만</p>}
                    </section>
                </details>
            </div>

            <section aria-labelledby="more-settings-heading" className="space-y-3">
                <h2 id="more-settings-heading" className="px-1 text-sm font-medium text-[var(--ui-muted)]">화면과 계정</h2>
                <div className="uiCard moreSettings overflow-hidden">
                    <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 px-5 py-4">
                        <span className="text-base font-medium">화면 모드</span>
                        <ThemeToggle />
                    </div>
                    <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-t border-[var(--ui-border)] px-5 py-4">
                        <span className="text-base font-medium">계정</span>
                        <AuthActionButton showSignUpWhenLoggedOut />
                    </div>
                </div>
            </section>
        </div>
    );
}
