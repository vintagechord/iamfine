'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    formatDateLabel,
    generateMonthPlans,
    optimizePlanByPreference,
    PREFERENCE_OPTIONS,
    STAGE_TYPE_LABELS,
    type PreferenceType,
    type StageType,
} from '@/lib/dietEngine';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type StageStatus = 'planned' | 'active' | 'completed';

type TreatmentStageRow = {
    id: string;
    stage_type: StageType;
    stage_order: number;
    status: StageStatus;
    created_at: string;
};

type DietStore = {
    preferences?: PreferenceType[];
    dailyPreferences?: Record<string, PreferenceType[]>;
    carryPreferences?: PreferenceType[];
    logs?: Record<string, DayLog>;
};

type TrackItem = {
    name: string;
    eaten: boolean;
};

type DayLog = {
    meals: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', TrackItem[]>>;
};

const DISCLAIMER_TEXT =
    '이 서비스는 참고용 식단/기록 도구이며, 치료·약물 관련 결정은 반드시 의료진과 상의하세요.';

const STORAGE_PREFIX = 'diet-store-v2';

const PREFERENCE_LABELS = Object.fromEntries(
    PREFERENCE_OPTIONS.map((option) => [option.key, option.label])
) as Record<PreferenceType, string>;

const PREFERENCE_KEYS = new Set<PreferenceType>(PREFERENCE_OPTIONS.map((option) => option.key));

function getStoreKey(userId: string) {
    return `${STORAGE_PREFIX}:${userId}`;
}

function normalizePreferences(value: unknown): PreferenceType[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is PreferenceType => PREFERENCE_KEYS.has(item as PreferenceType));
}

function parseDietStore(raw: string | null) {
    if (!raw) {
        return {
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            carryPreferences: [] as PreferenceType[],
            logs: {} as Record<string, DayLog>,
        };
    }

    try {
        const parsed = JSON.parse(raw) as DietStore;
        const dailyPreferences =
            parsed.dailyPreferences && typeof parsed.dailyPreferences === 'object'
                ? Object.fromEntries(
                      Object.entries(parsed.dailyPreferences).map(([dateKey, values]) => [
                          dateKey,
                          normalizePreferences(values),
                      ])
                  )
                : {};

        const legacyPreferences = normalizePreferences(parsed.preferences);
        const carryPreferences = normalizePreferences(parsed.carryPreferences);

        return {
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
            logs: parsed.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, DayLog>) : {},
        };
    } catch {
        return {
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            carryPreferences: [] as PreferenceType[],
            logs: {} as Record<string, DayLog>,
        };
    }
}

function parseMonthKey(raw: string) {
    const [yearRaw, monthRaw] = raw.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw) - 1;

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11) {
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth(),
        };
    }

    return {
        year,
        month,
    };
}

function toMonthInputValue(year: number, monthZeroBased: number) {
    return `${year}-${String(monthZeroBased + 1).padStart(2, '0')}`;
}

