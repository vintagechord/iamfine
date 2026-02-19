'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    detectCancerProfileMatch,
    formatDateKey,
    generatePlanForDate,
    optimizePlanByMedications,
    optimizePlanByPreference,
    optimizePlanByUserContext,
    type DayPlan,
    type MealSuggestion,
    type PreferenceType,
    type StageType,
    type UserDietContext,
    type UserMedicationSchedule,
} from '@/lib/dietEngine';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type StageStatus = 'planned' | 'active' | 'completed';

type TreatmentStageRow = {
    id: string;
    user_id: string;
    stage_type: StageType;
    stage_label: string | null;
    stage_order: number;
    status: StageStatus;
    started_at: string | null;
    ended_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type ProfileRow = {
    user_id: string;
    nickname: string;
    birth_year: number | null;
    sex: 'unknown' | 'female' | 'male' | 'other';
    height_cm: number | null;
    weight_kg: number | null;
    ethnicity: string | null;
};

type TreatmentMeta = {
    cancerType: string;
    cancerStage: string;
    updatedAt: string;
};

type MedicationTiming = 'breakfast' | 'lunch' | 'dinner';

type MedicationSchedule = {
    id: string;
    name: string;
    category: string;
    timing: MedicationTiming;
};

type DietStore = {
    medications: string[];
    medicationSchedules: MedicationSchedule[];
    dailyPreferences: Record<string, PreferenceType[]>;
};

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const DISCLAIMER_TEXT =
    '이 리포트는 규칙 기반 참고 자료입니다. 진단/처방/투약 변경은 반드시 담당 의료진 판단을 우선하세요.';

function getStoreKey(userId: string) {
    return `${STORAGE_PREFIX}:${userId}`;
}

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
            cancerType: parsed.cancerType,
            cancerStage: typeof parsed.cancerStage === 'string' ? parsed.cancerStage : '',
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        };
    } catch {
        return null;
    }
}

function parseStore(raw: string | null): DietStore {
    if (!raw) {
        return {
            medications: [],
            medicationSchedules: [],
            dailyPreferences: {},
        };
    }

    try {
        const parsed = JSON.parse(raw) as Partial<DietStore>;
        const medicationSchedules = Array.isArray(parsed.medicationSchedules)
            ? parsed.medicationSchedules
                  .filter((item): item is MedicationSchedule => {
                      if (!item || typeof item !== 'object') {
                          return false;
                      }
                      if (typeof item.name !== 'string' || !item.name.trim()) {
                          return false;
                      }
                      if (typeof item.category !== 'string' || !item.category.trim()) {
                          return false;
                      }
                      return item.timing === 'breakfast' || item.timing === 'lunch' || item.timing === 'dinner';
                  })
                  .map((item, index) => ({
                      id: typeof item.id === 'string' && item.id.trim() ? item.id : `med-${index}-${item.name}`,
                      name: item.name.trim(),
                      category: item.category.trim(),
                      timing: item.timing,
                  }))
            : [];

        return {
            medications: Array.isArray(parsed.medications) ? parsed.medications : [],
            medicationSchedules,
            dailyPreferences:
                parsed.dailyPreferences && typeof parsed.dailyPreferences === 'object'
                    ? (parsed.dailyPreferences as Record<string, PreferenceType[]>)
                    : {},
        };
    } catch {
        return {
            medications: [],
            medicationSchedules: [],
            dailyPreferences: {},
        };
    }
}

function sexLabel(value: ProfileRow['sex']) {
    if (value === 'female') {
        return '여성';
    }
    if (value === 'male') {
        return '남성';
    }
    if (value === 'other') {
        return '기타';
    }
    return '미입력';
}

function medicationTimingLabel(timing: MedicationTiming | 'snack' | string) {
    if (timing === 'breakfast') {
        return '아침';
    }
    if (timing === 'lunch') {
        return '점심';
    }
    if (timing === 'dinner') {
        return '저녁';
    }
    if (timing === 'snack') {
        return '간식';
    }
    return timing;
}

function changedFields(baseMeal: MealSuggestion, finalMeal: MealSuggestion) {
    const changes: string[] = [];
    if (baseMeal.riceType !== finalMeal.riceType) {
        changes.push(`밥: ${baseMeal.riceType} -> ${finalMeal.riceType}`);
    }
    if (baseMeal.main !== finalMeal.main) {
        changes.push(`메인: ${baseMeal.main} -> ${finalMeal.main}`);
    }
    if (baseMeal.soup !== finalMeal.soup) {
        changes.push(`국/수프: ${baseMeal.soup} -> ${finalMeal.soup}`);
    }
    if (baseMeal.sides.join(',') !== finalMeal.sides.join(',')) {
        changes.push(`반찬: ${baseMeal.sides.join(', ')} -> ${finalMeal.sides.join(', ')}`);
    }
    return changes;
}

function StageLabel({ stage }: { stage: TreatmentStageRow | null }) {
    if (!stage) {
        return <span>미입력</span>;
    }
    const statusText = stage.status === 'active' ? '진행중' : stage.status === 'completed' ? '완료' : '예정';
    return (
        <span>
            {stage.stage_type} / {stage.stage_label?.trim() || '미입력'} / {stage.stage_order}순서 / {statusText}
        </span>
    );
}

