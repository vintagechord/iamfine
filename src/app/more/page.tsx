'use client';

import Link from 'next/link';
import { CalendarClock, ChevronDown, ChevronRight, MapPinned, Plus, ShoppingCart, Stethoscope, UserRound } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthActionButton from '@/components/AuthActionButton';
import ThemeToggle from '@/components/ThemeToggle';
import HealthNewsFeed from '@/components/HealthNewsFeed';
import { getAuthSessionUser, hasSupabaseEnv, supabase, updateUserMetadataForSession } from '@/lib/supabaseClient';
import {
    areVisitScheduleListsSame,
    formatVisitScheduleDate,
    formatVisitScheduleDday,
    formatVisitScheduleTime,
    getUpcomingVisit,
    getVisitScheduleKey,
    hasSavedVisitSchedules,
    resolveVisitSchedules,
    normalizeVisitScheduleList,
    parseVisitScheduleList,
    type VisitScheduleItem,
} from '@/lib/visitSchedules';

type TreatmentMeta = {
    cancerType: string;
    cancerStage: string;
    updatedAt: string;
};

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

type VisitAccount = { userId: string | null; revision: number };

function isMissingAuthSession(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { name?: string; message?: string };
    return candidate.name === 'AuthSessionMissingError' || /auth session missing/i.test(candidate.message ?? '');
}