function offsetDateKey(baseDateKey: string, offset: number) {
    const [year, month, day] = baseDateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + offset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function eatenNames(log: DayLog) {
    const slots: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = ['breakfast', 'lunch', 'dinner', 'snack'];
    return slots.flatMap((slot) => (log.meals[slot] ?? []).filter((item) => item.eaten).map((item) => item.name));
}

function normalizeText(input: string) {
    return input.trim().toLowerCase();
}

function countKeywords(text: string, keywords: string[]) {
    const normalized = normalizeText(text);
    return keywords.reduce((count, keyword) => count + (normalized.includes(keyword) ? 1 : 0), 0);
}

function mergePreferences(...lists: Array<PreferenceType[]>) {
    const merged = new Set<PreferenceType>();
    lists.forEach((list) => {
        list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
}

function recommendAdaptivePreferencesByRecentLogs(logs: Record<string, DayLog>, referenceDateKey: string) {
    const lookbackText = Array.from({ length: 14 }, (_, index) => {
        const dateKey = offsetDateKey(referenceDateKey, -(index + 1));
        const log = logs[dateKey];
        if (!log) {
            return '';
        }
        return eatenNames(log).join(' ');
    })
        .join(' ')
        .trim();

    if (!lookbackText) {
        return [] as PreferenceType[];
    }

    const suggestions: PreferenceType[] = [];
    const add = (value: PreferenceType) => {
        if (!suggestions.includes(value)) {
            suggestions.push(value);
        }
    };

    const flourSugarCount =
        countKeywords(lookbackText, ['빵', '라면', '면', '파스타', '피자', '도넛']) +
        countKeywords(lookbackText, ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
    const proteinCount = countKeywords(lookbackText, ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유']);
    const vegetableCount = countKeywords(lookbackText, ['브로콜리', '양배추', '시금치', '오이', '당근', '버섯', '샐러드', '채소']);

    if (flourSugarCount >= 8) {
        add('healthy');
        add('digestive');
    }
    if (proteinCount < 6) {
        add('high_protein');
    }
    if (vegetableCount < 6) {
        add('vegetable');
    }

    const yesterdayLog = logs[offsetDateKey(referenceDateKey, -1)];
    if (yesterdayLog) {
        const yesterdayText = eatenNames(yesterdayLog).join(' ');
        const heavyCount =
            countKeywords(yesterdayText, ['튀김', '치킨', '야식', '술', '맥주', '소주', '족발', '보쌈']) +
            countKeywords(yesterdayText, ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
        if (heavyCount >= 3) {
            add('healthy');
            add('digestive');
            add('low_salt');
        }
    }

    return suggestions.slice(0, 4);
}

export default function DietCalendarPage() {
    const now = new Date();

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [stageType, setStageType] = useState<StageType>('other');
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});
    const [monthValue, setMonthValue] = useState(toMonthInputValue(now.getFullYear(), now.getMonth()));

    const { year, month } = useMemo(() => parseMonthKey(monthValue), [monthValue]);

    useEffect(() => {
        const loadContext = async () => {
            setLoading(true);

            if (!hasSupabaseEnv || !supabase) {
                setLoading(false);
                return;
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) {
                setUserId(null);
                setDailyPreferences({});
                setStageType('other');
                setLoading(false);
                return;
            }

            const uid = authData.user.id;
            setUserId(uid);

            const { data: stageData } = await supabase
                .from('treatment_stages')
                .select('id, stage_type, stage_order, status, created_at')
                .eq('user_id', uid)
                .order('stage_order', { ascending: true })
                .order('created_at', { ascending: true });

            const rows = (stageData ?? []) as TreatmentStageRow[];
            const activeStage = rows.find((row) => row.status === 'active') ?? rows[0];
            if (activeStage) {
                setStageType(activeStage.stage_type);
            }

            const parsed = parseDietStore(localStorage.getItem(getStoreKey(uid)));
            setDailyPreferences(parsed.dailyPreferences);
            setLogs(parsed.logs);
            setLoading(false);
        };

        const timer = window.setTimeout(() => {
            void loadContext();
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const monthPlans = useMemo(() => {
        const basePlans = generateMonthPlans(year, month, stageType, 70);

        return basePlans.map((basePlan) => {
            const byDatePreferences = dailyPreferences[basePlan.date];
            const adaptivePreferences = recommendAdaptivePreferencesByRecentLogs(logs, basePlan.date);
            const appliedPreferences = mergePreferences(adaptivePreferences, byDatePreferences ?? []);

            if (appliedPreferences.length === 0) {
                return {
                    plan: basePlan,
                    appliedPreferences,
                    source: '' as '' | '당일 확정' | '기록 자동 반영' | '당일 확정 + 기록 자동 반영',
                };
            }

            const source =
                byDatePreferences && byDatePreferences.length > 0
                    ? adaptivePreferences.length > 0
                        ? ('당일 확정 + 기록 자동 반영' as const)
                        : ('당일 확정' as const)
                    : ('기록 자동 반영' as const);

            return {
                plan: optimizePlanByPreference(basePlan, appliedPreferences).plan,
                appliedPreferences,
                source,
            };
        });
    }, [year, month, stageType, dailyPreferences, logs]);

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">월간 식단표</h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            현재 치료 단계: {STAGE_TYPE_LABELS[stageType]}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/diet"
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            오늘 기록하기
                        </Link>
                        <Link
                            href="/"
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            홈으로
                        </Link>
                    </div>
                </div>

                {!userId && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        로그인하면 치료 단계와 연동된 맞춤 식단표를 볼 수 있어요.
                    </p>
                )}

                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                    <p>- 먹고 싶은 방향 선택은 당일에서만 확정할 수 있어요.</p>
                    <p>- 기록한 식사 패턴은 다음/다다음 날짜 식단에도 자동 반영돼요.</p>
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">전체 식단표</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            월 단위로 아침/점심/저녁/간식을 한 번에 확인할 수 있어요.
                        </p>
                    </div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        월 선택
                        <input
                            type="month"
                            value={monthValue}
                            onChange={(event) => setMonthValue(event.target.value)}
                            className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                        />
                    </label>
                </div>

                {loading ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        {monthPlans.map(({ plan, appliedPreferences, source }) => (
                            <article
                                key={plan.date}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40"
                            >
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateLabel(plan.date)}</p>
                                {appliedPreferences.length > 0 && (
                                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                                        {source ? `${source} 반영` : '방향 반영'}: {' '}
                                        {appliedPreferences.map((key) => PREFERENCE_LABELS[key]).join(', ')}
                                    </p>
                                )}
                                <div className="mt-2 grid gap-2 text-sm text-gray-700 dark:text-gray-200 md:grid-cols-2 xl:grid-cols-4">
                                    <p>
                                        <span className="font-semibold">아침</span>: {plan.breakfast.summary}
                                    </p>
                                    <p>
                                        <span className="font-semibold">점심</span>: {plan.lunch.summary}
                                    </p>
                                    <p>
                                        <span className="font-semibold">저녁</span>: {plan.dinner.summary}
                                    </p>
                                    <p>
                                        <span className="font-semibold">간식/커피</span>: {plan.snack.summary}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
