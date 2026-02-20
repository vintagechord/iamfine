'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Coffee, Moon, Sun, Sunrise } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
    applySevenDayNoRepeatRule,
    formatDateKey,
    formatDateLabel,
    generatePlanForDate,
    getSnackCoffeeTimingGuide,
    getStageFoodGuides,
    mealItemsFromSuggestion,
    mealTypeLabel,
    applyDinnerCarbSafety,
    optimizePlanByMedications,
    optimizePlanByUserContext,
    optimizePlanByPreference,
    PREFERENCE_OPTIONS,
    STAGE_TYPE_LABELS,
    type DayPlan,
    type MealNutrient,
    type MealSlot,
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

type TrackItem = {
    id: string;
    name: string;
    eaten: boolean;
    notEaten?: boolean;
    isManual?: boolean;
    servings?: number;
};

type DayLog = {
    meals: Record<MealSlot, TrackItem[]>;
    memo: string;
    medicationTakenIds?: string[];
};

type MedicationHistory = {
    name: string;
    action: 'add' | 'remove';
    date: string;
};

type MedicationTiming = 'breakfast' | 'lunch' | 'dinner';

type MedicationSchedule = {
    id: string;
    name: string;
    category: string;
    timing: MedicationTiming;
};

type DietStore = {
    logs: Record<string, DayLog>;
    medications: string[];
    medicationHistory: MedicationHistory[];
    medicationSchedules: MedicationSchedule[];
    preferences: PreferenceType[];
    dailyPreferences: Record<string, PreferenceType[]>;
    carryPreferences: PreferenceType[];
};

type DayAnalysis = {
    matchScore: number;
    dailyScore: number;
    concerns: string[];
    부족: string[];
    과다: string[];
};

type RecipeTarget = MealSlot | 'coffee';

type RecipeModalContent = {
    title: string;
    recipeName: string;
    recipeSteps: string[];
};

type CustomAlertApiItem = {
    title: string;
};

type CustomAlertApiResponse = {
    items?: CustomAlertApiItem[];
};

type PortionGuideModalContent = {
    title: string;
    guide: ReturnType<typeof mealPortionGuideFromPlan>;
};

const DISCLAIMER_TEXT =
    '이 서비스는 참고용 식단/기록 도구이며, 치료·약물 관련 결정은 반드시 의료진과 상의하세요.';

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const USER_METADATA_NAMESPACE = 'iamfine';

const DEFAULT_STORE: DietStore = {
    logs: {},
    medications: [],
    medicationHistory: [],
    medicationSchedules: [],
    preferences: [],
    dailyPreferences: {},
    carryPreferences: [],
};

const PREFERENCE_KEYS = new Set<PreferenceType>(PREFERENCE_OPTIONS.map((option) => option.key));

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const TWO_WEEK_DAYS = 14;
const NO_REPEAT_DAYS = 30;
const MEDICATION_TIMING_ORDER: MedicationTiming[] = ['breakfast', 'lunch', 'dinner'];

function medicationTimingLabel(timing: MedicationTiming) {
    if (timing === 'breakfast') {
        return '아침 식후';
    }
    if (timing === 'lunch') {
        return '점심 식후';
    }
    return '저녁 식후';
}

function parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function offsetDateKey(baseDateKey: string, offset: number) {
    const date = parseDateKey(baseDateKey);
    date.setDate(date.getDate() + offset);
    return formatDateKey(date);
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function cloneDayPlan(plan: DayPlan): DayPlan {
    return {
        date: plan.date,
        breakfast: { ...plan.breakfast, sides: [...plan.breakfast.sides], recipeSteps: [...plan.breakfast.recipeSteps] },
        lunch: { ...plan.lunch, sides: [...plan.lunch.sides], recipeSteps: [...plan.lunch.recipeSteps] },
        dinner: { ...plan.dinner, sides: [...plan.dinner.sides], recipeSteps: [...plan.dinner.recipeSteps] },
        snack: { ...plan.snack, sides: [...plan.snack.sides], recipeSteps: [...plan.snack.recipeSteps] },
    };
}

function rebalanceMealNutrient(nutrient: MealNutrient, carbDelta: number, proteinDelta: number) {
    let carb = clamp(Math.round(nutrient.carb + carbDelta), 20, 60);
    let protein = clamp(Math.round(nutrient.protein + proteinDelta), 20, 60);
    let fat = 100 - carb - protein;

    if (fat < 20) {
        const need = 20 - fat;
        const proteinReducible = Math.max(0, protein - 20);
        const proteinCut = Math.min(need, proteinReducible);
        protein -= proteinCut;
        const remain = need - proteinCut;
        if (remain > 0) {
            carb = Math.max(20, carb - remain);
        }
        fat = 100 - carb - protein;
    }

    if (fat > 35) {
        const excess = fat - 35;
        carb = clamp(carb + excess, 20, 60);
        fat = 100 - carb - protein;
    }

    return {
        carb,
        protein,
        fat,
    };
}

type IntakeCorrectionContext = {
    stageType: StageType;
    bmi: number | null;
};

function computeIntakeRecordReliability(log: DayLog) {
    const allItems = SLOT_ORDER.flatMap((slot) => log.meals[slot]);
    if (allItems.length === 0) {
        return 0;
    }
    const checkedCount = allItems.filter((item) => item.eaten || item.notEaten).length;
    return checkedCount / allItems.length;
}

function stageRiskWeight(stageType: StageType) {
    if (stageType === 'chemo' || stageType === 'chemo_2nd' || stageType === 'radiation') {
        return 1.15;
    }
    if (stageType === 'surgery') {
        return 1.1;
    }
    if (
        stageType === 'hormone_therapy' ||
        stageType === 'medication' ||
        stageType === 'targeted' ||
        stageType === 'immunotherapy'
    ) {
        return 1.05;
    }
    return 1;
}

function getOvereatCorrectionStrength(context: IntakeCorrectionContext, reliability: number) {
    let bmiWeight = 1;
    if (context.bmi !== null) {
        if (context.bmi >= 30) {
            bmiWeight = 1.3;
        } else if (context.bmi >= 25) {
            bmiWeight = 1.18;
        } else if (context.bmi < 18.5) {
            bmiWeight = 0.85;
        }
    }
    const reliabilityWeight = clamp(0.65 + reliability * 0.45, 0.65, 1.1);
    return clamp(stageRiskWeight(context.stageType) * bmiWeight * reliabilityWeight, 0.65, 1.5);
}

function getUndereatCorrectionStrength(context: IntakeCorrectionContext, reliability: number) {
    let bmiWeight = 1;
    if (context.bmi !== null) {
        if (context.bmi < 18.5) {
            bmiWeight = 1.25;
        } else if (context.bmi >= 25) {
            bmiWeight = 0.9;
        }
    }
    let stageWeight = 1;
    if (context.stageType === 'surgery') {
        stageWeight = 1.15;
    } else if (context.stageType === 'chemo' || context.stageType === 'chemo_2nd' || context.stageType === 'radiation') {
        stageWeight = 1.1;
    }
    const reliabilityWeight = clamp(0.6 + reliability * 0.5, 0.6, 1.1);
    return clamp(stageWeight * bmiWeight * reliabilityWeight, 0.7, 1.6);
}

function applyYesterdayIntakeCorrection(
    dateKey: string,
    plan: DayPlan,
    logs: Record<string, DayLog>,
    context: IntakeCorrectionContext
) {
    const yesterdayKey = offsetDateKey(dateKey, -1);
    const yesterdayLog = logs[yesterdayKey];

    if (!yesterdayLog) {
        return {
            plan,
            notes: [] as string[],
        };
    }

    const eatenItems = eatenTrackItems(yesterdayLog);
    if (eatenItems.length === 0) {
        return {
            plan,
            notes: [] as string[],
        };
    }

    const eatenText = eatenItems.map((item) => stripPortionLabel(item.name)).join(' ');
    const flourKeywords = ['빵', '라면', '면', '파스타', '피자', '도넛'];
    const sugarKeywords = ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림', '시럽', '주스'];
    const heavyKeywords = ['튀김', '치킨', '야식', '족발', '보쌈', '술', '맥주', '소주', '곱창'];
    const proteinKeywords = ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유'];

    const flourSugarCount = countKeywords(eatenText, flourKeywords) + countKeywords(eatenText, sugarKeywords);
    const heavyCount = countKeywords(eatenText, heavyKeywords);
    const proteinCount = countKeywords(eatenText, proteinKeywords);
    const skippedMeals = (['breakfast', 'lunch', 'dinner'] as MealSlot[]).reduce((count, slot) => {
        const hasEaten = yesterdayLog.meals[slot].some((item) => item.eaten);
        return hasEaten ? count : count + 1;
    }, 0);

    const adjusted = cloneDayPlan(plan);
    const notes: string[] = [];
    const reliability = computeIntakeRecordReliability(yesterdayLog);
    const heavySignalThreshold = reliability >= 0.7 ? 3 : 4;

    if (flourSugarCount + heavyCount >= heavySignalThreshold) {
        const strength = getOvereatCorrectionStrength(context, reliability);
        const mealCarbDelta = Math.round(-6 * strength);
        const mealProteinDelta = Math.round(+4 * strength);
        const snackCarbDelta = Math.round(-8 * strength);
        const snackProteinDelta = Math.round(+5 * strength);

        (['breakfast', 'lunch', 'dinner'] as MealSlot[]).forEach((slot) => {
            const meal = slot === 'breakfast' ? adjusted.breakfast : slot === 'lunch' ? adjusted.lunch : adjusted.dinner;
            meal.nutrient = rebalanceMealNutrient(meal.nutrient, mealCarbDelta, mealProteinDelta);
            if (
                (meal.riceType.includes('밥') || meal.riceType.includes('죽') || meal.riceType.includes('덮밥')) &&
                !meal.riceType.includes('소량')
            ) {
                meal.riceType = `${meal.riceType}(소량)`;
                meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;
            }
        });

        adjusted.snack.main = '그릭요거트';
        adjusted.snack.sides = ['베리류', '아몬드 소량'];
        adjusted.snack.soup = '물';
        adjusted.snack.summary = '그릭요거트 + 베리류 + 아몬드 소량 + 물';
        adjusted.snack.nutrient = rebalanceMealNutrient(adjusted.snack.nutrient, snackCarbDelta, snackProteinDelta);
        adjusted.snack.recipeName = '전날 과식 보정 간식';
        adjusted.snack.recipeSteps = [
            '그릭요거트를 1회 분량(90g)으로 준비해 주세요.',
            '베리류는 한 줌(50~60g)만 곁들여 주세요.',
            '아몬드는 5~6알 이내로 제한해 주세요.',
            '당류가 많은 음료는 피하고 물과 함께 드세요.',
        ];

        notes.push('전날 기록을 반영해 오늘은 탄수화물·당류를 낮추고 단백질 중심으로 자동 조정했어요.');
        notes.push(
            `보정 강도: ${strength.toFixed(2)}배 (치료 단계 ${STAGE_TYPE_LABELS[context.stageType]}, BMI ${
                context.bmi ? context.bmi.toFixed(1) : '미입력'
            }, 기록 신뢰도 ${Math.round(reliability * 100)}%)`
        );
    } else if (skippedMeals >= 2 || proteinCount === 0) {
        const strength = getUndereatCorrectionStrength(context, reliability);
        const mealCarbDelta = Math.round(+2 * strength);
        const mealProteinDelta = Math.round(+3 * strength);
        const snackCarbDelta = Math.round(+2 * strength);
        const snackProteinDelta = Math.round(+4 * strength);

        (['breakfast', 'lunch', 'dinner'] as MealSlot[]).forEach((slot) => {
            const meal = slot === 'breakfast' ? adjusted.breakfast : slot === 'lunch' ? adjusted.lunch : adjusted.dinner;
            meal.nutrient = rebalanceMealNutrient(meal.nutrient, mealCarbDelta, mealProteinDelta);
        });

        adjusted.snack.main = '무가당 요거트';
        adjusted.snack.sides = ['바나나 반 개'];
        adjusted.snack.soup = '따뜻한 물';
        adjusted.snack.summary = '무가당 요거트 + 바나나 반 개 + 따뜻한 물';
        adjusted.snack.nutrient = rebalanceMealNutrient(adjusted.snack.nutrient, snackCarbDelta, snackProteinDelta);
        adjusted.snack.recipeName = '전날 결식 보정 간식';
        adjusted.snack.recipeSteps = [
            '무가당 요거트를 1회 분량으로 준비해 주세요.',
            '바나나 반 개를 추가해 부족한 에너지를 보충해 주세요.',
            '따뜻한 물과 함께 천천히 드세요.',
        ];

        notes.push('전날 섭취 부족 기록을 반영해 오늘은 결식을 막는 회복형 구성을 보강했어요.');
        notes.push(
            `보정 강도: ${strength.toFixed(2)}배 (치료 단계 ${STAGE_TYPE_LABELS[context.stageType]}, BMI ${
                context.bmi ? context.bmi.toFixed(1) : '미입력'
            }, 기록 신뢰도 ${Math.round(reliability * 100)}%)`
        );
    }

    return {
        plan: adjusted,
        notes,
    };
}

type PortionGuideItem = {
    name: string;
    amount: string;
};

type MealPlanItem = DayPlan['breakfast'];

function stripPortionLabel(rawName: string) {
    const [name] = rawName.split(' · ');
    return name.trim();
}

function isFruitName(name: string) {
    const normalized = name.replace(/\s+/g, '');
    return (
        normalized.includes('바나나') ||
        normalized.includes('사과') ||
        normalized.includes('배') ||
        normalized.includes('키위') ||
        normalized.includes('딸기') ||
        normalized.includes('베리') ||
        normalized.includes('과일')
    );
}

function baseAmountByFoodName(name: string, slot: MealSlot) {
    const normalized = name.replace(/\s+/g, '');

    if (normalized.includes('현미밥') || normalized.includes('잡곡밥') || normalized.includes('귀리밥') || normalized.includes('보리밥') || normalized.includes('흑미밥') || normalized.includes('기장밥')) {
        if (normalized.includes('소량')) {
            return '반 공기(90~100g)';
        }
        return slot === 'dinner' ? '반 공기~2/3공기(100~120g)' : '2/3공기(110~130g)';
    }
    if (normalized.includes('죽')) {
        return '1공기(220~250g)';
    }
    if (normalized.includes('덮밥')) {
        return '2/3공기(180~200g)';
    }
    if (normalized.includes('국수')) {
        return '1공기(180g)';
    }
    if (normalized.includes('닭가슴살') || normalized.includes('닭안심')) {
        return '손바닥 크기 1장(90~100g)';
    }
    if (normalized.includes('연어')) {
        return '한 토막(80~100g)';
    }
    if (normalized.includes('고등어')) {
        return '반 마리(90~100g)';
    }
    if (normalized.includes('흰살생선')) {
        return '한 토막(80~90g)';
    }
    if (normalized.includes('생선')) {
        return '반 마리 또는 한 토막(80~100g)';
    }
    if (normalized.includes('소고기')) {
        return '한 줌(70~80g)';
    }
    if (normalized.includes('돼지안심')) {
        return '한 줌(70~80g)';
    }
    if (normalized.includes('두부')) {
        return normalized.includes('연두부') ? '1/2모(150g)' : '1/3모(100g)';
    }
    if (normalized.includes('달걀')) {
        return '달걀 1~2개 분량(90~120g)';
    }
    if (normalized.includes('콩불고기')) {
        return '1/2컵(80g)';
    }
    if (normalized.includes('무가당요거트')) {
        return '1/2컵(100g)';
    }
    if (normalized.includes('그릭요거트')) {
        return '1/2컵(90g)';
    }
    if (normalized.includes('두유')) {
        return '1팩 또는 1컵(150~190ml)';
    }
    if (normalized.includes('아몬드') || normalized.includes('호두') || normalized.includes('견과')) {
        return '한 줌의 절반(10~15g)';
    }
    if (normalized.includes('바나나')) {
        return '중간 크기 1/2개(50g)';
    }
    if (normalized.includes('사과')) {
        return '중간 크기 1/4개(60g)';
    }
    if (normalized.includes('배')) {
        return '중간 크기 1/4개(70g)';
    }
    if (normalized.includes('키위')) {
        return '1/2개(50g)';
    }
    if (normalized.includes('딸기')) {
        return '3~4개(60g)';
    }
    if (normalized.includes('베리')) {
        return '한 줌(50~60g)';
    }
    if (normalized.includes('브로콜리')) {
        return '작은 송이 5~6개(70g)';
    }
    if (normalized.includes('당근볶음')) {
        return '2~3큰술(40~50g)';
    }
    if (normalized.includes('버섯볶음')) {
        return '작은 접시 1개(50g)';
    }
    if (normalized.includes('시금치')) {
        return '2~3젓가락(40g)';
    }
    if (normalized.includes('오이무침')) {
        return '작은 접시 1개(50g)';
    }
    if (normalized.includes('애호박볶음')) {
        return '작은 접시 1개(50g)';
    }
    if (
        normalized.includes('채소볶음') ||
        normalized.includes('채소무침') ||
        normalized.includes('구운채소') ||
        normalized.includes('나물') ||
        normalized.includes('샐러드')
    ) {
        return '작은 접시 1개(50~60g)';
    }
    if (normalized.includes('국') || normalized.includes('수프') || normalized.includes('육수')) {
        return '1컵(180~200ml)';
    }
    if (normalized === '물' || normalized.includes('따뜻한물')) {
        return '1컵(200ml)';
    }

    return slot === 'snack' ? '1회 간식 소량(40~80g)' : '작은 반찬 1접시(40~60g)';
}

function mealPortionGuideFromPlan(meal: MealPlanItem, slot: MealSlot) {
    const baseNames =
        slot === 'snack'
            ? [meal.main, ...meal.sides, meal.soup]
            : mealItemsFromSuggestion(meal, slot);

    const uniqueNames = Array.from(
        new Set(
            baseNames
                .map((name) => name.trim())
                .filter((name) => name.length > 0)
        )
    );

    const items: PortionGuideItem[] = uniqueNames.map((name) => ({
        name,
        amount: baseAmountByFoodName(name, slot),
    }));

    const notes: string[] = [];
    const grainIndex = items.findIndex((item) => {
        const normalized = item.name.replace(/\s+/g, '');
        return (
            normalized.includes('밥') || normalized.includes('죽') || normalized.includes('덮밥') || normalized.includes('국수')
        );
    });

    if (grainIndex >= 0 && items.some((item) => isFruitName(item.name))) {
        items[grainIndex] = {
            ...items[grainIndex],
            amount: '반 공기(90~100g)',
        };
        notes.push('곡류와 과일이 함께 있을 때는 곡류를 반 공기 기준으로 줄여 과식을 방지해요.');
    }

    if (slot === 'snack') {
        const fruitCount = items.filter((item) => isFruitName(item.name)).length;
        if (fruitCount >= 2) {
            notes.push('간식 과일은 합쳐서 1회(80~100g) 이내로 조절해 당류를 관리해요.');
        }
        if (items.some((item) => item.name.includes('요거트') || item.name.includes('두유'))) {
            notes.push('요거트·두유는 무가당 제품을 우선으로 선택해요.');
        }
    } else {
        notes.push('한 끼는 배부름 80% 수준에서 멈추고 천천히 드세요.');
    }

    return { items, notes };
}

function mealTrackNamesWithPortion(meal: MealPlanItem, slot: MealSlot) {
    const guide = mealPortionGuideFromPlan(meal, slot);
    return guide.items.map((item) => `${item.name} · ${item.amount}`);
}

function MealNutrientBalance({ nutrient }: { nutrient: MealNutrient }) {
    const carb = clamp(nutrient.carb, 0, 100);
    const protein = clamp(nutrient.protein, 0, 100);
    const fat = clamp(nutrient.fat, 0, 100);
    const total = Math.max(1, carb + protein + fat);
    const segments = [
        {
            key: 'carb',
            label: '탄수',
            value: carb,
            width: `${(carb / total) * 100}%`,
            barClass: 'bg-amber-400',
            dotClass: 'bg-amber-400',
        },
        {
            key: 'protein',
            label: '단백질',
            value: protein,
            width: `${(protein / total) * 100}%`,
            barClass: 'bg-emerald-500',
            dotClass: 'bg-emerald-500',
        },
        {
            key: 'fat',
            label: '지방',
            value: fat,
            width: `${(fat / total) * 100}%`,
            barClass: 'bg-sky-500',
            dotClass: 'bg-sky-500',
        },
    ] as const;

    return (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white/70 p-2 dark:border-gray-700 dark:bg-gray-900/60">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">영양 밸런스</p>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                {segments.map((segment) => (
                    <span key={segment.key} className={`h-full ${segment.barClass}`} style={{ width: segment.width }} />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-700 dark:text-gray-200">
                {segments.map((segment) => (
                    <span
                        key={`${segment.key}-label`}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 dark:border-gray-700 dark:bg-gray-900"
                    >
                        <span className={`h-2 w-2 rounded-full ${segment.dotClass}`} />
                        {segment.label} {segment.value}%
                    </span>
                ))}
            </div>
        </div>
    );
}

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

function parseMedicationNamesFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseMedicationSchedulesFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
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
            id: typeof item.id === 'string' && item.id.trim() ? item.id : `med-metadata-${index}-${item.name}`,
            name: item.name.trim(),
            category: item.category.trim(),
            timing: item.timing,
        }));
}

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
        };
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
        };
    }

    const scoped = namespaced as Record<string, unknown>;
    return {
        treatmentMeta: parseTreatmentMetaFromUnknown(scoped.treatmentMeta),
        medications: parseMedicationNamesFromUnknown(scoped.medications),
        medicationSchedules: parseMedicationSchedulesFromUnknown(scoped.medicationSchedules),
    };
}

function buildUpdatedUserMetadata(
    raw: unknown,
    patch: Partial<{
        treatmentMeta: TreatmentMeta;
        medications: string[];
        medicationSchedules: MedicationSchedule[];
    }>
) {
    const root =
        raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : ({} as Record<string, unknown>);
    const existingNamespacedRaw = root[USER_METADATA_NAMESPACE];
    const existingNamespaced =
        existingNamespacedRaw && typeof existingNamespacedRaw === 'object' && !Array.isArray(existingNamespacedRaw)
            ? (existingNamespacedRaw as Record<string, unknown>)
            : {};

    return {
        ...root,
        [USER_METADATA_NAMESPACE]: {
            ...existingNamespaced,
            ...patch,
        },
    };
}

function parseStore(raw: string | null): DietStore {
    if (!raw) {
        return DEFAULT_STORE;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<DietStore>;
        const normalizePreferences = (value: unknown): PreferenceType[] => {
            if (!Array.isArray(value)) {
                return [];
            }

            return value.filter((item): item is PreferenceType => PREFERENCE_KEYS.has(item as PreferenceType));
        };

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
            logs: parsed.logs ?? {},
            medications: Array.isArray(parsed.medications) ? parsed.medications : [],
            medicationHistory: Array.isArray(parsed.medicationHistory) ? parsed.medicationHistory : [],
            medicationSchedules,
            preferences: legacyPreferences,
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
        };
    } catch {
        return DEFAULT_STORE;
    }
}

function makeTrackItems(dateKey: string, slot: MealSlot, names: string[]) {
    return names.map((name, index) => ({
        id: `${dateKey}-${slot}-${index}`,
        name,
        eaten: false,
        notEaten: false,
        isManual: false,
        servings: 1,
    }));
}

function buildDefaultLog(dateKey: string, plan: DayPlan): DayLog {
    return {
        meals: {
            breakfast: makeTrackItems(dateKey, 'breakfast', mealTrackNamesWithPortion(plan.breakfast, 'breakfast')),
            lunch: makeTrackItems(dateKey, 'lunch', mealTrackNamesWithPortion(plan.lunch, 'lunch')),
            dinner: makeTrackItems(dateKey, 'dinner', mealTrackNamesWithPortion(plan.dinner, 'dinner')),
            snack: makeTrackItems(dateKey, 'snack', mealTrackNamesWithPortion(plan.snack, 'snack')),
        },
        memo: '',
        medicationTakenIds: [],
    };
}

function normalizeText(input: string) {
    return input.trim().toLowerCase();
}