function readLocalValue(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocalValue(key: string, value: string) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export default function MorePage() {
    const [visitContextReady, setVisitContextReady] = useState(false);
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
    const accountRef = useRef<{ userId: string | null | undefined; revision: number; ready: boolean; mounted: boolean }>({
        userId: undefined, revision: 0, ready: false, mounted: false,
    });
    const changeAccountRef = useRef<(userId: string | null) => void>(() => {});
    const refreshContextRef = useRef<() => void>(() => {});

    const isCurrentAccount = useCallback((account: VisitAccount) => {
        const current = accountRef.current;
        return current.mounted && current.userId === account.userId && current.revision === account.revision;
    }, []);

    const syncVisitSchedulesToMetadata = useCallback(async (
        nextItems: VisitScheduleItem[],
        account: VisitAccount,
        migration?: { treatmentMeta: TreatmentMeta | null }
    ): Promise<{ items: VisitScheduleItem[] } | false | null> => {
        if (!isCurrentAccount(account)) return null;
        if (!account.userId || !supabase) return false;
        try {
            const { user, error } = await getAuthSessionUser();
            if (!isCurrentAccount(account)) return null;
            if (error && !isMissingAuthSession(error)) return false;
            if (!user || user.id !== account.userId) {
                changeAccountRef.current(user?.id ?? null);
                return null;
            }
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (!isCurrentAccount(account)) return null;
            if (sessionError && !isMissingAuthSession(sessionError)) return false;
            if (sessionData.session?.user.id !== account.userId) {
                changeAccountRef.current(sessionData.session?.user.id ?? null);
                return null;
            }

            // Existing server arrays, including an empty array after deletion, are authoritative.
            const serverHasVisits = hasSavedVisitSchedules(user.user_metadata);
            const items = migration && serverHasVisits
                ? resolveVisitSchedules(user.user_metadata, [])
                : nextItems;
            const treatmentMeta = migration?.treatmentMeta && !readIamfineTreatmentMeta(user.user_metadata)
                ? migration.treatmentMeta : null;
            if (migration && serverHasVisits && !treatmentMeta) return { items };
            if (!isCurrentAccount(account)) return null;
            const { user: updatedUser, error: updateError } = await updateUserMetadataForSession(
                sessionData.session.access_token,
                buildUpdatedUserMetadata(user.user_metadata, items, treatmentMeta)
            );
            if (!isCurrentAccount(account)) return null;
            if (updateError || !updatedUser) return false;
            if (updatedUser.id !== account.userId) {
                changeAccountRef.current(updatedUser.id);
                return null;
            }
            return { items };
        } catch {
            return isCurrentAccount(account) ? false : null;
        }
    }, [isCurrentAccount]);

    useEffect(() => {
        accountRef.current.mounted = true;
        let reloadTimer: ReturnType<typeof setTimeout> | null = null;

        const beginAccount = (userId: string | null | undefined) => {
            accountRef.current = {
                userId, revision: accountRef.current.revision + 1, ready: false, mounted: true,
            };
            setAuthUserId(userId ?? null);
            setVisitContextReady(false);
            setVisitSchedules([]);
            setShowVisitScheduleForm(false);
            setEditingVisitId(null);
            setVisitDateInput('');
            setVisitTimeInput('');
            setVisitHospitalInput('');
            setVisitTreatmentInput('');
            setVisitPreparationInput('');
            setVisitFormMessage('');
            setVisitFormIsError(false);
            setVisitScheduleSaving(false);
        };

        const loadVisitContext = async () => {
            const revision = accountRef.current.revision;
            try {
                const { user, error } = hasSupabaseEnv && supabase
                    ? await getAuthSessionUser()
                    : { user: null, error: null };
                if (!accountRef.current.mounted || revision !== accountRef.current.revision) return;
                if (error && !isMissingAuthSession(error)) throw error;
                const userId = user?.id ?? null;
                if (accountRef.current.userId !== userId) beginAccount(userId);
                const account = { userId, revision: accountRef.current.revision };
                let resolved = parseVisitScheduleList(readLocalValue(getVisitScheduleKey(userId)));
                if (user) {
                    const metadataMeta = readIamfineTreatmentMeta(user.user_metadata);
                    const localMeta = parseTreatmentMeta(readLocalValue(getTreatmentMetaKey(user.id)));
                    const meta = metadataMeta ?? localMeta;
                    const localVisits = resolved;
                    resolved = resolveVisitSchedules(user.user_metadata, localVisits);
                    const shouldMigrateVisits = !hasSavedVisitSchedules(user.user_metadata) && localVisits.length > 0;
                    const shouldMigrateTreatment = !metadataMeta && Boolean(localMeta);
                    if (shouldMigrateVisits || shouldMigrateTreatment) {
                        const result = await syncVisitSchedulesToMetadata(resolved, account, {
                            treatmentMeta: shouldMigrateTreatment ? meta : null,
                        });
                        if (!isCurrentAccount(account) || result === null) return;
                        if (result === false) {
                            setVisitFormIsError(true);
                            setVisitFormMessage('기존 일정을 계정에 옮기지 못했어요. 일정을 저장할 때 다시 시도할 수 있어요.');
                        } else {
                            resolved = result.items;
                        }
                    }
                    if (!isCurrentAccount(account)) return;
                    if (!localMeta && meta) writeLocalValue(getTreatmentMetaKey(user.id), JSON.stringify(meta));
                    if (!areVisitScheduleListsSame(localVisits, resolved)) {
                        writeLocalValue(getVisitScheduleKey(user.id), JSON.stringify(resolved));
                    }
                }
                if (!isCurrentAccount(account)) return;
                setVisitSchedules(resolved);
                accountRef.current.ready = true;
                setVisitContextReady(true);
            } catch {
                if (!accountRef.current.mounted || revision !== accountRef.current.revision) return;
                accountRef.current.ready = false;
                setVisitContextReady(false);
                setVisitFormIsError(true);
                setVisitFormMessage('진료 일정을 확인하지 못했어요. 다시 불러와 주세요.');
            }
        };

        const queueReload = () => {
            if (reloadTimer) clearTimeout(reloadTimer);
            reloadTimer = setTimeout(() => { void loadVisitContext(); }, 0);
        };
        changeAccountRef.current = (userId) => {
            if (!accountRef.current.mounted) return;
            beginAccount(userId);
            queueReload();
        };
        refreshContextRef.current = () => {
            if (!accountRef.current.mounted) return;
            beginAccount(accountRef.current.userId);
            queueReload();
        };
        queueReload();
        const subscription = supabase?.auth.onAuthStateChange((event, session) => {
            const nextUserId = event === 'SIGNED_OUT' ? null : session?.user.id ?? null;
            if (event === 'SIGNED_OUT' || nextUserId !== accountRef.current.userId) {
                // Clear the previous account synchronously; session reads run outside this callback.
                changeAccountRef.current(nextUserId);
            }
        }).data.subscription;
        return () => {
            accountRef.current.mounted = false;
            accountRef.current.ready = false;
            accountRef.current.revision += 1;
            if (reloadTimer) clearTimeout(reloadTimer);
            subscription?.unsubscribe();
        };
    }, [isCurrentAccount, syncVisitSchedulesToMetadata]);

    useEffect(() => {
        const openLinkedSchedule = () => {
            if (window.location.hash === '#visit-schedules') setVisitScheduleExpanded(true);
        };
        openLinkedSchedule();
        window.addEventListener('hashchange', openLinkedSchedule);
        return () => window.removeEventListener('hashchange', openLinkedSchedule);
    }, []);

    const upcomingVisit = useMemo(() => getUpcomingVisit(visitSchedules), [visitSchedules]);

    const readyAccount = (): VisitAccount | null => {
        const current = accountRef.current;
        if (!visitContextReady || !current.ready || current.userId === undefined || current.userId !== authUserId) return null;
        return { userId: current.userId, revision: current.revision };
    };

    const persistVisitSchedules = async (
        nextItemsOrUpdater: VisitScheduleItem[] | ((current: VisitScheduleItem[]) => VisitScheduleItem[]),
        account: VisitAccount
    ): Promise<boolean | null> => {
        if (!isCurrentAccount(account)) return null;
        const nextItems = typeof nextItemsOrUpdater === 'function'
            ? nextItemsOrUpdater(visitSchedules) : nextItemsOrUpdater;
        const normalized = normalizeVisitScheduleList(nextItems);
        if (account.userId) {
            const result = await syncVisitSchedulesToMetadata(normalized, account);
            if (!isCurrentAccount(account) || result === null) return null;
            if (result === false) return false;
            writeLocalValue(getVisitScheduleKey(account.userId), JSON.stringify(result.items));
            setVisitSchedules(result.items);
        } else {
            if (!writeLocalValue(getVisitScheduleKey(null), JSON.stringify(normalized))) return false;
            setVisitSchedules(normalized);
        }
        window.dispatchEvent(new Event('iamfine:visits-changed'));
        return true;
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
        if (visitScheduleSaving || !readyAccount()) return;
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
        const account = readyAccount();
        if (visitScheduleSaving || !account) return;
        const trimmedTreatment = visitTreatmentInput.trim();
        const trimmedPreparation = visitPreparationInput.trim();
        if (!visitDateInput || !visitTimeInput || !trimmedTreatment) {
            setVisitFormIsError(true);
            setVisitFormMessage('방문 일자, 시간, 진료 내용을 입력해 주세요.');
            return;
        }
        setVisitScheduleSaving(true);
        const synced = editingVisitId
            ? await persistVisitSchedules((current) => current.map((item) => item.id === editingVisitId ? {
                ...item,
                visitDate: visitDateInput,
                visitTime: visitTimeInput,
                hospitalName: visitHospitalInput.trim(),
                treatmentNote: trimmedTreatment,
                preparationNote: trimmedPreparation,
                createdAt: new Date().toISOString(),
            } : item), account)
            : await persistVisitSchedules((current) => [...current, {
                id: `visit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                visitDate: visitDateInput,
                visitTime: visitTimeInput,
                hospitalName: visitHospitalInput.trim(),
                treatmentNote: trimmedTreatment,
                preparationNote: trimmedPreparation,
                createdAt: new Date().toISOString(),
            }], account);
        if (!isCurrentAccount(account) || synced === null) return;
        setVisitScheduleSaving(false);
        if (!synced) {
            setVisitFormIsError(true);
            setVisitFormMessage('일정을 저장하지 못했어요. 입력한 내용은 유지되니 다시 저장해 주세요.');
            return;
        }
        setVisitFormIsError(false);
        setVisitFormMessage(editingVisitId ? '진료 일정이 수정되었어요.' : '진료 일정이 저장되었어요.');
        resetVisitForm();
    };

    const handleVisitScheduleDelete = async (targetId: string) => {
        const account = readyAccount();
        if (visitScheduleSaving || !account) return;
        setVisitScheduleSaving(true);
        const synced = await persistVisitSchedules((current) => current.filter((item) => item.id !== targetId), account);
        if (!isCurrentAccount(account) || synced === null) return;
        setVisitScheduleSaving(false);
        if (!synced) {
            setVisitFormIsError(true);
            setVisitFormMessage('일정을 삭제하지 못했어요. 다시 삭제해 주세요.');
            return;
        }
        if (editingVisitId === targetId) {
            resetVisitForm();
            setShowVisitScheduleForm(false);
        }
        setVisitFormIsError(false);
        setVisitFormMessage('선택한 일정을 삭제했어요.');
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
                    id="visit-schedules"
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
                        {!visitContextReady ? (
                            <p className="uiEmptyState" role="status">{visitFormIsError ? '진료 일정을 다시 확인해 주세요.' : '일정을 확인하고 있어요…'}</p>
                        ) : visitSchedules.length === 0 ? (
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
                                            <button type="button" onClick={() => handleVisitScheduleEdit(item)} disabled={!visitContextReady || visitScheduleSaving} className="uiButton uiButton--secondary uiButton--small">수정</button>
                                            <button type="button" onClick={() => void handleVisitScheduleDelete(item.id)} disabled={!visitContextReady || visitScheduleSaving} className="uiButton uiButton--ghost uiButton--small">삭제</button>
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
                            disabled={!visitContextReady || visitScheduleSaving}
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

                        {!visitContextReady && visitFormIsError && (
                            <button type="button" onClick={() => refreshContextRef.current()} className="uiButton uiButton--secondary mt-3">다시 불러오기</button>
                        )}

                        {showVisitScheduleForm && (
                            <form id="visit-schedule-form" onSubmit={handleVisitScheduleSave} className="mt-5 grid gap-4 sm:grid-cols-2">
                                <label className="min-w-0 space-y-2">
                                    <span className="block text-sm font-semibold">방문 날짜</span>
                                    <input disabled={!visitContextReady || visitScheduleSaving} type="date" required aria-label="방문 날짜" enterKeyHint="next" value={visitDateInput} onChange={(event) => setVisitDateInput(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="min-w-0 space-y-2">
                                    <span className="block text-sm font-semibold">방문 시간</span>
                                    <input disabled={!visitContextReady || visitScheduleSaving} type="time" required aria-label="방문 시간" enterKeyHint="next" value={visitTimeInput} onChange={(event) => setVisitTimeInput(event.target.value)} className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">병원 이름 <span className="font-normal text-[var(--ui-muted)]">(선택)</span></span>
                                    <input disabled={!visitContextReady || visitScheduleSaving} type="text" aria-label="병원 이름" autoComplete="organization" enterKeyHint="next" value={visitHospitalInput} onChange={(event) => setVisitHospitalInput(event.target.value)} placeholder="예: 강북삼성병원" className="min-h-12 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">진료 내용</span>
                                    <input disabled={!visitContextReady || visitScheduleSaving} type="text" required aria-label="진료 내용" enterKeyHint="next" maxLength={120} value={visitTreatmentInput} onChange={(event) => setVisitTreatmentInput(event.target.value)} placeholder="예: 정기 검사, 외래 진료" className="min-h-12 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base" />
                                </label>
                                <label className="space-y-2 sm:col-span-2">
                                    <span className="block text-sm font-semibold">준비사항 <span className="font-normal text-[var(--ui-muted)]">(선택)</span></span>
                                    <textarea disabled={!visitContextReady || visitScheduleSaving} aria-label="준비사항" enterKeyHint="done" maxLength={300} value={visitPreparationInput} onChange={(event) => setVisitPreparationInput(event.target.value)} rows={2} placeholder="예: 검사 결과지, 복용 약 목록" className="w-full rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-3 text-base" />
                                </label>
                                <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                                    <button type="submit" disabled={!visitContextReady || visitScheduleSaving} className="uiButton uiButton--primary flex-1">{visitScheduleSaving ? '저장 중…' : editingVisitId ? '수정 저장' : '일정 저장'}</button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            resetVisitForm();
                                            setShowVisitScheduleForm(false);
                                            setVisitFormMessage('');
                                            setVisitFormIsError(false);
                                        }}
                                        disabled={!visitContextReady || visitScheduleSaving}
                                        className="uiButton uiButton--ghost"
                                    >
                                        취소
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </details>

                <HealthNewsFeed />
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