export default function DietReportPage() {
    const todayKey = formatDateKey(new Date());
    const nowIso = new Date().toISOString();

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState('');
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [stages, setStages] = useState<TreatmentStageRow[]>([]);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});

    const activeStage = useMemo(() => {
        const active = stages.find((item) => item.status === 'active');
        if (active) {
            return active;
        }
        return stages[0] ?? null;
    }, [stages]);

    const stageType = activeStage?.stage_type ?? 'other';
    const userDietContext = useMemo<UserDietContext>(() => {
        const nowYear = new Date().getFullYear();
        const age = profile?.birth_year ? Math.max(0, nowYear - profile.birth_year) : undefined;
        const contextMedicationSchedules: UserMedicationSchedule[] = medicationSchedules.map((item) => ({
            name: item.name,
            category: item.category,
            timing: item.timing,
        }));

        return {
            age,
            sex: profile?.sex ?? 'unknown',
            heightCm: profile?.height_cm ?? undefined,
            weightKg: profile?.weight_kg ?? undefined,
            ethnicity: profile?.ethnicity ?? undefined,
            cancerType: treatmentMeta?.cancerType ?? '',
            cancerStage: treatmentMeta?.cancerStage ?? '',
            activeStageType: activeStage?.stage_type ?? undefined,
            activeStageLabel: activeStage?.stage_label ?? '',
            activeStageOrder: activeStage?.stage_order ?? undefined,
            activeStageStatus: activeStage?.status ?? undefined,
            medicationSchedules: contextMedicationSchedules,
        };
    }, [profile, treatmentMeta, activeStage, medicationSchedules]);

    const todayPreferences = useMemo(() => dailyPreferences[todayKey] ?? [], [dailyPreferences, todayKey]);
    const basePlan = useMemo(() => generatePlanForDate(todayKey, stageType, 70), [todayKey, stageType]);
    const contextAdjusted = useMemo(() => optimizePlanByUserContext(basePlan, userDietContext), [basePlan, userDietContext]);
    const medicationAdjusted = useMemo(
        () => optimizePlanByMedications(contextAdjusted.plan, medications),
        [contextAdjusted.plan, medications]
    );
    const preferenceAdjusted = useMemo(() => {
        if (todayPreferences.length === 0) {
            return {
                plan: medicationAdjusted.plan,
                notes: [] as string[],
            };
        }
        return optimizePlanByPreference(medicationAdjusted.plan, todayPreferences);
    }, [medicationAdjusted.plan, todayPreferences]);

    const finalPlan: DayPlan = preferenceAdjusted.plan;
    const profileMatch = useMemo(() => detectCancerProfileMatch(userDietContext.cancerType), [userDietContext.cancerType]);
    const mergedNotes = useMemo(
        () => [...contextAdjusted.notes, ...medicationAdjusted.notes, ...preferenceAdjusted.notes],
        [contextAdjusted.notes, medicationAdjusted.notes, preferenceAdjusted.notes]
    );

    const reviewWarnings = useMemo(() => {
        const warnings: string[] = [];
        if (!userDietContext.cancerType?.trim()) {
            warnings.push('암 종류가 입력되지 않아 기본 안전식 규칙 위주로 추천되었습니다.');
        }
        if (!profileMatch && userDietContext.cancerType?.trim()) {
            warnings.push('현재 암종은 전용 프로필이 없어 일반 안전식 규칙을 적용했습니다.');
        }
        if (!userDietContext.cancerStage?.trim()) {
            warnings.push('암 기수가 비어 있어 기수 기반 강도 조절이 제한됩니다.');
        }
        if (!activeStage) {
            warnings.push('활성 치료 단계 정보가 없어 보수적인 기본 단계로 계산되었습니다.');
        }
        if (medicationSchedules.length === 0) {
            warnings.push('복용 시기 데이터가 없어 식후 복용 맞춤 조정이 제외되었습니다.');
        }
        if (todayPreferences.length === 0) {
            warnings.push('당일 선호 방향이 없어 기본 균형형이 유지되었습니다.');
        }
        return warnings;
    }, [userDietContext.cancerType, userDietContext.cancerStage, profileMatch, activeStage, medicationSchedules.length, todayPreferences.length]);

    const loadInitial = useCallback(async () => {
        setLoading(true);

        if (!hasSupabaseEnv || !supabase) {
            setLoading(false);
            return;
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
            setLoading(false);
            return;
        }

        const uid = userData.user.id;
        setUserId(uid);
        setTreatmentMeta(parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid))));

        const [{ data: profileData }, { data: stageData }] = await Promise.all([
            supabase
                .from('profiles')
                .select('user_id, nickname, birth_year, sex, height_cm, weight_kg, ethnicity')
                .eq('user_id', uid)
                .maybeSingle(),
            supabase
                .from('treatment_stages')
                .select(
                    'id, user_id, stage_type, stage_label, stage_order, status, started_at, ended_at, notes, created_at, updated_at'
                )
                .eq('user_id', uid)
                .order('stage_order', { ascending: true })
                .order('created_at', { ascending: true }),
        ]);

        setProfile((profileData as ProfileRow | null) ?? null);
        setStages((stageData as TreatmentStageRow[] | null) ?? []);

        const store = parseStore(localStorage.getItem(getStoreKey(uid)));
        setMedications(store.medications);
        setMedicationSchedules(store.medicationSchedules);
        setDailyPreferences(store.dailyPreferences);
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadInitial();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [loadInitial]);

    if (loading) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일의 Supabase 연결 설정을 확인해 주세요.</p>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                    <p className="text-sm font-semibold">로그인이 필요해요</p>
                    <p className="mt-1 text-sm">
                        <Link href="/auth" className="font-semibold underline">
                            로그인 페이지
                        </Link>
                        에서 로그인해 주세요.
                    </p>
                </section>
            </main>
        );
    }

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">적용 근거 리포트</h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">생성 시각: {nowIso}</p>
                    </div>
                    <Link
                        href="/diet"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        오늘 식단으로 돌아가기
                    </Link>
                </div>
            </section>

            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                <p className="font-semibold">입력 데이터 스냅샷</p>
                <div className="mt-2 space-y-1">
                    <p>- 사용자: {profile?.nickname || '미입력'} / {sexLabel(profile?.sex ?? 'unknown')}</p>
                    <p>
                        - 신체: 나이 {userDietContext.age ?? '미입력'} / 키 {userDietContext.heightCm ?? '미입력'}cm / 몸무게{' '}
                        {userDietContext.weightKg ?? '미입력'}kg
                    </p>
                    <p>- 암 정보: {userDietContext.cancerType?.trim() || '미입력'} / {userDietContext.cancerStage?.trim() || '미입력'}</p>
                    <p>
                        - 치료 단계: <StageLabel stage={activeStage} />
                    </p>
                    <p>- 복용 약(이름 기반): {medications.length > 0 ? medications.join(', ') : '없음'}</p>
                    <p>
                        - 복용 시기 스케줄:{' '}
                        {medicationSchedules.length > 0
                            ? medicationSchedules.map((item) => `${item.name}(${medicationTimingLabel(item.timing)})`).join(', ')
                            : '없음'}
                    </p>
                    <p>- 오늘 선호 반영: {todayPreferences.length > 0 ? todayPreferences.join(', ') : '없음'}</p>
                </div>
            </section>

            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                <p className="font-semibold">암종 프로필 매칭 근거</p>
                <div className="mt-2">
                    {profileMatch ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">매칭 프로필</p>
                                <p className="mt-1 text-base font-bold text-emerald-900 dark:text-emerald-100">{profileMatch.profileLabel}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">매칭 키워드</p>
                                <p className="mt-1 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-sm font-bold text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100">
                                    {profileMatch.matchedKeyword}
                                </p>
                                <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                                    입력된 암종명에서 인식된 단어예요.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p>- 전용 암종 프로필 미매칭: 일반 안전식 + 치료 단계 규칙으로 계산</p>
                    )}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">규칙 적용 로그</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">1) 개인 정보/암 정보 반영</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {contextAdjusted.notes.length > 0 ? (
                                contextAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">2) 약물 정보 반영</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {medicationAdjusted.notes.length > 0 ? (
                                medicationAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">3) 당일 선호 반영</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {preferenceAdjusted.notes.length > 0 ? (
                                preferenceAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">최종 적용 노트(통합)</p>
                    {mergedNotes.length > 0 ? mergedNotes.map((note) => <p key={note}>- {note}</p>) : <p className="mt-1">- 적용 없음</p>}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">식단 변경 비교(기본안 vs 최종안)</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    {(
                        [
                            { key: 'breakfast', label: '아침', base: basePlan.breakfast, final: finalPlan.breakfast },
                            { key: 'lunch', label: '점심', base: basePlan.lunch, final: finalPlan.lunch },
                            { key: 'dinner', label: '저녁', base: basePlan.dinner, final: finalPlan.dinner },
                        ] as const
                    ).map((item) => {
                        const changes = changedFields(item.base, item.final);
                        return (
                            <article key={item.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">최종: {item.final.summary}</p>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                    영양비율: 탄수 {item.final.nutrient.carb}% / 단백질 {item.final.nutrient.protein}% / 지방 {item.final.nutrient.fat}%
                                </p>
                                <div className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-200">
                                    {changes.length > 0 ? changes.map((change) => <p key={change}>- {change}</p>) : <p>- 변경 없음</p>}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-semibold">검토 필요 항목</p>
                <div className="mt-2 space-y-1">
                    {reviewWarnings.length > 0 ? (
                        reviewWarnings.map((warning) => <p key={warning}>- {warning}</p>)
                    ) : (
                        <p>- 필수 입력값 기준으로 누락 없이 계산되었습니다.</p>
                    )}
                    <p>- 임상 수치(혈액검사, 신장기능, 전해질, 체중변화)가 반영되지 않았으므로 처방 전 의료진 확인이 필요합니다.</p>
                </div>
            </section>
        </main>
    );
}