function normalizeManualMealName(input: string) {
    const compact = input.replace(/\s+/g, ' ').trim();
    if (!compact) {
        return '';
    }

    const firstItem = compact
        .split(/[,+/|]/)
        .map((item) => item.trim())
        .filter(Boolean)[0] ?? compact;

    const withoutPortion = firstItem
        .replace(/\b\d+(\.\d+)?\s*(인분|개|컵|그릇|조각|잔|스푼|숟갈|g|kg|mg|ml|l)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return withoutPortion || firstItem;
}

function compactFoodText(input: string) {
    return input.toLowerCase().replace(/[^0-9a-zA-Z가-힣]/g, '');
}

function levenshteinDistance(a: string, b: string) {
    if (a === b) {
        return 0;
    }

    if (!a) {
        return b.length;
    }

    if (!b) {
        return a.length;
    }

    const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
    const next = new Array<number>(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i += 1) {
        next[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            next[j] = Math.min(
                prev[j] + 1,
                next[j - 1] + 1,
                prev[j - 1] + cost
            );
        }
        for (let j = 0; j <= b.length; j += 1) {
            prev[j] = next[j];
        }
    }

    return prev[b.length];
}

function foodNameSimilarityScore(query: string, candidate: string) {
    const normalizedQuery = compactFoodText(normalizeManualMealName(query));
    const normalizedCandidate = compactFoodText(stripPortionLabel(candidate));

    if (!normalizedQuery || !normalizedCandidate) {
        return 0;
    }

    if (normalizedQuery === normalizedCandidate) {
        return 1;
    }

    let score = 0;

    if (normalizedCandidate.includes(normalizedQuery)) {
        score = Math.max(
            score,
            0.9 + Math.min(normalizedQuery.length / normalizedCandidate.length, 0.08)
        );
    }
    if (normalizedQuery.includes(normalizedCandidate)) {
        score = Math.max(
            score,
            0.84 + Math.min(normalizedCandidate.length / normalizedQuery.length, 0.08)
        );
    }

    const distance = levenshteinDistance(normalizedQuery, normalizedCandidate);
    const distanceScore = 1 - distance / Math.max(normalizedQuery.length, normalizedCandidate.length);
    score = Math.max(score, distanceScore);

    const queryCharSet = new Set(normalizedQuery.split(''));
    const overlapCount = normalizedCandidate.split('').filter((char) => queryCharSet.has(char)).length;
    const overlapScore = overlapCount / Math.max(normalizedQuery.length, normalizedCandidate.length);
    score = Math.max(score, overlapScore * 0.85);

    return clamp(score, 0, 1);
}

function searchManualFoodCandidates(query: string, candidates: string[], maxResults = 8) {
    const normalizedQuery = normalizeManualMealName(query);
    if (!normalizedQuery) {
        return [];
    }

    const ranked = candidates
        .map((name) => ({
            name,
            score: foodNameSimilarityScore(normalizedQuery, name),
        }))
        .filter((item) => item.score >= 0.42)
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko'))
        .slice(0, maxResults)
        .map((item) => item.name);

    return Array.from(new Set(ranked));
}

function eatenTrackItems(log: DayLog) {
    return SLOT_ORDER.flatMap((slot) => log.meals[slot].filter((item) => item.eaten));
}

function countKeywordsByItems(items: Array<Pick<TrackItem, 'name' | 'servings'>>, keywords: string[]) {
    const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword));
    return items.reduce((count, item) => {
        const normalizedName = normalizeText(stripPortionLabel(item.name)).replace(/\(1인분\)\s*$/, '');
        const matched = normalizedKeywords.some((keyword) => normalizedName.includes(keyword));
        if (!matched) {
            return count;
        }
        const servingCount = Math.max(1, Math.round(item.servings ?? 1));
        return count + servingCount;
    }, 0);
}

function includesAnyKeywordByItems(items: Array<Pick<TrackItem, 'name' | 'servings'>>, keywords: string[]) {
    return countKeywordsByItems(items, keywords) > 0;
}

function includesAnyKeyword(text: string, keywords: string[]) {
    const normalized = normalizeText(text);
    return keywords.some((keyword) => normalized.includes(keyword));
}

function countKeywords(text: string, keywords: string[]) {
    const normalized = normalizeText(text);
    return keywords.reduce((count, keyword) => count + (normalized.includes(keyword) ? 1 : 0), 0);
}

function preferenceLabel(key: PreferenceType) {
    return PREFERENCE_OPTIONS.find((option) => option.key === key)?.label ?? key;
}

function uniqueRecipeSteps(steps: string[]) {
    const seen = new Set<string>();
    const unique: string[] = [];

    steps.forEach((rawStep) => {
        const step = rawStep.trim();
        if (!step || seen.has(step)) {
            return;
        }
        seen.add(step);
        unique.push(step);
    });

    return unique;
}

function mergePreferences(...lists: Array<PreferenceType[]>) {
    const merged = new Set<PreferenceType>();
    lists.forEach((list) => {
        list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
}

function eatenNames(log: DayLog) {
    return SLOT_ORDER.flatMap((slot) =>
        log.meals[slot].filter((item) => item.eaten).map((item) => stripPortionLabel(item.name))
    );
}

function recommendPreferencesByRecentLogs(logs: Record<string, DayLog>, todayKey: string) {
    const eatenItems = Array.from({ length: TWO_WEEK_DAYS }, (_, index) => {
        const dateKey = offsetDateKey(todayKey, -index);
        const log = logs[dateKey];
        if (!log) {
            return [] as TrackItem[];
        }
        return eatenTrackItems(log);
    }).flat();

    if (eatenItems.length === 0) {
        return ['healthy', 'vegetable', 'high_protein'] as PreferenceType[];
    }

    const suggestions: PreferenceType[] = [];
    const add = (value: PreferenceType) => {
        if (!suggestions.includes(value)) {
            suggestions.push(value);
        }
    };

    const proteinCount = countKeywordsByItems(eatenItems, ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유']);
    const fishCount = countKeywordsByItems(eatenItems, ['생선', '연어', '고등어', '대구', '참치']);
    const flourCount = countKeywordsByItems(eatenItems, ['빵', '라면', '면', '파스타', '피자', '도넛']);
    const sweetCount = countKeywordsByItems(eatenItems, ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
    const spicyCount = countKeywordsByItems(eatenItems, ['매운', '떡볶이', '불닭', '짬뽕']);

    if (proteinCount < 6) {
        add('high_protein');
    }
    if (fishCount < 3) {
        add('fish');
    }
    if (flourCount + sweetCount >= 6) {
        add('healthy');
        add('digestive');
    }
    if (spicyCount >= 4) {
        add('bland');
    }
    if (suggestions.length < 3) {
        add('vegetable');
    }
    if (suggestions.length < 3) {
        add('warm_food');
    }

    return suggestions.slice(0, 4);
}

function recommendPreferencesByExternalSignals(items: CustomAlertApiItem[]) {
    if (items.length === 0) {
        return [] as PreferenceType[];
    }

    const text = items
        .map((item) => item.title.trim())
        .filter(Boolean)
        .slice(0, 20)
        .join(' ')
        .toLowerCase();

    if (!text) {
        return [] as PreferenceType[];
    }

    const suggestions: PreferenceType[] = [];
    const add = (value: PreferenceType) => {
        if (!suggestions.includes(value)) {
            suggestions.push(value);
        }
    };

    if (countKeywords(text, ['생선', '연어', '오메가', '등푸른']) >= 1) {
        add('fish');
    }
    if (countKeywords(text, ['채소', '샐러드', '브로콜리', '과일', '식이섬유']) >= 1) {
        add('vegetable');
    }
    if (countKeywords(text, ['단백질', '두부', '닭가슴살', '달걀', '콩']) >= 1) {
        add('high_protein');
    }
    if (countKeywords(text, ['저염', '염분', '나트륨']) >= 1) {
        add('low_salt');
    }
    if (countKeywords(text, ['식욕저하', '메스꺼움', '소화', '부드러운', '죽', '수프']) >= 1) {
        add('digestive');
        add('soft_food');
    }

    return suggestions.slice(0, 4);
}

function recommendAdaptivePreferencesByRecentLogs(logs: Record<string, DayLog>, referenceDateKey: string) {
    const lookbackKeys = Array.from({ length: TWO_WEEK_DAYS }, (_, index) => offsetDateKey(referenceDateKey, -(index + 1)));
    const lookbackItems = lookbackKeys
        .map((dateKey) => {
            const log = logs[dateKey];
            if (!log) {
                return [] as TrackItem[];
            }
            return eatenTrackItems(log);
        })
        .flat();

    if (lookbackItems.length === 0) {
        return [] as PreferenceType[];
    }

    const suggestions: PreferenceType[] = [];
    const add = (value: PreferenceType) => {
        if (!suggestions.includes(value)) {
            suggestions.push(value);
        }
    };

    const flourKeywords = ['빵', '라면', '면', '파스타', '피자', '도넛'];
    const sugarKeywords = ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림'];
    const proteinKeywords = ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유'];
    const vegetableKeywords = ['브로콜리', '양배추', '시금치', '오이', '당근', '버섯', '샐러드', '채소'];
    const spicyKeywords = ['매운', '불닭', '짬뽕', '떡볶이'];

    const flourSugarCount = countKeywordsByItems(lookbackItems, flourKeywords) + countKeywordsByItems(lookbackItems, sugarKeywords);
    const proteinCount = countKeywordsByItems(lookbackItems, proteinKeywords);
    const vegetableCount = countKeywordsByItems(lookbackItems, vegetableKeywords);
    const spicyCount = countKeywordsByItems(lookbackItems, spicyKeywords);

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
    if (spicyCount >= 4) {
        add('bland');
    }

    const yesterdayLog = logs[offsetDateKey(referenceDateKey, -1)];
    if (yesterdayLog) {
        const yesterdayItems = eatenTrackItems(yesterdayLog);
        const yesterdayFlourSugar =
            countKeywordsByItems(yesterdayItems, flourKeywords) + countKeywordsByItems(yesterdayItems, sugarKeywords);
        const heavyKeywords = ['튀김', '치킨', '야식', '술', '맥주', '소주', '족발', '보쌈'];
        const heavyCount = countKeywordsByItems(yesterdayItems, heavyKeywords);
        if (yesterdayFlourSugar + heavyCount >= 3) {
            add('healthy');
            add('digestive');
            add('low_salt');
        }
    }

    return suggestions.slice(0, 4);
}

function suggestedNames(plan: DayPlan) {
    return SLOT_ORDER.flatMap((slot) => {
        if (slot === 'breakfast') {
            return mealItemsFromSuggestion(plan.breakfast, slot);
        }
        if (slot === 'lunch') {
            return mealItemsFromSuggestion(plan.lunch, slot);
        }
        if (slot === 'dinner') {
            return mealItemsFromSuggestion(plan.dinner, slot);
        }
        return mealItemsFromSuggestion(plan.snack, slot);
    });
}

function calcMatchScore(plan: DayPlan, log: DayLog) {
    const eaten = eatenNames(log);
    if (eaten.length === 0) {
        return 0;
    }

    const eatenText = normalizeText(eaten.join(' '));
    const suggestedTokens = suggestedNames(plan)
        .join(' ')
        .replace(/[+(),]/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);

    const matched = suggestedTokens.filter((token) => eatenText.includes(token.toLowerCase())).length;
    const raw = suggestedTokens.length === 0 ? 0 : Math.round((matched / suggestedTokens.length) * 100);
    return clamp(raw, 0, 100);
}

function analyzeDay(plan: DayPlan, log: DayLog, stageType: StageType): DayAnalysis {
    const eatenItems = eatenTrackItems(log);
    const matchScore = calcMatchScore(plan, log);

    if (eatenItems.length === 0) {
        return {
            matchScore,
            dailyScore: 0,
            concerns: [],
            부족: ['아직 체크한 식사가 없어요. 먹은 메뉴를 체크해 보세요.'],
            과다: [],
        };
    }

    const concerns: string[] = [];
    const 부족: string[] = [];
    const 과다: string[] = [];

    const proteinKeywords = ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유'];
    const flourKeywords = ['빵', '라면', '면', '파스타', '피자', '케이크', '도넛'];
    const sugarKeywords = ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림'];
    const concernKeywords = ['생회', '육회', '날달걀', '술', '소주', '맥주', '튀김', '매운'];

    if (includesAnyKeywordByItems(eatenItems, concernKeywords)) {
        concerns.push('치료 중에는 생식/술/자극적인 음식은 주의해 주세요.');
    }

    if (!includesAnyKeywordByItems(eatenItems, proteinKeywords)) {
        부족.push('단백질 반찬이 부족해 보여요. 두부·생선·달걀 반찬을 추가해 보세요.');
    }

    if (countKeywordsByItems(eatenItems, flourKeywords) >= 2) {
        과다.push('밀가루 음식이 많은 편이에요. 잡곡밥/감자로 일부 바꿔보세요.');
    }

    if (countKeywordsByItems(eatenItems, sugarKeywords) >= 2) {
        과다.push('단 간식이 많은 편이에요. 과일·견과류 중심으로 바꿔보세요.');
    }

    if (
        (stageType === 'chemo' || stageType === 'chemo_2nd') &&
        includesAnyKeywordByItems(eatenItems, ['튀김', '매운'])
    ) {
        concerns.push('항암 치료 중에는 기름지거나 매운 음식이 속을 불편하게 할 수 있어요.');
    }

    let dailyScore = matchScore;
    for (const slot of SLOT_ORDER) {
        const hasEaten = log.meals[slot].some((item) => item.eaten);
        if (hasEaten) {
            dailyScore += 4;
        }
    }

    dailyScore -= concerns.length * 10;
    dailyScore -= 과다.length * 8;

    return {
        matchScore,
        dailyScore: clamp(dailyScore, 0, 100),
        concerns,
        부족,
        과다,
    };
}

export default function DietPage() {
    const todayKey = formatDateKey(new Date());
    const searchParams = useSearchParams();

    const [loading, setLoading] = useState(true);
    const [storeReady, setStoreReady] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [accountStartDateKey, setAccountStartDateKey] = useState(todayKey);
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stages, setStages] = useState<TreatmentStageRow[]>([]);

    const [logs, setLogs] = useState<Record<string, DayLog>>({});
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [carryPreferences, setCarryPreferences] = useState<PreferenceType[]>([]);
    const [draftTodayPreferences, setDraftTodayPreferences] = useState<PreferenceType[]>([]);
    const [proposalRequested, setProposalRequested] = useState(false);
    const [showTodayPreferencePanel, setShowTodayPreferencePanel] = useState(false);
    const [externalSignalPreferences, setExternalSignalPreferences] = useState<PreferenceType[]>([]);

    const [selectedDate, setSelectedDate] = useState(todayKey);
    const [todayPlanOffset, setTodayPlanOffset] = useState(0);
    const [openRecipeSlot, setOpenRecipeSlot] = useState<RecipeTarget | null>(null);
    const [openPortionGuideContent, setOpenPortionGuideContent] = useState<PortionGuideModalContent | null>(null);
    const [showRecordPlanModal, setShowRecordPlanModal] = useState(false);
    const [openRecordPortionSlot, setOpenRecordPortionSlot] = useState<MealSlot | null>(null);
    const [showNutrients, setShowNutrients] = useState(false);
    const [newItemBySlot, setNewItemBySlot] = useState<Record<MealSlot, string>>({
        breakfast: '',
        lunch: '',
        dinner: '',
        snack: '',
    });

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const openRecordView = searchParams.get('view') === 'record';

    const activeStage = useMemo(() => {
        const current = stages.find((stage) => stage.status === 'active');
        if (current) {
            return current;
        }
        return stages[0] ?? null;
    }, [stages]);

    const stageType = activeStage?.stage_type ?? 'other';
    useEffect(() => {
        if (!storeReady) {
            return;
        }

        const controller = new AbortController();
        const cancerType = treatmentMeta?.cancerType?.trim() ?? '';
        const cancerStage = treatmentMeta?.cancerStage?.trim() ?? '';

        const loadExternalSignals = async () => {
            try {
                const params = new URLSearchParams();
                if (cancerType) {
                    params.set('cancerType', cancerType);
                }
                if (cancerStage) {
                    params.set('cancerStage', cancerStage);
                }
                params.set('stageType', stageType);

                const response = await fetch(`/api/custom-alerts?${params.toString()}`, {
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) {
                    setExternalSignalPreferences([]);
                    return;
                }

                const json = (await response.json()) as CustomAlertApiResponse;
                const items = Array.isArray(json.items) ? json.items : [];
                const recommended = recommendPreferencesByExternalSignals(items);
                setExternalSignalPreferences(recommended);
            } catch (loadError) {
                if (controller.signal.aborted) {
                    return;
                }
                console.error('외부 식단 신호 조회 실패', loadError);
                setExternalSignalPreferences([]);
            }
        };

        void loadExternalSignals();

        return () => controller.abort();
    }, [storeReady, treatmentMeta?.cancerType, treatmentMeta?.cancerStage, stageType]);

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

    const applyRecommendationAdjustments = useCallback(
        (basePlan: DayPlan, targetPreferences: PreferenceType[], dateKey: string) => {
            const userContextAdjusted = optimizePlanByUserContext(basePlan, userDietContext);
            const medicationAdjusted = optimizePlanByMedications(userContextAdjusted.plan, medications);
            const validHeight = userDietContext.heightCm && userDietContext.heightCm > 0 ? userDietContext.heightCm : null;
            const validWeight = userDietContext.weightKg && userDietContext.weightKg > 0 ? userDietContext.weightKg : null;
            const bmi =
                validHeight && validWeight
                    ? Number((validWeight / Math.pow(validHeight / 100, 2)).toFixed(1))
                    : null;
            const yesterdayLog = logs[offsetDateKey(dateKey, -1)];
            const yesterdayEatenCount = yesterdayLog ? eatenTrackItems(yesterdayLog).length : 0;
            const lowAppetiteRisk =
                targetPreferences.includes('appetite_boost') ||
                (yesterdayLog ? yesterdayEatenCount <= 2 : false);
            const weightLossPreference = targetPreferences.includes('weight_loss');
            const preferenceAdjusted =
                targetPreferences.length === 0
                    ? { plan: medicationAdjusted.plan, notes: [] as string[] }
                    : optimizePlanByPreference(medicationAdjusted.plan, targetPreferences);
            const dinnerCarbSafetyAdjusted = applyDinnerCarbSafety(preferenceAdjusted.plan, {
                bmi,
                lowAppetiteRisk,
                weightLossPreference,
            });
            const yesterdayAdjusted = applyYesterdayIntakeCorrection(dateKey, dinnerCarbSafetyAdjusted.plan, logs, {
                stageType,
                bmi,
            });
            return {
                plan: yesterdayAdjusted.plan,
                notes: [
                    ...userContextAdjusted.notes,
                    ...medicationAdjusted.notes,
                    ...preferenceAdjusted.notes,
                    ...(externalSignalPreferences.length > 0
                        ? ['외부 최신 식단/영양 소식 키워드를 반영해 메뉴 다양성을 보강했어요.']
                        : []),
                    ...dinnerCarbSafetyAdjusted.notes,
                    ...yesterdayAdjusted.notes,
                ],
            };
        },
        [userDietContext, medications, logs, stageType, externalSignalPreferences]
    );
    const personalizationSummary = useMemo(() => {
        const ageText =
            userDietContext.age && userDietContext.age > 0 ? `${userDietContext.age}세` : '미입력';
        const sexText =
            userDietContext.sex === 'female'
                ? '여성'
                : userDietContext.sex === 'male'
                  ? '남성'
                  : userDietContext.sex === 'other'
                    ? '기타'
                    : '미입력';
        const heightText = userDietContext.heightCm ? `${userDietContext.heightCm}cm` : '미입력';
        const weightText = userDietContext.weightKg ? `${userDietContext.weightKg}kg` : '미입력';
        const ethnicityText = userDietContext.ethnicity?.trim() ? userDietContext.ethnicity.trim() : '미입력';
        const cancerTypeText = userDietContext.cancerType?.trim() ? userDietContext.cancerType.trim() : '미입력';
        const stageLabel = activeStage?.stage_label?.trim() || '미입력';
        const stageTypeLabel = activeStage ? STAGE_TYPE_LABELS[activeStage.stage_type] : '미입력';
        const stageOrderText = activeStage ? String(activeStage.stage_order) : '미입력';
        const stageStatusText = activeStage
            ? activeStage.status === 'active'
                ? '진행중'
                : activeStage.status === 'completed'
                  ? '완료'
                  : '예정'
            : '미입력';
        const medicationCount = medicationSchedules.length;
        const medicationTimingText =
            medicationCount === 0
                ? '미입력'
                : Array.from(new Set(medicationSchedules.map((item) => medicationTimingLabel(item.timing)))).join(', ');

        return [
            `기본 건강 정보: 나이 ${ageText} / 성별 ${sexText} / 키 ${heightText} / 몸무게 ${weightText} / 인종·배경 ${ethnicityText}`,
            `치료 정보: 암 종류 ${cancerTypeText}`,
            `치료 단계: 유형 ${stageTypeLabel} / 단계명 ${stageLabel} / 상태 ${stageStatusText} / 순서 ${stageOrderText}`,
            `복용 약 정보: ${medicationCount}개 / 복용 시기 ${medicationTimingText}`,
        ];
    }, [userDietContext, activeStage, medicationSchedules]);

    const previousMonthScore = useMemo(() => {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const month = prevMonthDate.getMonth() + 1;
        const year = prevMonthDate.getFullYear();
        const keys: string[] = [];
        const lastDay = new Date(year, month, 0).getDate();

        for (let day = 1; day <= lastDay; day += 1) {
            const key = formatDateKey(new Date(year, month - 1, day));
            keys.push(key);
        }

        const scores = keys
            .map((key) => {
                const log = logs[key];
                if (!log) {
                    return null;
                }
                const plan = applyRecommendationAdjustments(generatePlanForDate(key, stageType, 70), [], key).plan;
                return analyzeDay(plan, log, stageType).dailyScore;
            })
            .filter((score): score is number => typeof score === 'number');

        if (scores.length === 0) {
            return 70;
        }

        return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    }, [logs, stageType, applyRecommendationAdjustments]);

    const baseTodayPlan = useMemo(
        () => generatePlanForDate(todayKey, stageType, previousMonthScore),
        [todayKey, stageType, previousMonthScore]
    );

    const userSelectedTodayPreferences = useMemo(
        () => dailyPreferences[todayKey] ?? [],
        [dailyPreferences, todayKey]
    );
    const adaptiveTodayPreferences = useMemo(
        () => recommendAdaptivePreferencesByRecentLogs(logs, todayKey),
        [logs, todayKey]
    );
    const confirmedTodayPreferences = useMemo(
        () => mergePreferences(adaptiveTodayPreferences, userSelectedTodayPreferences, externalSignalPreferences),
        [adaptiveTodayPreferences, userSelectedTodayPreferences, externalSignalPreferences]
    );
    const todayDietModeChecked = useMemo(
        () => userSelectedTodayPreferences.includes('weight_loss'),
        [userSelectedTodayPreferences]
    );
    const recentRecordRecommendations = useMemo(
        () => recommendPreferencesByRecentLogs(logs, todayKey),
        [logs, todayKey]
    );

    const optimizedToday = useMemo(() => {
        return applyRecommendationAdjustments(baseTodayPlan, confirmedTodayPreferences, todayKey);
    }, [baseTodayPlan, confirmedTodayPreferences, applyRecommendationAdjustments, todayKey]);

    const proposedTodayOptimization = useMemo(() => {
        return applyRecommendationAdjustments(
            baseTodayPlan,
            mergePreferences(adaptiveTodayPreferences, userSelectedTodayPreferences, draftTodayPreferences),
            todayKey
        );
    }, [baseTodayPlan, adaptiveTodayPreferences, userSelectedTodayPreferences, draftTodayPreferences, applyRecommendationAdjustments, todayKey]);

    const resolveAppliedPreferences = useCallback(
        (dateKey: string) => {
            const byDate = dailyPreferences[dateKey] ?? [];
            const adaptive = recommendAdaptivePreferencesByRecentLogs(logs, dateKey);
            return mergePreferences(adaptive, byDate, externalSignalPreferences);
        },
        [dailyPreferences, logs, externalSignalPreferences]
    );

    const getAdjustedPlanWithoutNoRepeat = useCallback(
        (dateKey: string) => {
            if (dateKey === todayKey) {
                return optimizedToday;
            }
            const basePlan = generatePlanForDate(dateKey, stageType, previousMonthScore);
            const appliedPreferences = resolveAppliedPreferences(dateKey);
            return applyRecommendationAdjustments(basePlan, appliedPreferences, dateKey);
        },
        [todayKey, optimizedToday, stageType, previousMonthScore, resolveAppliedPreferences, applyRecommendationAdjustments]
    );

    const getRecentHistoryPlans = useCallback(
        (dateKey: string, todayOverridePlan?: DayPlan) =>
            Array.from({ length: NO_REPEAT_DAYS }, (_, index) => {
                const historyDateKey = offsetDateKey(dateKey, -(index + 1));
                if (todayOverridePlan && historyDateKey === todayKey) {
                    return todayOverridePlan;
                }
                return getAdjustedPlanWithoutNoRepeat(historyDateKey).plan;
            }).reverse(),
        [todayKey, getAdjustedPlanWithoutNoRepeat]
    );

    const optimizedTodayWithNoRepeat = useMemo(() => {
        const recentHistoryPlans = getRecentHistoryPlans(todayKey);
        const noRepeatAdjusted = applySevenDayNoRepeatRule(optimizedToday.plan, recentHistoryPlans, NO_REPEAT_DAYS);
        return {
            plan: noRepeatAdjusted.plan,
            notes: [...optimizedToday.notes, ...noRepeatAdjusted.notes],
        };
    }, [todayKey, optimizedToday, getRecentHistoryPlans]);

    const todayPlan = optimizedTodayWithNoRepeat.plan;

    const getPlanForDate = useCallback(
        (dateKey: string) => {
            if (dateKey === todayKey) {
                return todayPlan;
            }

            const adjusted = getAdjustedPlanWithoutNoRepeat(dateKey);
            const recentHistoryPlans = getRecentHistoryPlans(dateKey, todayPlan);
            return applySevenDayNoRepeatRule(adjusted.plan, recentHistoryPlans, NO_REPEAT_DAYS).plan;
        },
        [todayKey, todayPlan, getAdjustedPlanWithoutNoRepeat, getRecentHistoryPlans]
    );

    const getPlanNotesForDate = useCallback(
        (dateKey: string) => {
            if (dateKey === todayKey) {
                return optimizedTodayWithNoRepeat.notes;
            }

            const adjusted = getAdjustedPlanWithoutNoRepeat(dateKey);
            const recentHistoryPlans = getRecentHistoryPlans(dateKey, todayPlan);
            const noRepeatAdjusted = applySevenDayNoRepeatRule(adjusted.plan, recentHistoryPlans, NO_REPEAT_DAYS);
            return [...adjusted.notes, ...noRepeatAdjusted.notes];
        },
        [todayKey, optimizedTodayWithNoRepeat.notes, getAdjustedPlanWithoutNoRepeat, getRecentHistoryPlans, todayPlan]
    );

    const proposalWarnings = useMemo(() => {
        const warnings: string[] = [];
        const warningSet = new Set<string>();

        const addWarning = (text: string) => {
            if (warningSet.has(text)) {
                return;
            }
            warningSet.add(text);
            warnings.push(text);
        };

        const pastDateKeys = Array.from({ length: TWO_WEEK_DAYS }, (_, index) =>
            offsetDateKey(todayKey, index - (TWO_WEEK_DAYS - 1))
        );
        const futureDateKeys = Array.from({ length: TWO_WEEK_DAYS }, (_, index) =>
            offsetDateKey(todayKey, index + 1)
        );

        const planTexts: string[] = [];
        const futureMainFrequency = new Map<string, number>();

        const collectPlanText = (dateKey: string) => {
            const plan = getPlanForDate(dateKey);
            const text = SLOT_ORDER.flatMap((slot) => {
                if (slot === 'breakfast') {
                    return mealItemsFromSuggestion(plan.breakfast, slot);
                }
                if (slot === 'lunch') {
                    return mealItemsFromSuggestion(plan.lunch, slot);
                }
                if (slot === 'dinner') {
                    return mealItemsFromSuggestion(plan.dinner, slot);
                }
                return mealItemsFromSuggestion(plan.snack, slot);
            }).join(' ');

            planTexts.push(text);
            return plan;
        };

        pastDateKeys.forEach((dateKey) => {
            collectPlanText(dateKey);
        });

        futureDateKeys.forEach((dateKey) => {
            const plan = collectPlanText(dateKey);
            [plan.breakfast.main, plan.lunch.main, plan.dinner.main].forEach((main) => {
                futureMainFrequency.set(main, (futureMainFrequency.get(main) ?? 0) + 1);
            });
        });

        const eatenItems = pastDateKeys.flatMap((dateKey) => {
            const log = logs[dateKey];
            if (!log) {
                return [] as TrackItem[];
            }
            return eatenTrackItems(log);
        });
        const eatenText = eatenItems.map((item) => stripPortionLabel(item.name)).join(' ');

        const combinedText = `${planTexts.join(' ')} ${eatenText}`;
        const flourKeywords = ['빵', '라면', '면', '파스타', '피자', '도넛'];
        const sugarKeywords = ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림'];
        const proteinKeywords = ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유'];
        const riskyKeywords = ['매운', '튀김', '술', '소주', '맥주', '생회', '육회', '날달걀'];

        const flourSugarCount =
            countKeywords(combinedText, flourKeywords) + countKeywords(combinedText, sugarKeywords);

        if (flourSugarCount >= 10) {
            addWarning('최근 2주 식단과 기록을 보면 밀가루·단 음식이 잦아요. 오늘은 밥과 단백질 반찬 중심으로 맞춰 보세요.');
        }

        if (countKeywordsByItems(eatenItems, proteinKeywords) < 6) {
            addWarning('최근 2주 기록에서 단백질 반찬 체크가 적어요. 생선·두부·달걀 반찬을 하루 1~2개는 넣어 주세요.');
        }

        if (
            (stageType === 'chemo' || stageType === 'chemo_2nd' || stageType === 'radiation') &&
            includesAnyKeyword(combinedText, riskyKeywords)
        ) {
            addWarning('최근 2주 패턴에 자극적인 메뉴가 보여요. 치료 중에는 익힌 음식과 저자극 메뉴를 우선해 주세요.');
        }

        if (
            draftTodayPreferences.includes('spicy') &&
            (stageType === 'chemo' || stageType === 'chemo_2nd' || stageType === 'radiation')
        ) {
            addWarning('매운맛 선택 시 속 불편이 생길 수 있어요. 오늘은 매운 양념을 아주 약하게 조정해 드세요.');
        }

        if (draftTodayPreferences.includes('sashimi')) {
            addWarning('회 느낌을 선택해도 생식은 피하고 익힌 재료로만 구성해 주세요.');
        }

        if (
            (draftTodayPreferences.includes('pizza') ||
                draftTodayPreferences.includes('noodle') ||
                draftTodayPreferences.includes('sweet')) &&
            flourSugarCount >= 8
        ) {
            addWarning('선택한 방향과 최근 2주 패턴이 겹치면 부담이 커질 수 있어요. 오늘은 1끼만 가볍게 반영해 보세요.');
        }

        const maxFutureMainRepeat = Math.max(0, ...Array.from(futureMainFrequency.values()));
        if (maxFutureMainRepeat >= 5) {
            addWarning('앞뒤 식단에서 같은 주재료 반복이 많아요. 오늘 기록을 남기면 다음 추천에서 더 다양하게 조정해요.');
        }

        return warnings;
    }, [draftTodayPreferences, getPlanForDate, logs, stageType, todayKey]);

    const selectedPlan = useMemo(
        () => getPlanForDate(selectedDate),
        [getPlanForDate, selectedDate]
    );
    const selectedDateLabel = useMemo(() => formatDateLabel(selectedDate), [selectedDate]);

    const selectedLog = useMemo(
        () => logs[selectedDate] ?? buildDefaultLog(selectedDate, selectedPlan),
        [logs, selectedDate, selectedPlan]
    );
    const manualFoodCandidates = useMemo(() => {
        const names = new Set<string>();
        const addCandidate = (rawName: string) => {
            const normalized = normalizeManualMealName(stripPortionLabel(rawName));
            if (!normalized) {
                return;
            }
            names.add(normalized);
        };

        const planDateKeys = Array.from({ length: 21 }, (_, index) => offsetDateKey(todayKey, index - 10));
        planDateKeys.forEach((dateKey) => {
            const plan = getPlanForDate(dateKey);
            const meals: Record<MealSlot, MealPlanItem> = {
                breakfast: plan.breakfast,
                lunch: plan.lunch,
                dinner: plan.dinner,
                snack: plan.snack,
            };
            SLOT_ORDER.forEach((slot) => {
                mealItemsFromSuggestion(meals[slot], slot).forEach((name) => addCandidate(name));
            });
        });

        Object.values(logs).forEach((log) => {
            SLOT_ORDER.forEach((slot) => {
                log.meals[slot].forEach((item) => addCandidate(item.name));
            });
        });

        return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'));
    }, [todayKey, getPlanForDate, logs]);
    const manualMatchCandidatesBySlot = useMemo<Record<MealSlot, string[]>>(
        () =>
            SLOT_ORDER.reduce<Record<MealSlot, string[]>>(
                (acc, slot) => {
                    acc[slot] = searchManualFoodCandidates(newItemBySlot[slot], manualFoodCandidates);
                    return acc;
                },
                {
                    breakfast: [],
                    lunch: [],
                    dinner: [],
                    snack: [],
                }
            ),
        [newItemBySlot, manualFoodCandidates]
    );
    const viewedTodayDateKey = useMemo(
        () => offsetDateKey(todayKey, todayPlanOffset),
        [todayKey, todayPlanOffset]
    );
    const isViewingToday = todayPlanOffset === 0;
    const viewedTodayLabel = todayPlanOffset === -1 ? '어제' : todayPlanOffset === 1 ? '내일' : '오늘';
    const viewedTodayDateLabel = useMemo(
        () => formatDateLabel(viewedTodayDateKey),
        [viewedTodayDateKey]
    );
    const viewedTodayPlan = useMemo(
        () => (viewedTodayDateKey === todayKey ? todayPlan : getPlanForDate(viewedTodayDateKey)),
        [viewedTodayDateKey, todayKey, todayPlan, getPlanForDate]
    );
    const viewedTodayNotes = useMemo(
        () => getPlanNotesForDate(viewedTodayDateKey),
        [getPlanNotesForDate, viewedTodayDateKey]
    );
    const sortedMedicationSchedules = useMemo(
        () =>
            [...medicationSchedules].sort(
                (a, b) =>
                    MEDICATION_TIMING_ORDER.indexOf(a.timing) - MEDICATION_TIMING_ORDER.indexOf(b.timing) ||
                    a.category.localeCompare(b.category) ||
                    a.name.localeCompare(b.name)
            ),
        [medicationSchedules]
    );
    const medicationSchedulesByTiming = useMemo<Record<MedicationTiming, MedicationSchedule[]>>(
        () =>
            sortedMedicationSchedules.reduce<Record<MedicationTiming, MedicationSchedule[]>>(
                (acc, medication) => {
                    acc[medication.timing].push(medication);
                    return acc;
                },
                {
                    breakfast: [],
                    lunch: [],
                    dinner: [],
                }
            ),
        [sortedMedicationSchedules]
    );
    const selectedMedicationTakenSet = useMemo(
        () => new Set(selectedLog.medicationTakenIds ?? []),
        [selectedLog.medicationTakenIds]
    );
    const viewedTodayMedicationTakenSet = useMemo(
        () => new Set((logs[viewedTodayDateKey]?.medicationTakenIds ?? []) as string[]),
        [logs, viewedTodayDateKey]
    );

    const selectedAnalysis = useMemo(
        () => analyzeDay(selectedPlan, selectedLog, stageType),
        [selectedPlan, selectedLog, stageType]
    );
    const todayScore = useMemo(() => {
        const todayLog = logs[todayKey] ?? buildDefaultLog(todayKey, todayPlan);
        return analyzeDay(todayPlan, todayLog, stageType).dailyScore;
    }, [logs, todayKey, todayPlan, stageType]);

    const timingGuide = useMemo(() => getSnackCoffeeTimingGuide(stageType), [stageType]);
    const snackCoffeeRecommendedTime = useMemo(() => {
        if (stageType === 'chemo' || stageType === 'chemo_2nd') {
            return {
                snack: '14시~16시',
                coffee: '10시~11시',
            };
        }

        if (stageType === 'radiation') {
            return {
                snack: '14시~15시',
                coffee: '10시~11시',
            };
        }

        return {
            snack: '14시~16시',
            coffee: '9시~11시',
        };
    }, [stageType]);
    const foodGuides = useMemo(() => getStageFoodGuides(stageType), [stageType]);
    const openRecipeContent = useMemo<RecipeModalContent | null>(() => {
        if (!openRecipeSlot) {
            return null;
        }

        if (openRecipeSlot === 'coffee') {
            return {
                title: '커피 가이드',
                recipeName: '치료 중 커피 섭취 방법',
                recipeSteps: uniqueRecipeSteps([
                    timingGuide.coffee,
                    '식사 직후보다 1시간 뒤에 드세요.',
                    '가능하면 무가당/저당으로 연하게 드세요.',
                    '물 한 컵을 함께 마셔 수분을 보충해 주세요.',
                ]),
            };
        }

        if (openRecipeSlot === 'breakfast') {
            return {
                title: `${mealTypeLabel(openRecipeSlot)} 조리법`,
                recipeName: viewedTodayPlan.breakfast.recipeName,
                recipeSteps: uniqueRecipeSteps(viewedTodayPlan.breakfast.recipeSteps),
            };
        }
        if (openRecipeSlot === 'lunch') {
            return {
                title: `${mealTypeLabel(openRecipeSlot)} 조리법`,
                recipeName: viewedTodayPlan.lunch.recipeName,
                recipeSteps: uniqueRecipeSteps(viewedTodayPlan.lunch.recipeSteps),
            };
        }
        if (openRecipeSlot === 'dinner') {
            return {
                title: `${mealTypeLabel(openRecipeSlot)} 조리법`,
                recipeName: viewedTodayPlan.dinner.recipeName,
                recipeSteps: uniqueRecipeSteps(viewedTodayPlan.dinner.recipeSteps),
            };
        }

        return {
            title: `${mealTypeLabel(openRecipeSlot)} 조리법`,
            recipeName: viewedTodayPlan.snack.recipeName,
            recipeSteps: uniqueRecipeSteps(viewedTodayPlan.snack.recipeSteps),
        };
    }, [openRecipeSlot, timingGuide.coffee, viewedTodayPlan]);

    const weeklyScore = useMemo(() => {
        const base = new Date(todayKey);
        const scores: number[] = [];

        for (let offset = 0; offset < 7; offset += 1) {
            const date = new Date(base);
            date.setDate(base.getDate() - offset);
            const key = formatDateKey(date);
            const log = logs[key];
            if (!log) {
                continue;
            }
            const plan = getPlanForDate(key);
            scores.push(analyzeDay(plan, log, stageType).dailyScore);
        }

        if (scores.length === 0) {
            return 0;
        }

        return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    }, [todayKey, logs, stageType, getPlanForDate]);

    const monthlyScore = useMemo(() => {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        const lastDay = new Date(year, month + 1, 0).getDate();
        const scores: number[] = [];

        for (let day = 1; day <= lastDay; day += 1) {
            const key = formatDateKey(new Date(year, month, day));
            const log = logs[key];
            if (!log) {
                continue;
            }
            const plan = getPlanForDate(key);
            scores.push(analyzeDay(plan, log, stageType).dailyScore);
        }

        if (scores.length === 0) {
            return 0;
        }

        return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    }, [logs, stageType, getPlanForDate]);

    const totalScore = useMemo(() => {
        const keys = Object.keys(logs);
        if (keys.length === 0) {
            return 0;
        }

        const scores = keys.map((key) => {
            const plan = getPlanForDate(key);
            return analyzeDay(plan, logs[key], stageType).dailyScore;
        });

        return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
    }, [logs, stageType, getPlanForDate]);

    // const expectedPercentile = useMemo(() => scoreToPercentile(monthlyScore), [monthlyScore]);
    // const expectedRank = useMemo(
    //     () => Math.max(1, Math.round(((100 - expectedPercentile) / 100) * 500 + 1)),
    //     [expectedPercentile]
    // );

    const recentDateKeys = useMemo(() => {
        const base = new Date(todayKey);
        const keys: string[] = [];
        for (let offset = -3; offset <= 3; offset += 1) {
            const date = new Date(base);
            date.setDate(base.getDate() + offset);
            const key = formatDateKey(date);
            if (key >= accountStartDateKey) {
                keys.push(key);
            }
        }
        return keys;
    }, [todayKey, accountStartDateKey]);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        setError('');
        setMessage('');

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
        const createdAt = userData.user.created_at;
        const createdAtDateKey =
            typeof createdAt === 'string' && createdAt.length >= 10
                ? createdAt.slice(0, 10)
                : todayKey;
        setAccountStartDateKey(createdAtDateKey);
        const metadata = readIamfineMetadata(userData.user.user_metadata);
        const localTreatmentMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
        const resolvedTreatmentMeta = metadata.treatmentMeta ?? localTreatmentMeta;
        setTreatmentMeta(resolvedTreatmentMeta);

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
        const resolvedMedications = store.medications.length > 0 ? store.medications : metadata.medications;
        const resolvedMedicationSchedules =
            store.medicationSchedules.length > 0 ? store.medicationSchedules : metadata.medicationSchedules;
        const syncPatch: Partial<{
            treatmentMeta: TreatmentMeta;
            medications: string[];
            medicationSchedules: MedicationSchedule[];
        }> = {};
        if (!metadata.treatmentMeta && localTreatmentMeta) {
            syncPatch.treatmentMeta = localTreatmentMeta;
        }
        if (metadata.medications.length === 0 && store.medications.length > 0) {
            syncPatch.medications = store.medications;
        }
        if (metadata.medicationSchedules.length === 0 && store.medicationSchedules.length > 0) {
            syncPatch.medicationSchedules = store.medicationSchedules;
        }
        if (Object.keys(syncPatch).length > 0) {
            const updatedMetadata = buildUpdatedUserMetadata(userData.user.user_metadata, syncPatch);
            await supabase.auth.updateUser({
                data: updatedMetadata,
            });
        }

        if (!localTreatmentMeta && resolvedTreatmentMeta) {
            localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
        }
        if (
            (store.medications.length === 0 && resolvedMedications.length > 0) ||
            (store.medicationSchedules.length === 0 && resolvedMedicationSchedules.length > 0)
        ) {
            localStorage.setItem(
                getStoreKey(uid),
                JSON.stringify({
                    ...store,
                    medications: resolvedMedications,
                    medicationSchedules: resolvedMedicationSchedules,
                } satisfies DietStore)
            );
        }

        setLogs(store.logs);
        setMedications(resolvedMedications);
        setMedicationSchedules(resolvedMedicationSchedules);
        setDailyPreferences(store.dailyPreferences);
        setCarryPreferences([]);
        setDraftTodayPreferences([]);
        setProposalRequested(false);

        setStoreReady(true);
        setLoading(false);
    }, [todayKey]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadInitial();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [loadInitial]);

    useEffect(() => {
        if (!storeReady || !userId) {
            return;
        }

        const storeKey = getStoreKey(userId);
        const latestStored = parseStore(localStorage.getItem(storeKey));
        const payload: DietStore = {
            logs,
            medications: latestStored.medications,
            medicationHistory: latestStored.medicationHistory,
            medicationSchedules: latestStored.medicationSchedules,
            preferences: latestStored.preferences,
            dailyPreferences,
            carryPreferences,
        };

        localStorage.setItem(storeKey, JSON.stringify(payload));
    }, [storeReady, userId, logs, dailyPreferences, carryPreferences]);

    useEffect(() => {
        if (loading || !openRecordView) {
            return;
        }

        const timer = window.setTimeout(() => {
            document.getElementById('today-record-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 120);

        return () => window.clearTimeout(timer);
    }, [loading, openRecordView]);

    const updateCurrentLog = (updater: (current: DayLog) => DayLog) => {
        setLogs((prev) => {
            const current = prev[selectedDate] ?? buildDefaultLog(selectedDate, selectedPlan);
            const updated = updater(current);
            return {
                ...prev,
                [selectedDate]: updated,
            };
        });
    };

    const toggleDraftTodayPreference = (pref: PreferenceType) => {
        setProposalRequested(false);
        setDraftTodayPreferences((prev) => {
            if (prev.includes(pref)) {
                return prev.filter((item) => item !== pref);
            }
            return [...prev, pref];
        });
    };

    const setTodayDietMode = (checked: boolean) => {
        setError('');
        setProposalRequested(false);
        setDailyPreferences((prev) => {
            const current = prev[todayKey] ?? [];
            const next = checked
                ? mergePreferences(current, ['weight_loss'])
                : current.filter((item) => item !== 'weight_loss');
            return {
                ...prev,
                [todayKey]: next,
            };
        });
        setDraftTodayPreferences((prev) =>
            checked ? mergePreferences(prev, ['weight_loss']) : prev.filter((item) => item !== 'weight_loss')
        );
        setMessage(checked ? '다이어트 체크를 적용해 체중감량형 식단으로 조정했어요.' : '다이어트 체크를 해제해 기본 식단으로 복원했어요.');
    };

    const applyRecentRecordRecommendation = () => {
        setError('');
        setMessage('');
        setProposalRequested(false);
        setDraftTodayPreferences(mergePreferences(userSelectedTodayPreferences, recentRecordRecommendations));
        setMessage('최근 기록 기반 추천을 오늘 방향에 적용했어요.');
    };

    const requestTodayProposal = () => {
        setError('');
        setMessage('');
        setProposalRequested(true);

        if (draftTodayPreferences.length === 0) {
            setMessage('원하는 방향을 선택하면 당일 수정 제안을 볼 수 있어요.');
            return;
        }

        setMessage('수정 제안을 준비했어요. 아래 버튼으로 오늘 식단 변경을 확정해 주세요.');
    };

    const confirmTodayPlanChange = () => {
        setError('');
        setMessage('');

        if (!proposalRequested) {
            setError('먼저 수정 제안을 요청해 주세요.');
            return;
        }

        if (draftTodayPreferences.length === 0) {
            setError('원하는 방향을 하나 이상 선택해 주세요.');
            return;
        }

        const confirmed = window.confirm(
            '선택한 방향으로 오늘 식단을 변경할까요?\n확정하면 이후 식단 추천에도 참고돼요.'
        );

        if (!confirmed) {
            return;
        }

        const confirmedPreferences = mergePreferences(userSelectedTodayPreferences, draftTodayPreferences);
        setDailyPreferences((prev) => ({
            ...prev,
            [todayKey]: confirmedPreferences,
        }));
        setCarryPreferences([]);
        setProposalRequested(false);
        setMessage('오늘 식단 변경을 확정했어요. 해당 날짜 식단에 기록할게요.');
    };

    const toggleMealItem = (slot: MealSlot, itemId: string) => {
        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: current.meals[slot].map((item) =>
                    item.id === itemId
                        ? {
                              ...item,
                              eaten: !item.eaten,
                              notEaten: false,
                          }
                        : item
                ),
            },
        }));
    };

    const markMealAsNotEaten = (slot: MealSlot, itemId: string) => {
        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: current.meals[slot].map((item) =>
                    item.id === itemId
                        ? {
                              ...item,
                              eaten: false,
                              notEaten: !item.notEaten,
                          }
                        : item
                ),
            },
        }));
    };

    const setMealSlotStatus = (slot: MealSlot, status: 'eaten' | 'not_eaten' | 'reset') => {
        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: current.meals[slot].map((item) => {
                    if (status === 'eaten') {
                        return {
                            ...item,
                            eaten: true,
                            notEaten: false,
                        };
                    }
                    if (status === 'not_eaten') {
                        return {
                            ...item,
                            eaten: false,
                            notEaten: true,
                        };
                    }
                    return {
                        ...item,
                        eaten: false,
                        notEaten: false,
                    };
                }),
            },
        }));
    };

    const addMealItem = (slot: MealSlot, matchedFoodName?: string) => {
        const suggestedNames = manualMatchCandidatesBySlot[slot];
        const autoMatchedName =
            !matchedFoodName && suggestedNames.length > 0 ? suggestedNames[0] : undefined;
        const input = (matchedFoodName ?? autoMatchedName ?? newItemBySlot[slot]).trim();
        if (!input) {
            return;
        }
        const normalizedName = normalizeManualMealName(input);
        if (!normalizedName) {
            return;
        }

        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: [
                    ...current.meals[slot],
                    {
                        id: `${selectedDate}-${slot}-${Date.now()}`,
                        name: normalizedName,
                        eaten: true,
                        notEaten: false,
                        isManual: true,
                        servings: 1,
                    },
                ],
            },
        }));

        const typedRaw = newItemBySlot[slot].trim();
        if (
            (matchedFoodName || autoMatchedName) &&
            typedRaw &&
            normalizeManualMealName(typedRaw) !== normalizedName
        ) {
            setMessage(`입력한 "${typedRaw}"을 "${normalizedName}"(으)로 매칭해 기록했어요.`);
        }

        setNewItemBySlot((prev) => ({
            ...prev,
            [slot]: '',
        }));
    };

    const toggleMedicationTaken = (medicationId: string) => {
        updateCurrentLog((current) => {
            const currentTaken = current.medicationTakenIds ?? [];
            const takenSet = new Set(currentTaken);
            if (takenSet.has(medicationId)) {
                takenSet.delete(medicationId);
            } else {
                takenSet.add(medicationId);
            }

            return {
                ...current,
                medicationTakenIds: Array.from(takenSet),
            };
        });
    };

    const saveCurrentRecord = async () => {
        if (saving) {
            return;
        }
        setSaving(true);
        setError('');
        await new Promise((resolve) => window.setTimeout(resolve, 150));
        setSaving(false);
        setMessage('오늘 기록을 저장했어요. 잘하고 있어요.');
    };

    const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await saveCurrentRecord();
    };

    if (loading) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일의 연결 설정을 확인해 주세요.</p>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
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
            {!openRecordView && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setTodayPlanOffset((prev) => Math.max(-1, prev - 1))}
                                disabled={todayPlanOffset <= -1}
                                className="rounded-full border border-gray-300 bg-white p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                aria-label="어제 식단 보기"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{viewedTodayLabel} 식단</h1>
                            <button
                                type="button"
                                onClick={() => setTodayPlanOffset((prev) => Math.min(1, prev + 1))}
                                disabled={todayPlanOffset >= 1}
                                className="rounded-full border border-gray-300 bg-white p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                aria-label="내일 식단 보기"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            {todayPlanOffset !== 0 && (
                                <button
                                    type="button"
                                    onClick={() => setTodayPlanOffset(0)}
                                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    오늘로
                                </button>
                            )}
                            <p className="ml-auto inline-flex shrink-0 rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1 text-sm font-semibold text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900">
                                {viewedTodayDateLabel}
                            </p>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                        {profile?.nickname && (
                            <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                                {profile.nickname} 님 맞춤 추천이에요.
                            </p>
                        )}
                    </div>
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                        <Link
                            href="/diet/report"
                            className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                        >
                            적용 근거 리포트
                        </Link>
                        <Link
                            href="/diet/calendar"
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            전체 식단표 보기
                        </Link>
                    </div>
                </div>

                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">다이어트 체크</p>
                            <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-200">
                                체크 시 식단을 체중감량형(단백질 유지·탄수화물 조절)으로 바꿔요.
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={todayDietModeChecked}
                            onChange={(event) => setTodayDietMode(event.target.checked)}
                            className="h-5 w-5 accent-blue-600"
                            aria-label="다이어트 체크"
                            disabled={!isViewingToday}
                        />
                    </label>
                    {adaptiveTodayPreferences.length > 0 && (
                        <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">
                            최근 기록 자동 반영: {adaptiveTodayPreferences.map((item) => preferenceLabel(item)).join(', ')}
                        </p>
                    )}
                    {!isViewingToday && (
                        <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">
                            다이어트 체크 변경은 오늘 식단에서만 가능해요.
                        </p>
                    )}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => {
                        const meal =
                            slot === 'breakfast'
                                ? viewedTodayPlan.breakfast
                                : slot === 'lunch'
                                  ? viewedTodayPlan.lunch
                                  : slot === 'dinner'
                                    ? viewedTodayPlan.dinner
                                    : viewedTodayPlan.snack;
                        const mealTileAccentClass =
                            slot === 'breakfast'
                                ? 'mealTileMono--mint'
                                : slot === 'lunch'
                                  ? 'mealTileMono--amber'
                                  : slot === 'dinner'
                                    ? 'mealTileMono--sky'
                                    : 'mealTileMono--rose';
                        const MealIcon =
                            slot === 'breakfast'
                                ? Sunrise
                                : slot === 'lunch'
                                  ? Sun
                                  : slot === 'dinner'
                                    ? Moon
                                    : Coffee;
                        const mealTimeBadges =
                            slot === 'breakfast'
                                ? ['7시~9시']
                                : slot === 'lunch'
                                  ? ['12시~1시']
                                  : slot === 'dinner'
                                    ? ['6시~7시']
                                    : [`간식 ${snackCoffeeRecommendedTime.snack}`, `커피 ${snackCoffeeRecommendedTime.coffee}`];
                        const showMedicationArea = slot === 'breakfast' || slot === 'lunch' || slot === 'dinner';
                        const mealMedicationList =
                            showMedicationArea
                                ? medicationSchedulesByTiming[slot]
                                : [];

                        return (
                            <article
                                key={slot}
                                className={`mealTileMono ${mealTileAccentClass} h-full`}
                            >
                                <div className="mealTileMono__header">
                                    <span className="mealTileMono__iconWrap" aria-hidden="true">
                                        <MealIcon className="mealTileMono__icon" />
                                    </span>
                                    <div className="flex flex-wrap items-start gap-1.5">
                                        <h2 className="mealTileMono__title text-base font-extrabold tracking-tight">{mealTypeLabel(slot)}</h2>
                                        {mealTimeBadges.map((badgeText) => (
                                            <span
                                                key={`${slot}-${badgeText}`}
                                                className="-mt-0.5 rounded-full border border-gray-300 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-200"
                                            >
                                                {badgeText}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="mealTileMono__body">
                                    <p className="text-base font-bold leading-snug">{meal.summary}</p>
                                    {slot !== 'snack' && <p className="mt-1 text-sm">반찬: {meal.sides.join(', ')}</p>}
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOpenPortionGuideContent({
                                                    title: `${mealTypeLabel(slot)} 권장 섭취량(1인 기준)`,
                                                    guide: mealPortionGuideFromPlan(meal, slot),
                                                })
                                            }
                                            className="w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                        >
                                            권장 섭취량
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOpenRecipeSlot(slot)}
                                            className="w-full cursor-pointer rounded-lg border border-gray-900 bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                                        >
                                            조리법
                                        </button>
                                    </div>
                                    {slot !== 'snack' && <MealNutrientBalance nutrient={meal.nutrient} />}
                                    <div className="mt-auto pt-3">
                                        {showMedicationArea && (
                                            <div className="mealTileMono__pillBox">
                                                <p className="font-semibold">식후 복용 약</p>
                                                {mealMedicationList.length === 0 ? (
                                                    <p className="mt-1">복용 약 없음</p>
                                                ) : (
                                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                                        {mealMedicationList.map((medication) => {
                                                            const taken = viewedTodayMedicationTakenSet.has(medication.id);
                                                            return (
                                                                <span
                                                                    key={medication.id}
                                                                    className={`rounded-full px-2 py-0.5 font-semibold ${
                                                                        taken ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-900'
                                                                    }`}
                                                                >
                                                                    {taken ? '복용 확인' : '복용 전'} · {medication.name}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>

                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">오늘 간식/커피 타이밍</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {snackCoffeeRecommendedTime.snack}</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {snackCoffeeRecommendedTime.coffee}</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {timingGuide.snack}</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {timingGuide.coffee}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setOpenRecipeSlot('coffee')}
                            className="cursor-pointer rounded-md border border-black bg-black px-2.5 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-800"
                        >
                            커피 가이드 보기
                        </button>
                    </div>
                </div>

                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                    <p className="font-semibold">{viewedTodayLabel} 식단 점검 로그</p>
                    <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                        암 종류/치료 단계/복용 정보를 기준으로 실제 반영된 항목이에요.
                    </p>
                    <div className="mt-2 space-y-1">
                        {viewedTodayNotes.length > 0 ? (
                            viewedTodayNotes.map((note) => <p key={note}>- {note}</p>)
                        ) : (
                            <p>- 개인 조건이 없거나 매칭되지 않아 기본 안전식 기준으로 추천됐어요.</p>
                        )}
                    </div>
                </div>

            </section>
            )}

            {openRecipeContent && openRecipeSlot && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setOpenRecipeSlot(null)}
                >
                    <section
                        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{openRecipeContent.title}</h2>
                        <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {openRecipeContent.recipeName}
                        </p>
                        <div className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {openRecipeContent.recipeSteps.map((step, index) => (
                                <p key={`${openRecipeContent.recipeName}-${index}`}>- {step}</p>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setOpenRecipeSlot(null)}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                닫기
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {openPortionGuideContent && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setOpenPortionGuideContent(null)}
                >
                    <section
                        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            {openPortionGuideContent.title}
                        </h2>
                        <div className="mt-3 space-y-2 text-base text-gray-800 dark:text-gray-100">
                            {openPortionGuideContent.guide.items.map((item) => (
                                <p key={`portion-modal-${item.name}`}>- {item.name}: {item.amount}</p>
                            ))}
                        </div>
                        {openPortionGuideContent.guide.notes.length > 0 && (
                            <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                {openPortionGuideContent.guide.notes.map((note) => (
                                    <p key={`portion-modal-note-${note}`}>· {note}</p>
                                ))}
                            </div>
                        )}
                        <div className="mt-4 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setOpenPortionGuideContent(null)}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                닫기
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {error && (
                <section
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                    <p className="text-sm font-semibold">{error}</p>
                </section>
            )}

            {message && (
                <section
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                    <p className="text-sm font-semibold">{message}</p>
                </section>
            )}

            {!openRecordView && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">오늘만 이렇게 먹을래요</h2>
                        <button
                            type="button"
                            aria-expanded={showTodayPreferencePanel}
                            onClick={() => setShowTodayPreferencePanel((prev) => !prev)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            {showTodayPreferencePanel ? '닫기' : '펼치기'}
                        </button>
                    </div>

                    {showTodayPreferencePanel && (
                        <>
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                이 선택은 오늘 식단에만 적용돼요. 다음 날에는 자동으로 초기화돼요.
                            </p>

                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-200">
                                <p className="font-semibold text-gray-900 dark:text-gray-100">최근 기록 기반 추천</p>
                                <p className="mt-1">
                                    {recentRecordRecommendations.length > 0
                                        ? recentRecordRecommendations.map((item) => preferenceLabel(item)).join(', ')
                                        : '아직 추천이 없어요.'}
                                </p>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                                {PREFERENCE_OPTIONS.map((option) => {
                                    const selected = draftTodayPreferences.includes(option.key);
                                    const recommended = recentRecordRecommendations.includes(option.key);
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => toggleDraftTodayPreference(option.key)}
                                            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                                selected
                                                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                                                    : recommended
                                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40'
                                                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 grid gap-2 text-sm text-gray-700 dark:text-gray-200 sm:grid-cols-2">
                                {PREFERENCE_OPTIONS.filter((option) => draftTodayPreferences.includes(option.key)).map((option) => (
                                    <p key={option.key}>- {option.guide}</p>
                                ))}
                                {draftTodayPreferences.length === 0 && (
                                    <p>- 선택한 방향이 없으면 균형형 기본 식단을 보여드려요.</p>
                                )}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={applyRecentRecordRecommendation}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    추천 적용
                                </button>
                                <button
                                    type="button"
                                    onClick={requestTodayProposal}
                                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    수정 제안 요청
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmTodayPlanChange}
                                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                                >
                                    오늘 식단 변경 확정
                                </button>
                            </div>

                            {proposalRequested &&
                                (proposedTodayOptimization.notes.length > 0 || proposalWarnings.length > 0) && (
                                    <div className="mt-3 space-y-2">
                                        {proposedTodayOptimization.notes.length > 0 && (
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                                <p className="font-semibold">당일 수정 제안</p>
                                                {proposedTodayOptimization.notes.map((note) => (
                                                    <p key={note}>- {note}</p>
                                                ))}
                                            </div>
                                        )}
                                        {proposalWarnings.length > 0 && (
                                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                                <p className="font-semibold">주의할 점(최근 2주 기준)</p>
                                                {proposalWarnings.map((warning) => (
                                                    <p key={warning}>- {warning}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
                                <p>
                                    최근 기록 추천:{' '}
                                    {recentRecordRecommendations.length > 0
                                        ? recentRecordRecommendations.map((item) => preferenceLabel(item)).join(', ')
                                        : '없음'}
                                </p>
                                <p>
                                    현재 확정된 오늘 방향:{' '}
                                    {confirmedTodayPreferences.length > 0
                                        ? confirmedTodayPreferences.map((key) => preferenceLabel(key)).join(', ')
                                        : '없음'}
                                </p>
                                <p className="mt-1">안내: 방향 선택은 날짜별로 기록되고 다음 날에는 기본값(미선택)으로 시작해요.</p>
                            </div>
                        </>
                    )}
                </section>
            )}

            {openRecordView && (
                <>
                    <section
                        id="today-record-section"
                        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">기록할 날짜 선택</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpenRecordPortionSlot(null);
                                    setShowRecordPlanModal(true);
                                }}
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                식단 보기
                            </button>
                        </div>
                        <div className="mt-3 overflow-x-auto pb-1">
                            <div className="inline-flex min-w-full gap-2">
                                {recentDateKeys.map((key) => {
                                    const isSelected = key === selectedDate;
                                    const isToday = key === todayKey;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setSelectedDate(key)}
                                            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                                isSelected
                                                    ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            {formatDateLabel(key)} {isToday ? '· 오늘' : ''}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {showRecordPlanModal && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                            onClick={() => {
                                setShowRecordPlanModal(false);
                                setOpenRecordPortionSlot(null);
                            }}
                        >
                            <section
                                className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-gray-900"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                            {selectedDateLabel} 식단 보기
                                        </h3>
                                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                            기록 중 참고가 필요할 때만 확인하고, 기록 완료를 우선해 주세요.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowRecordPlanModal(false);
                                            setOpenRecordPortionSlot(null);
                                        }}
                                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        닫기
                                    </button>
                                </div>

                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {(['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).map((slot) => {
                                        const meal =
                                            slot === 'breakfast'
                                                ? selectedPlan.breakfast
                                                : slot === 'lunch'
                                                  ? selectedPlan.lunch
                                                  : slot === 'dinner'
                                                    ? selectedPlan.dinner
                                                    : selectedPlan.snack;
                                        const mealPortionGuide = mealPortionGuideFromPlan(meal, slot);
                                        const isRecordPortionOpen = openRecordPortionSlot === slot;
                                        return (
                                            <article
                                                key={`record-plan-${slot}`}
                                                className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40"
                                            >
                                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{mealTypeLabel(slot)}</p>
                                                <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">{meal.summary}</p>
                                                {slot !== 'snack' && (
                                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">반찬: {meal.sides.join(', ')}</p>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenRecordPortionSlot((prev) => (prev === slot ? null : slot))}
                                                    className="mt-2 w-full cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                                >
                                                    권장 섭취량
                                                </button>
                                                {isRecordPortionOpen && (
                                                    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                                                        <div className="space-y-1">
                                                            {mealPortionGuide.items.map((item) => (
                                                                <p key={`record-inline-${slot}-portion-${item.name}`}>- {item.name}: {item.amount}</p>
                                                            ))}
                                                        </div>
                                                        {mealPortionGuide.notes.length > 0 && (
                                                            <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                                                                {mealPortionGuide.notes.map((note) => (
                                                                    <p key={`record-inline-${slot}-portion-note-${note}`}>· {note}</p>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                    탄수 {meal.nutrient.carb}% / 단백질 {meal.nutrient.protein}% / 지방 {meal.nutrient.fat}%
                                                </p>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    )}

                    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selectedDateLabel} 복용 약 체크</h2>
                        {sortedMedicationSchedules.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                등록된 복용 약이 없어요. 내 정보에서 먼저 등록해 주세요.
                            </p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {sortedMedicationSchedules.map((medication) => {
                                    const taken = selectedMedicationTakenSet.has(medication.id);
                                    return (
                                        <div
                                            key={medication.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/40"
                                        >
                                            <p className="text-sm text-gray-800 dark:text-gray-100">
                                                <span className="font-semibold">{medicationTimingLabel(medication.timing)}</span>
                                                {' · '}
                                                {medication.category}
                                                {' · '}
                                                {medication.name}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => toggleMedicationTaken(medication.id)}
                                                className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                                                    taken
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                {taken ? '복용했어요' : '복용 전'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={() => void saveCurrentRecord()}
                                disabled={saving}
                                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 sm:w-auto"
                            >
                                {saving ? '저장 중...' : '저장하기'}
                            </button>
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {selectedDateLabel} 식단 기록
                            </h2>
                            <button
                                type="button"
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                onClick={() => setShowNutrients((prev) => !prev)}
                            >
                                {showNutrients ? '영양 비율 숨기기' : '영양 비율 보기'}
                            </button>
                        </div>

                        {showNutrients && (
                            <div className="mt-3 grid gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
                                <p>아침: 탄수 {selectedPlan.breakfast.nutrient.carb}% / 단백질 {selectedPlan.breakfast.nutrient.protein}% / 지방 {selectedPlan.breakfast.nutrient.fat}%</p>
                                <p>점심: 탄수 {selectedPlan.lunch.nutrient.carb}% / 단백질 {selectedPlan.lunch.nutrient.protein}% / 지방 {selectedPlan.lunch.nutrient.fat}%</p>
                                <p>저녁: 탄수 {selectedPlan.dinner.nutrient.carb}% / 단백질 {selectedPlan.dinner.nutrient.protein}% / 지방 {selectedPlan.dinner.nutrient.fat}%</p>
                                <p>간식: 탄수 {selectedPlan.snack.nutrient.carb}% / 단백질 {selectedPlan.snack.nutrient.protein}% / 지방 {selectedPlan.snack.nutrient.fat}%</p>
                            </div>
                        )}

                        <form onSubmit={saveRecord} className="mt-4 space-y-4">
                            <div className="grid gap-3 lg:grid-cols-2">
                                {SLOT_ORDER.map((slot) => {
                                    const items = selectedLog.meals[slot];
                                    const eatenCount = items.filter((item) => item.eaten).length;
                                    const progress = items.length === 0 ? 0 : Math.round((eatenCount / items.length) * 100);

                                    return (
                                        <article
                                            key={slot}
                                            className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {mealTypeLabel(slot)}
                                                </p>
                                                <span className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                                    {progress}%
                                                </span>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'eaten')}
                                                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                                                >
                                                    전체 먹음
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'not_eaten')}
                                                    className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
                                                >
                                                    전체 안먹음
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'reset')}
                                                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                                >
                                                    초기화
                                                </button>
                                            </div>

                                            <div className="mt-2 h-2 w-full rounded bg-gray-200 dark:bg-gray-800">
                                                <div
                                                    className="h-2 rounded bg-blue-600 dark:bg-blue-500"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>

                                            <div className="mt-3 space-y-2">
                                                {items.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-gray-800 dark:bg-gray-900"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleMealItem(slot, item.id)}
                                                            className={`cursor-pointer min-w-[64px] rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                                                item.eaten
                                                                    ? 'bg-emerald-600 text-white'
                                                                    : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                            }`}
                                                        >
                                                            먹었어요
                                                        </button>
                                                        <p className="min-w-0 px-1 text-center text-sm leading-snug text-gray-800 dark:text-gray-100">{item.name}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => markMealAsNotEaten(slot, item.id)}
                                                            className={`cursor-pointer min-w-[64px] rounded-md border px-2 py-1 text-xs font-semibold ${
                                                                item.notEaten
                                                                    ? 'border-amber-400 bg-amber-400 text-amber-950 dark:border-amber-400 dark:bg-amber-400 dark:text-amber-950'
                                                                    : 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200'
                                                            }`}
                                                        >
                                                            안먹었어요
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                                <input
                                                    value={newItemBySlot[slot]}
                                                    onChange={(event) =>
                                                        setNewItemBySlot((prev) => ({
                                                            ...prev,
                                                            [slot]: event.target.value,
                                                        }))
                                                    }
                                                    onKeyDown={(event) => {
                                                        if (event.key !== 'Enter') {
                                                            return;
                                                        }
                                                        event.preventDefault();
                                                        addMealItem(slot);
                                                    }}
                                                    placeholder="먹은 음식 추가"
                                                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => addMealItem(slot)}
                                                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
                                                >
                                                    추가
                                                </button>
                                            </div>
                                            {newItemBySlot[slot].trim().length > 0 && (
                                                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/40">
                                                    <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                                                        유사 음식 선택
                                                    </p>
                                                    {manualMatchCandidatesBySlot[slot].length > 0 ? (
                                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                            {manualMatchCandidatesBySlot[slot].map((candidate) => (
                                                                <button
                                                                    key={`${slot}-${candidate}`}
                                                                    type="button"
                                                                    onClick={() => addMealItem(slot, candidate)}
                                                                    className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                                                >
                                                                    {candidate}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                            비슷한 후보가 없어요. 입력 후 추가하면 새 음식으로 기록돼요.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                직접 입력한 음식은 1인분 기준으로 분석해요.
                                            </p>
                                        </article>
                                    );
                                })}
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200 sm:w-auto"
                            >
                                {saving ? '저장 중...' : '저장하기'}
                            </button>
                        </form>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">오늘 분석</p>
                                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">추천 식단 매칭률: {selectedAnalysis.matchScore}%</p>
                                <p className="text-sm text-gray-700 dark:text-gray-200">오늘 식단 점수: {selectedAnalysis.dailyScore}점</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">주의/보완 포인트</p>
                                {selectedAnalysis.concerns.length === 0 &&
                                    selectedAnalysis.부족.length === 0 &&
                                    selectedAnalysis.과다.length === 0 && (
                                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">좋아요. 지금 패턴을 유지해 보세요.</p>
                                    )}
                                {selectedAnalysis.concerns.map((item) => (
                                    <p key={item} className="mt-1 text-sm text-red-700 dark:text-red-300">- {item}</p>
                                ))}
                                {selectedAnalysis.부족.map((item) => (
                                    <p key={item} className="mt-1 text-sm text-amber-700 dark:text-amber-300">- {item}</p>
                                ))}
                                {selectedAnalysis.과다.map((item) => (
                                    <p key={item} className="mt-1 text-sm text-blue-700 dark:text-blue-300">- {item}</p>
                                ))}
                            </div>
                        </div>
                    </section>

                </>
            )}

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="sectionTitleMono text-lg">도움되는 음식 / 주의 음식</h2>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="infoTileMono infoTileMono--good">
                        <p className="infoTileMono__title text-sm">
                            <span className="infoTileMono__badge" aria-hidden="true"></span>
                            도움되는 음식
                        </p>
                        <ul className="infoTileMono__list">
                            {foodGuides.help.map((item) => (
                                <li key={item} className="infoTileMono__item">{item}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="infoTileMono infoTileMono--caution">
                        <p className="infoTileMono__title text-sm">
                            <span className="infoTileMono__badge" aria-hidden="true"></span>
                            주의 음식
                        </p>
                        <ul className="infoTileMono__list">
                            {foodGuides.caution.map((item) => (
                                <li key={item} className="infoTileMono__item">{item}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {openRecordView && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">점수 보드</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-gray-500 dark:text-gray-400">오늘</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{todayScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-gray-500 dark:text-gray-400">최근 7일</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{weeklyScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-gray-500 dark:text-gray-400">이번 달</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{monthlyScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-gray-500 dark:text-gray-400">전체 평균</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{totalScore}점</p>
                        </div>
                        {/* 예상 순위 카드는 현재 비활성화 상태입니다.
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                            <p className="text-xs text-blue-700 dark:text-blue-300">예상 순위</p>
                            <p className="mt-1 text-xl font-bold text-blue-800 dark:text-blue-200">약 {expectedRank}등 (상위 {expectedPercentile}%)</p>
                        </div>
                        */}
                    </div>
                </section>
            )}

            <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
                <p className="font-semibold">개인 입력 반영 기준</p>
                <div className="mt-2 space-y-1">
                    {personalizationSummary.map((item) => (
                        <p key={item}>- {item}</p>
                    ))}
                </div>
            </section>
        </main>
    );
}
