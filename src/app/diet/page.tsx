'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Moon, Sun, Sunrise, Utensils } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { parseAdditionalConditionsFromUnknown, type AdditionalCondition } from '@/lib/additionalConditions';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

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

type DailyLogsStorageMode = 'unknown' | 'table' | 'metadata';

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

type TeaRecommendation = {
    name: string;
    reason: string;
};

type CustomAlertApiItem = {
    title: string;
};

type CustomAlertApiResponse = {
    items?: CustomAlertApiItem[];
};

type PortionGuideModalContent = {
    title: string;
    slot: MealSlot;
    guide: ReturnType<typeof mealPortionGuideFromPlan>;
    substitutes: Array<{
        hint: string;
        options: string[];
    }>;
};

type SubstituteGroup = {
    id: string;
    nutritionHint: string;
    keywords: readonly string[];
    options: readonly string[];
};

const DISCLAIMER_TEXT =
    '이 서비스는 참고용 식단/기록 도구이며, 치료·약물 관련 결정은 반드시 의료진과 상의하세요.';

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const DIET_DAILY_LOGS_TABLE = 'diet_daily_logs';
const USER_METADATA_NAMESPACE = 'iamfine';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const METADATA_DAILY_LOG_LIMIT = 60;
const RECORD_SAVE_SUCCESS_MESSAGE = '저장하였습니다. 같은 계정의 다른 기기에서도 확인할 수 있어요.';

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
const COMMON_MANUAL_FOOD_CANDIDATES = [
    '현미밥',
    '잡곡밥',
    '죽',
    '오트밀',
    '닭가슴살',
    '연어구이',
    '흰살생선찜',
    '두부조림',
    '달걀찜',
    '브로콜리찜',
    '당근볶음',
    '양배추볶음',
    '버섯볶음',
    '시금치나물',
    '오이무침',
    '채소수프',
    '된장국',
    '미역국',
    '콩나물국',
    '샐러드',
    '그릭요거트',
    '무가당 요거트',
    '두유',
    '바나나',
    '사과',
    '배',
    '키위',
    '오렌지',
    '오렌지주스',
    '토마토',
    '고구마',
    '감자',
    '견과류',
    '치킨',
    '후라이드치킨',
    '양념치킨',
    '간장치킨',
    '닭강정',
    '치킨너겟',
    '피자',
    '치즈피자',
    '페퍼로니피자',
    '불고기피자',
    '햄버거',
    '치즈버거',
    '감자튀김',
    '핫도그',
    '떡볶이',
    '라볶이',
    '순대',
    '튀김',
    '김밥',
    '참치김밥',
    '라면',
    '짜장면',
    '짬뽕',
    '우동',
    '파스타',
    '스파게티',
    '돈가스',
    '제육볶음',
    '불고기',
    '삼겹살',
    '족발',
    '보쌈',
    '아이스크림',
    '초콜릿',
    '쿠키',
    '케이크',
    '도넛',
    '빵',
    '크로와상',
    '와플',
    '붕어빵',
    '과자',
    '젤리',
    '콜라',
    '사이다',
    '탄산음료',
    '밀크티',
    '버블티',
    '커피',
    '라떼',
    '카페라떼',
    '아메리카노',
    '보리차',
    '카모마일차',
    '루이보스차',
    '페퍼민트차',
    '생강차',
    '레몬밤차',
    '주스',
    '맥주',
    '소주',
    '와인',
] as const;
const SUBSTITUTE_GROUPS: SubstituteGroup[] = [
    {
        id: 'grain',
        nutritionHint: '탄수화물 공급원군',
        keywords: ['밥', '죽', '오트밀', '국수', '덮밥', '고구마', '감자'],
        options: ['현미밥', '잡곡밥', '오트밀', '죽', '고구마', '감자'],
    },
    {
        id: 'protein',
        nutritionHint: '단백질 공급원군',
        keywords: ['닭', '생선', '연어', '흰살', '두부', '달걀', '계란', '소고기', '돼지'],
        options: ['닭가슴살', '연어구이', '흰살생선찜', '두부조림', '달걀찜'],
    },
    {
        id: 'vegetable',
        nutritionHint: '저열량 채소군',
        keywords: ['브로콜리', '당근', '양배추', '버섯', '시금치', '오이', '샐러드', '채소'],
        options: ['브로콜리찜', '당근볶음', '양배추볶음', '버섯볶음', '시금치나물', '오이무침', '샐러드'],
    },
    {
        id: 'soup',
        nutritionHint: '국/수프군',
        keywords: ['국', '수프', '탕', '미역', '된장', '콩나물'],
        options: ['된장국', '미역국', '콩나물국', '채소수프'],
    },
    {
        id: 'snack',
        nutritionHint: '간식 과일·유제품군',
        keywords: ['바나나', '사과', '배', '키위', '오렌지', '과일', '요거트', '두유', '견과'],
        options: ['바나나', '사과', '배', '키위', '오렌지', '그릭요거트', '무가당 요거트', '두유', '견과류'],
    },
];

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

function buildDailyTeaRecommendations(stageType: StageType, plan: DayPlan): TeaRecommendation[] {
    const combinedText = [
        plan.breakfast.summary,
        plan.breakfast.soup,
        plan.lunch.summary,
        plan.lunch.soup,
        plan.dinner.summary,
        plan.dinner.soup,
        plan.snack.summary,
    ].join(' ');
    const recommendations: TeaRecommendation[] = [];
    const addRecommendation = (name: string, reason: string) => {
        if (recommendations.some((item) => item.name === name)) {
            return;
        }
        recommendations.push({ name, reason });
    };

    addRecommendation('보리차', '기본 수분 보충에 좋고 카페인이 없어요.');

    if (stageType === 'chemo' || stageType === 'chemo_2nd') {
        addRecommendation('카모마일차', '속이 예민한 날에 비교적 부담이 적은 무카페인 차예요.');
        addRecommendation('루이보스차', '저녁에도 마시기 쉬운 무카페인 차예요.');
    }

    if (stageType === 'radiation') {
        addRecommendation('배도라지차(무가당)', '목 건조감이 있는 날에 수분 보충용으로 좋아요.');
    }

    if (combinedText.includes('죽') || combinedText.includes('국') || combinedText.includes('수프')) {
        addRecommendation('생강차(연하게)', '따뜻한 온도로 소량 마시면 속이 편안한 데 도움이 돼요.');
    }

    if (combinedText.includes('요거트') || combinedText.includes('두유')) {
        addRecommendation('레몬밤차', '카페인 없이 가볍게 마시기 좋아요.');
    }

    if (combinedText.includes('튀김') || combinedText.includes('볶음') || combinedText.includes('매콤')) {
        addRecommendation('페퍼민트차(연하게)', '식후 더부룩함이 있을 때 부담을 줄이는 데 도움이 돼요.');
    }

    return recommendations.slice(0, 3);
}

function buildDailyCoffeeRecommendations(stageType: StageType, plan: DayPlan): TeaRecommendation[] {
    const combinedText = [
        plan.breakfast.summary,
        plan.lunch.summary,
        plan.dinner.summary,
        plan.snack.summary,
    ].join(' ');
    const recommendations: TeaRecommendation[] = [];
    const addRecommendation = (name: string, reason: string) => {
        if (recommendations.some((item) => item.name === name)) {
            return;
        }
        recommendations.push({ name, reason });
    };

    // 커피는 필수가 아니라 "원할 때만" 선택할 수 있는 옵션으로만 제안한다.
    addRecommendation('디카페인 아메리카노(연하게)', '카페인 민감도가 있는 날에 비교적 부담이 적은 선택지예요.');

    if (stageType !== 'chemo' && stageType !== 'chemo_2nd' && stageType !== 'radiation') {
        addRecommendation('연한 아메리카노(카페인, 소량)', '원할 때만 식후에 반 잔~한 잔 이내로 조심해서 마셔요.');
    }

    if (combinedText.includes('요거트') || combinedText.includes('두유') || combinedText.includes('수프')) {
        addRecommendation('디카페인 라떼(무가당, 저지방 우유/두유)', '속이 예민한 날에는 진하지 않게 소량으로 선택해요.');
    }

    return recommendations.slice(0, 2);
}

function coffeeGuidanceByStage(stageType: StageType) {
    if (stageType === 'chemo' || stageType === 'chemo_2nd' || stageType === 'radiation') {
        return '치료 중 커피는 필수가 아니며, 몸이 예민한 날은 커피를 쉬고 무카페인 차를 우선해 주세요.';
    }
    return '커피는 매일 마실 필요가 없고, 원할 때만 식후 1잔 이내로 제한해 늦은 오후·저녁은 피하세요.';
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

function stripLeadingFieldLabel(value: string, pattern: RegExp) {
    const normalized = value.trim();
    if (!normalized) {
        return '미입력';
    }
    const stripped = normalized.replace(pattern, '').trim();
    return stripped || '미입력';
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
            cancerType: parsed.cancerType.trim(),
            cancerStage: typeof parsed.cancerStage === 'string' ? parsed.cancerStage.trim() : '',
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

    return Array.from(
        new Set(
            raw.filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );
}

function parseMedicationSchedulesFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [];
    }

    const seen = new Set<string>();
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
        }))
        .filter((item) => {
            const key = `${item.timing}|${item.category.toLowerCase()}|${item.name.toLowerCase()}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
}

function parseDietSignalsFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as string[];
    }

    const normalized = raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);

    return Array.from(new Set(normalized)).slice(0, 8);
}

function normalizePreferenceList(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as PreferenceType[];
    }

    return Array.from(
        new Set(value.filter((item): item is PreferenceType => PREFERENCE_KEYS.has(item as PreferenceType)))
    );
}

function normalizeDailyPreferencesRecord(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {} as Record<string, PreferenceType[]>;
    }

    return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([dateKey, values]) => [
            dateKey,
            normalizePreferenceList(values),
        ])
    );
}

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
            additionalConditions: [] as AdditionalCondition[],
            recentDietSignals: [] as string[],
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            dailyLogs: {} as Record<string, DayLog>,
        };
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
            additionalConditions: [] as AdditionalCondition[],
            recentDietSignals: [] as string[],
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            dailyLogs: {} as Record<string, DayLog>,
        };
    }

    const scoped = namespaced as Record<string, unknown>;
    return {
        treatmentMeta: parseTreatmentMetaFromUnknown(scoped.treatmentMeta),
        medications: parseMedicationNamesFromUnknown(scoped.medications),
        medicationSchedules: parseMedicationSchedulesFromUnknown(scoped.medicationSchedules),
        additionalConditions: parseAdditionalConditionsFromUnknown(scoped.additionalConditions),
        recentDietSignals: parseDietSignalsFromUnknown(scoped.recentDietSignals),
        dailyPreferences: normalizeDailyPreferencesRecord(scoped.dailyPreferences),
        dailyLogs: parseMetadataDailyLogsFromUnknown(scoped.dailyLogs),
    };
}

function buildUpdatedUserMetadata(
    raw: unknown,
    patch: Partial<{
        treatmentMeta: TreatmentMeta;
        medications: string[];
        medicationSchedules: MedicationSchedule[];
        additionalConditions: AdditionalCondition[];
        recentDietSignals: string[];
        dailyPreferences: Record<string, PreferenceType[]>;
        dailyLogs: Record<string, DayLog>;
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

function isRecordObject(raw: unknown): raw is Record<string, unknown> {
    return Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
}

function normalizeMedicationNames(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as string[];
    }

    return Array.from(
        new Set(
            raw.filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );
}

function parseMedicationHistoryFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as MedicationHistory[];
    }

    return raw
        .filter((item): item is MedicationHistory => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return false;
            }
            const candidate = item as Partial<MedicationHistory>;
            if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
                return false;
            }
            if (candidate.action !== 'add' && candidate.action !== 'remove') {
                return false;
            }
            if (typeof candidate.date !== 'string' || !Number.isFinite(Date.parse(candidate.date))) {
                return false;
            }
            return true;
        })
        .map((item) => ({
            name: item.name.trim(),
            action: item.action,
            date: item.date,
        }));
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
        const parsedLogs =
            parsed.logs && typeof parsed.logs === 'object' && !Array.isArray(parsed.logs)
                ? Object.entries(parsed.logs as Record<string, unknown>).reduce(
                      (acc, [dateKey, value]) => {
                          if (!DATE_KEY_PATTERN.test(dateKey)) {
                              return acc;
                          }
                          const parsedLog = parseDayLogFromUnknown(value, dateKey);
                          if (!parsedLog) {
                              return acc;
                          }
                          acc[dateKey] = parsedLog;
                          return acc;
                      },
                      {} as Record<string, DayLog>
                  )
                : {};
        const normalizedMedications = normalizeMedicationNames(parsed.medications);
        const fallbackMedicationNamesFromSchedules = Array.from(
            new Set(medicationSchedules.map((item) => item.name.trim()).filter(Boolean))
        );
        const mergedMedicationNames =
            normalizedMedications.length > 0 ? normalizedMedications : fallbackMedicationNamesFromSchedules;

        return {
            logs: parsedLogs,
            medications: mergedMedicationNames,
            medicationHistory: parseMedicationHistoryFromUnknown(parsed.medicationHistory),
            medicationSchedules,
            preferences: legacyPreferences,
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
        };
    } catch {
        return DEFAULT_STORE;
    }
}

function parseTrackItemsFromUnknown(raw: unknown, slot: MealSlot, dateKey: string) {
    if (!Array.isArray(raw)) {
        return [] as TrackItem[];
    }

    return raw
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item, index): TrackItem | null => {
            const candidate = item as Partial<TrackItem>;
            const normalizedName =
                typeof candidate.name === 'string' ? candidate.name.replace(/\s+/g, ' ').trim() : '';
            if (!normalizedName) {
                return null;
            }
            const eaten = Boolean(candidate.eaten);
            const notEaten = eaten ? false : Boolean(candidate.notEaten);

            return {
                id:
                    typeof candidate.id === 'string' && candidate.id.trim()
                        ? candidate.id
                        : `${dateKey}-${slot}-server-${index}`,
                name: normalizedName,
                eaten,
                notEaten,
                isManual: Boolean(candidate.isManual),
                servings:
                    typeof candidate.servings === 'number' && Number.isFinite(candidate.servings)
                        ? Math.max(1, Math.min(8, Math.round(candidate.servings)))
                        : 1,
            } satisfies TrackItem;
        })
        .filter((item): item is TrackItem => Boolean(item));
}

function parseDayLogFromUnknown(raw: unknown, dateKey: string): DayLog | null {
    let normalizedRaw = raw;
    if (typeof normalizedRaw === 'string') {
        try {
            normalizedRaw = JSON.parse(normalizedRaw) as unknown;
        } catch {
            return null;
        }
    }

    if (!isRecordObject(normalizedRaw)) {
        return null;
    }

    const candidate = normalizedRaw as Partial<DayLog>;
    const mealsRaw =
        isRecordObject(candidate.meals)
            ? (candidate.meals as Partial<Record<MealSlot, unknown>>)
            : {};

    return {
        meals: {
            breakfast: parseTrackItemsFromUnknown(mealsRaw.breakfast, 'breakfast', dateKey),
            lunch: parseTrackItemsFromUnknown(mealsRaw.lunch, 'lunch', dateKey),
            dinner: parseTrackItemsFromUnknown(mealsRaw.dinner, 'dinner', dateKey),
            snack: parseTrackItemsFromUnknown(mealsRaw.snack, 'snack', dateKey),
        },
        memo: typeof candidate.memo === 'string' ? candidate.memo.trim() : '',
        medicationTakenIds: Array.isArray(candidate.medicationTakenIds)
            ? Array.from(
                  new Set(
                      candidate.medicationTakenIds
                          .filter((item): item is string => typeof item === 'string')
                          .map((item) => item.trim())
                          .filter(Boolean)
                  )
              ).slice(0, 200)
            : [],
    };
}

function parseServerDietLogs(raw: unknown) {
    if (!Array.isArray(raw)) {
        return {} as Record<string, DayLog>;
    }

    return raw.reduce(
        (acc, item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return acc;
            }

            const row = item as {
                date_key?: unknown;
                log_payload?: unknown;
            };
            const dateKey = typeof row.date_key === 'string' ? row.date_key.trim() : '';
            if (!DATE_KEY_PATTERN.test(dateKey)) {
                return acc;
            }

            const parsedLog = parseDayLogFromUnknown(row.log_payload, dateKey);
            if (!parsedLog) {
                return acc;
            }

            acc[dateKey] = parsedLog;
            return acc;
        },
        {} as Record<string, DayLog>
    );
}

function compactMetadataDailyLogs(logs: Record<string, DayLog>) {
    const sortedKeys = Object.keys(logs)
        .filter((key) => DATE_KEY_PATTERN.test(key))
        .sort((a, b) => b.localeCompare(a))
        .slice(0, METADATA_DAILY_LOG_LIMIT);

    return sortedKeys.reduce(
        (acc, dateKey) => {
            const value = logs[dateKey];
            if (value) {
                acc[dateKey] = value;
            }
            return acc;
        },
        {} as Record<string, DayLog>
    );
}

function parseMetadataDailyLogsFromUnknown(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {} as Record<string, DayLog>;
    }

    const parsed = Object.entries(raw as Record<string, unknown>).reduce(
        (acc, [dateKey, value]) => {
            if (!DATE_KEY_PATTERN.test(dateKey)) {
                return acc;
            }

            const parsedLog = parseDayLogFromUnknown(value, dateKey);
            if (!parsedLog) {
                return acc;
            }

            acc[dateKey] = parsedLog;
            return acc;
        },
        {} as Record<string, DayLog>
    );

    return compactMetadataDailyLogs(parsed);
}

function areDailyLogsEqual(left: Record<string, DayLog>, right: Record<string, DayLog>) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }

    return leftKeys.every((key, index) => {
        const compareKey = rightKeys[index];
        if (key !== compareKey) {
            return false;
        }
        return JSON.stringify(left[key]) === JSON.stringify(right[compareKey]);
    });
}

function isDietLogTableMissingError(raw: unknown) {
    if (!raw || typeof raw !== 'object') {
        return false;
    }

    const candidate = raw as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
    };

    if (candidate.code === 'PGRST205') {
        return true;
    }

    const message = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase();
    if (!message.includes(DIET_DAILY_LOGS_TABLE)) {
        return false;
    }

    return (
        message.includes('not found') ||
        message.includes('could not find') ||
        message.includes('relation') ||
        message.includes('does not exist')
    );
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

function hasMeaningfulDayLog(log: DayLog) {
    if (log.memo.trim().length > 0) {
        return true;
    }

    if ((log.medicationTakenIds ?? []).length > 0) {
        return true;
    }

    return SLOT_ORDER.some((slot) =>
        log.meals[slot].some((item) => {
            if (item.eaten) {
                return true;
            }
            if (item.notEaten) {
                return true;
            }
            if (item.isManual) {
                return true;
            }
            return typeof item.servings === 'number' && Number.isFinite(item.servings) && item.servings !== 1;
        })
    );
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
    const compactQuery = compactFoodText(normalizedQuery);
    const minimumScore = compactQuery.length <= 2 ? 0.22 : compactQuery.length <= 3 ? 0.3 : 0.42;
    const quickMatches = candidates
        .filter((name) => {
            const normalizedCandidate = compactFoodText(name);
            return normalizedCandidate.includes(compactQuery);
        })
        .sort((a, b) => a.length - b.length || a.localeCompare(b, 'ko'))
        .slice(0, maxResults);

    const ranked = candidates
        .map((name) => ({
            name,
            score: foodNameSimilarityScore(normalizedQuery, name),
        }))
        .filter((item) => item.score >= minimumScore)
        .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko'))
        .slice(0, maxResults)
        .map((item) => item.name);

    return Array.from(new Set([...quickMatches, ...ranked])).slice(0, maxResults);
}

function findSubstituteGroup(foodName: string, slot: MealSlot) {
    const normalizedName = compactFoodText(stripPortionLabel(foodName));
    if (!normalizedName) {
        return null;
    }

    if (slot === 'snack') {
        const snackGroup = SUBSTITUTE_GROUPS.find((group) => group.id === 'snack');
        if (snackGroup) {
            return snackGroup;
        }
    }

    return (
        SUBSTITUTE_GROUPS.find((group) =>
            group.keywords.some((keyword) => normalizedName.includes(compactFoodText(keyword)))
        ) ?? null
    );
}

function buildSubstituteCandidates(foodName: string, slot: MealSlot, fallbackCandidates: string[]) {
    const normalizedCurrent = normalizeManualMealName(stripPortionLabel(foodName));
    const matchedGroup = findSubstituteGroup(normalizedCurrent, slot);
    const groupCandidates = (matchedGroup?.options ?? [])
        .map((name) => normalizeManualMealName(name))
        .filter(Boolean)
        .filter((name) => name !== normalizedCurrent);

    const similarCandidates = searchManualFoodCandidates(normalizedCurrent, fallbackCandidates, 8)
        .map((name) => normalizeManualMealName(name))
        .filter((name) => name && name !== normalizedCurrent);

    const merged = Array.from(new Set([...groupCandidates, ...similarCandidates])).slice(0, 8);

    return {
        hint: matchedGroup?.nutritionHint ?? '비슷한 영양군',
        options: merged,
    };
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
    const pizzaCount = countKeywordsByItems(eatenItems, ['피자', '치즈피자', '페퍼로니피자', '불고기피자']);
    const friedChickenCount = countKeywordsByItems(eatenItems, ['치킨', '후라이드치킨', '양념치킨', '간장치킨', '닭강정']);
    const sandwichCount = countKeywordsByItems(eatenItems, ['샌드위치', '햄버거', '치즈버거', '토스트']);
    const beefCount = countKeywordsByItems(eatenItems, ['소고기', '불고기', '스테이크', '안심']);
    const porkCount = countKeywordsByItems(eatenItems, ['돼지고기', '삼겹살', '목살', '제육', '돈가스']);
    const chickenCount = countKeywordsByItems(eatenItems, ['닭고기', '닭가슴살', '닭다리', '닭안심']);
    const duckCount = countKeywordsByItems(eatenItems, ['오리고기', '오리', '훈제오리']);

    if (pizzaCount >= 2) {
        add('pizza');
    }
    if (friedChickenCount >= 2) {
        add('fried_chicken');
    }
    if (sandwichCount >= 2) {
        add('sandwich');
    }
    if (beefCount >= 2) {
        add('beef');
    }
    if (porkCount >= 2) {
        add('pork');
    }
    if (chickenCount >= 3 && friedChickenCount < 2) {
        add('chicken');
    }
    if (duckCount >= 2) {
        add('duck');
    }

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

    return suggestions.slice(0, 8);
}

const PREFERENCE_TO_DIET_SIGNAL: Partial<Record<PreferenceType, string>> = {
    healthy: '건강식',
    vegetable: '채소 보강',
    high_protein: '단백질 보강',
    digestive: '소화 편한 식사',
    low_salt: '저염식',
    fish: '생선/해산물',
    spicy: '매운맛',
    sweet: '단맛',
    noodle: '면 요리',
    pizza: '피자',
    fried_chicken: '치킨',
    sandwich: '샌드위치',
    beef: '소고기',
    pork: '돼지고기',
    chicken: '닭고기',
    duck: '오리고기',
};

function buildRecentDietSignalsFromLogs(logs: Record<string, DayLog>, referenceDateKey: string) {
    const hasEatenInLookback = Array.from({ length: TWO_WEEK_DAYS }, (_, index) => {
        const dateKey = offsetDateKey(referenceDateKey, -index);
        const log = logs[dateKey];
        return log ? eatenTrackItems(log).length > 0 : false;
    }).some(Boolean);

    if (!hasEatenInLookback) {
        return [] as string[];
    }

    const preferenceSignals = recommendPreferencesByRecentLogs(logs, referenceDateKey)
        .map((preference) => PREFERENCE_TO_DIET_SIGNAL[preference] ?? preferenceLabel(preference))
        .map((item) => item.trim())
        .filter(Boolean);

    return Array.from(new Set(preferenceSignals)).slice(0, 8);
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

function plannedNamesBySlot(plan: DayPlan, slot: MealSlot) {
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
}

function replacementMatchScore(expectedName: string, eatenName: string, slot: MealSlot) {
    const normalizedExpected = normalizeManualMealName(stripPortionLabel(expectedName));
    const normalizedEaten = normalizeManualMealName(stripPortionLabel(eatenName));
    if (!normalizedExpected || !normalizedEaten) {
        return 0;
    }

    let score = foodNameSimilarityScore(normalizedExpected, normalizedEaten);
    if (normalizedExpected.includes(normalizedEaten) || normalizedEaten.includes(normalizedExpected)) {
        score = Math.max(score, 0.8);
    }

    const expectedGroup = findSubstituteGroup(normalizedExpected, slot);
    const eatenGroup = findSubstituteGroup(normalizedEaten, slot);
    if (expectedGroup && eatenGroup && expectedGroup.id === eatenGroup.id) {
        score = Math.max(score, 0.74);
    }

    return clamp(score, 0, 1);
}

function countSlotCoveredItems(plan: DayPlan, log: DayLog, slot: MealSlot) {
    const expectedItems = plannedNamesBySlot(plan, slot).map((name) => stripPortionLabel(name).trim()).filter(Boolean);
    if (expectedItems.length === 0) {
        return {
            covered: 0,
            total: 0,
        };
    }

    const eatenCandidates = log.meals[slot]
        .filter((item) => item.eaten)
        .map((item) => stripPortionLabel(item.name).trim())
        .filter(Boolean);
    const usedCandidateIndexes = new Set<number>();
    let covered = 0;

    expectedItems.forEach((expectedItem) => {
        let bestCandidateIndex = -1;
        let bestScore = 0;

        eatenCandidates.forEach((candidate, index) => {
            if (usedCandidateIndexes.has(index)) {
                return;
            }

            const score = replacementMatchScore(expectedItem, candidate, slot);
            if (score > bestScore) {
                bestScore = score;
                bestCandidateIndex = index;
            }
        });

        if (bestCandidateIndex >= 0 && bestScore >= 0.68) {
            usedCandidateIndexes.add(bestCandidateIndex);
            covered += 1;
        }
    });

    return {
        covered,
        total: expectedItems.length,
    };
}

function computePlanCoverage(plan: DayPlan, log: DayLog) {
    let covered = 0;
    let total = 0;
    const bySlot = {
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        snack: 0,
    } satisfies Record<MealSlot, number>;

    SLOT_ORDER.forEach((slot) => {
        const slotCoverage = countSlotCoveredItems(plan, log, slot);
        covered += slotCoverage.covered;
        total += slotCoverage.total;
        bySlot[slot] = slotCoverage.total === 0 ? 0 : Math.round((slotCoverage.covered / slotCoverage.total) * 100);
    });

    return {
        covered,
        total,
        percent: total === 0 ? 0 : Math.round((covered / total) * 100),
        bySlot,
    };
}

function calcMatchScore(plan: DayPlan, log: DayLog) {
    const eaten = eatenNames(log);
    if (eaten.length === 0) {
        return 0;
    }

    const coverage = computePlanCoverage(plan, log);
    return clamp(coverage.percent, 0, 100);
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
    const [dailyLogsStorageMode, setDailyLogsStorageMode] = useState<DailyLogsStorageMode>('unknown');
    const [userId, setUserId] = useState<string | null>(null);
    const [accountStartDateKey, setAccountStartDateKey] = useState(todayKey);
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stages, setStages] = useState<TreatmentStageRow[]>([]);

    const [logs, setLogs] = useState<Record<string, DayLog>>({});
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [additionalConditions, setAdditionalConditions] = useState<AdditionalCondition[]>([]);
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
    const [openSubstituteTarget, setOpenSubstituteTarget] = useState<{
        slot: MealSlot;
        itemId: string;
    } | null>(null);
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
    const [saveSuccessPopupOpen, setSaveSuccessPopupOpen] = useState(false);
    const [saveSuccessPopupMessage, setSaveSuccessPopupMessage] = useState('');
    const syncedLogSignaturesRef = useRef<Record<string, string>>({});
    const saveSuccessPopupTimerRef = useRef<number | null>(null);
    const lastManualAddRef = useRef<{
        slot: MealSlot;
        name: string;
        at: number;
    } | null>(null);
    const recordDateScrollerRef = useRef<HTMLDivElement | null>(null);
    const recordDateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const openRecordView = searchParams.get('view') === 'record';

    const closeSaveSuccessPopup = useCallback(() => {
        if (saveSuccessPopupTimerRef.current !== null) {
            window.clearTimeout(saveSuccessPopupTimerRef.current);
            saveSuccessPopupTimerRef.current = null;
        }
        setSaveSuccessPopupOpen(false);
    }, []);

    const showSaveSuccessPopup = useCallback((text: string) => {
        setSaveSuccessPopupMessage(text);
        setSaveSuccessPopupOpen(true);
        if (saveSuccessPopupTimerRef.current !== null) {
            window.clearTimeout(saveSuccessPopupTimerRef.current);
        }
        saveSuccessPopupTimerRef.current = window.setTimeout(() => {
            setSaveSuccessPopupOpen(false);
            saveSuccessPopupTimerRef.current = null;
        }, 2600);
    }, []);

    useEffect(
        () => () => {
            if (saveSuccessPopupTimerRef.current !== null) {
                window.clearTimeout(saveSuccessPopupTimerRef.current);
            }
        },
        []
    );

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
        const contextAdditionalConditions = additionalConditions.map((item) => ({
            name: item.name,
            code: item.code,
            category: item.category,
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
            additionalConditions: contextAdditionalConditions,
        };
    }, [profile, treatmentMeta, activeStage, medicationSchedules, additionalConditions]);

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
        const ageText = stripLeadingFieldLabel(
            userDietContext.age && userDietContext.age > 0 ? `${userDietContext.age}세` : '미입력',
            /^나이\s*/u
        );
        const sexText = stripLeadingFieldLabel(
            userDietContext.sex === 'female'
                ? '여성'
                : userDietContext.sex === 'male'
                  ? '남성'
                  : userDietContext.sex === 'other'
                    ? '기타'
                    : '미입력',
            /^성별\s*/u
        );
        const heightText = stripLeadingFieldLabel(
            userDietContext.heightCm ? `${userDietContext.heightCm}cm` : '미입력',
            /^키\s*/u
        );
        const weightText = stripLeadingFieldLabel(
            userDietContext.weightKg ? `${userDietContext.weightKg}kg` : '미입력',
            /^몸무게\s*/u
        );
        const ethnicityText = stripLeadingFieldLabel(
            userDietContext.ethnicity?.trim() ? userDietContext.ethnicity.trim() : '미입력',
            /^(인종\s*[·/]\s*배경|인종\s*배경|인종|배경)\s*[:：-]?\s*/u
        );
        const cancerTypeText = stripLeadingFieldLabel(
            userDietContext.cancerType?.trim() ? userDietContext.cancerType.trim() : '미입력',
            /^(암\s*종류|암종)\s*[:：-]?\s*/u
        );
        const stageLabel = activeStage?.stage_label?.trim() || '미입력';
        const medicationCount = medicationSchedules.length;
        const medicationTimingText =
            medicationCount === 0
                ? '미입력'
                : Array.from(new Set(medicationSchedules.map((item) => medicationTimingLabel(item.timing)))).join(', ');
        const additionalConditionText =
            additionalConditions.length === 0
                ? '없음'
                : Array.from(new Set(additionalConditions.map((item) => `${item.name}(${item.code})`))).join(', ');

        return [
            `기본 정보: ${ageText} / ${sexText} / ${heightText} / ${weightText} / ${ethnicityText}`,
            `치료 정보: ${cancerTypeText}`,
            `치료 단계: ${stageLabel}`,
            `복용 약 정보: ${medicationCount}개 / 복용 시기 ${medicationTimingText}`,
            `추가 질병 정보: ${additionalConditionText}`,
        ];
    }, [userDietContext, activeStage, medicationSchedules, additionalConditions]);

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
                if (!log || !hasMeaningfulDayLog(log)) {
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
                draftTodayPreferences.includes('fried_chicken') ||
                draftTodayPreferences.includes('sandwich') ||
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

        COMMON_MANUAL_FOOD_CANDIDATES.forEach((name) => addCandidate(name));

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
    const selectedSlotProgress = useMemo(
        () => computePlanCoverage(selectedPlan, selectedLog).bySlot,
        [selectedPlan, selectedLog]
    );
    const todayScore = useMemo(() => {
        const todayLog = logs[todayKey] ?? buildDefaultLog(todayKey, todayPlan);
        return analyzeDay(todayPlan, todayLog, stageType).dailyScore;
    }, [logs, todayKey, todayPlan, stageType]);

    const timingGuide = useMemo(() => getSnackCoffeeTimingGuide(stageType), [stageType]);
    const beverageCaution = useMemo(() => coffeeGuidanceByStage(stageType), [stageType]);
    const dailyTeaRecommendations = useMemo(
        () => buildDailyTeaRecommendations(stageType, viewedTodayPlan),
        [stageType, viewedTodayPlan]
    );
    const dailyCoffeeRecommendations = useMemo(
        () => buildDailyCoffeeRecommendations(stageType, viewedTodayPlan),
        [stageType, viewedTodayPlan]
    );
    const snackCoffeeRecommendedTime = useMemo(() => {
        if (stageType === 'chemo' || stageType === 'chemo_2nd') {
            return {
                snack: '14시~16시',
                coffee: '10시~11시(선택)',
                tea: '9시~18시(무카페인)',
            };
        }

        if (stageType === 'radiation') {
            return {
                snack: '14시~15시',
                coffee: '10시~11시(선택)',
                tea: '9시~18시(무카페인)',
            };
        }

        return {
            snack: '14시~16시',
            coffee: '9시~11시(선택)',
            tea: '9시~18시(무카페인)',
        };
    }, [stageType]);
    const foodGuides = useMemo(() => getStageFoodGuides(stageType), [stageType]);
    const openRecipeContent = useMemo<RecipeModalContent | null>(() => {
        if (!openRecipeSlot) {
            return null;
        }

        if (openRecipeSlot === 'coffee') {
            return {
                title: '선택 커피/차 가이드',
                recipeName: '치료 중 선택 음료(커피·차) 섭취 방법',
                recipeSteps: uniqueRecipeSteps([
                    timingGuide.coffee,
                    timingGuide.tea,
                    beverageCaution,
                    dailyCoffeeRecommendations.length > 0
                        ? `오늘 선택 커피: ${dailyCoffeeRecommendations.map((item) => item.name).join(', ')}`
                        : '커피는 필수가 아니며, 원할 때만 소량으로 선택해 주세요.',
                    dailyTeaRecommendations.length > 0
                        ? `오늘 선택 차: ${dailyTeaRecommendations.map((item) => item.name).join(', ')}`
                        : '차는 카페인 없는 종류를 우선해 주세요.',
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
    }, [
        openRecipeSlot,
        timingGuide.coffee,
        timingGuide.tea,
        beverageCaution,
        dailyCoffeeRecommendations,
        dailyTeaRecommendations,
        viewedTodayPlan,
    ]);

    const weeklyScore = useMemo(() => {
        const base = new Date(todayKey);
        const scores: number[] = [];

        for (let offset = 0; offset < 7; offset += 1) {
            const date = new Date(base);
            date.setDate(base.getDate() - offset);
            const key = formatDateKey(date);
            const log = logs[key];
            if (!log || !hasMeaningfulDayLog(log)) {
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
            if (!log || !hasMeaningfulDayLog(log)) {
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
        const meaningfulLogEntries = Object.entries(logs).filter(([, log]) => hasMeaningfulDayLog(log));
        if (meaningfulLogEntries.length === 0) {
            return 0;
        }

        const scores = meaningfulLogEntries.map(([key, log]) => {
            const plan = getPlanForDate(key);
            return analyzeDay(plan, log, stageType).dailyScore;
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
        for (let offset = 0; offset <= 6; offset += 1) {
            const date = new Date(base);
            date.setDate(base.getDate() - offset);
            const key = formatDateKey(date);
            if (key >= accountStartDateKey) {
                keys.push(key);
            }
        }
        return keys;
    }, [todayKey, accountStartDateKey]);

    const recordDateKeys = useMemo(() => {
        const yesterdayKey = offsetDateKey(todayKey, -1);
        const keySet = new Set<string>(recentDateKeys);
        keySet.add(todayKey);
        keySet.add(yesterdayKey);

        if (selectedDate <= todayKey) {
            keySet.add(selectedDate);
        }

        const sorted = Array.from(keySet).sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));
        const todayIndex = sorted.indexOf(todayKey);
        const yesterdayIndex = sorted.indexOf(yesterdayKey);
        if (todayIndex >= 0 && yesterdayIndex >= 0 && yesterdayIndex !== todayIndex - 1) {
            sorted.splice(yesterdayIndex, 1);
            const nextTodayIndex = sorted.indexOf(todayKey);
            sorted.splice(Math.max(0, nextTodayIndex), 0, yesterdayKey);
        }

        return sorted;
    }, [recentDateKeys, selectedDate, todayKey]);

    const syncDailyLogsToMetadata = useCallback(
        async (nextLogs: Record<string, DayLog>) => {
            if (!hasSupabaseEnv || !supabase) {
                return false;
            }

            const { user, error: userError } = await getAuthSessionUser();
            if (userError || !user) {
                return false;
            }

            const metadata = readIamfineMetadata(user.user_metadata);
            const normalizedLogs = compactMetadataDailyLogs(nextLogs);
            if (areDailyLogsEqual(metadata.dailyLogs, normalizedLogs)) {
                return true;
            }

            const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, {
                dailyLogs: normalizedLogs,
            });
            const { error: updateError } = await supabase.auth.updateUser({
                data: updatedMetadata,
            });
            if (updateError) {
                console.error('식단 로그 메타데이터 저장 실패', updateError);
                return false;
            }

            return true;
        },
        []
    );

    const loadInitial = useCallback(async () => {
        setLoading(true);
        setError('');
        setMessage('');

        if (!hasSupabaseEnv || !supabase) {
            setLoading(false);
            return;
        }

        const { user, error: userError } = await getAuthSessionUser();
        if (userError || !user) {
            setLoading(false);
            return;
        }

        const uid = user.id;
        setUserId(uid);
        const createdAt = user.created_at;
        const createdAtDateKey =
            typeof createdAt === 'string' && createdAt.length >= 10
                ? createdAt.slice(0, 10)
                : todayKey;
        setAccountStartDateKey(createdAtDateKey);
        const metadata = readIamfineMetadata(user.user_metadata);
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

        let tableMode: DailyLogsStorageMode = 'table';
        let serverLogs: Record<string, DayLog> = {};
        const { data: serverLogRows, error: serverLogsError } = await supabase
            .from(DIET_DAILY_LOGS_TABLE)
            .select('date_key, log_payload')
            .eq('user_id', uid)
            .order('date_key', { ascending: true });
        if (serverLogsError) {
            if (isDietLogTableMissingError(serverLogsError)) {
                tableMode = 'metadata';
                setDailyLogsStorageMode('metadata');
            } else {
                console.error('서버 기록 조회 실패', serverLogsError);
            }
        } else {
            serverLogs = parseServerDietLogs(serverLogRows as unknown);
            setDailyLogsStorageMode('table');
        }

        const store = parseStore(localStorage.getItem(getStoreKey(uid)));
        const localBaseLogs = {
            ...metadata.dailyLogs,
            ...store.logs,
        };
        const localOnlyLogEntries = Object.entries(localBaseLogs).filter(([dateKey]) => !serverLogs[dateKey]);
        if (tableMode === 'table' && localOnlyLogEntries.length > 0) {
            const nowIso = new Date().toISOString();
            const { error: backfillError } = await supabase.from(DIET_DAILY_LOGS_TABLE).upsert(
                localOnlyLogEntries.map(([dateKey, log]) => ({
                    user_id: uid,
                    date_key: dateKey,
                    log_payload: log,
                    updated_at: nowIso,
                })),
                {
                    onConflict: 'user_id,date_key',
                }
            );
            if (backfillError) {
                if (isDietLogTableMissingError(backfillError)) {
                    tableMode = 'metadata';
                    setDailyLogsStorageMode('metadata');
                } else {
                    console.error('기존 로컬 기록 서버 백필 실패', backfillError);
                }
            } else {
                localOnlyLogEntries.forEach(([dateKey, log]) => {
                    serverLogs[dateKey] = log;
                });
            }
        }
        const mergedLogs = {
            ...localBaseLogs,
            ...serverLogs,
        };
        const resolvedDailyPreferences =
            Object.keys(metadata.dailyPreferences).length > 0
                ? metadata.dailyPreferences
                : store.dailyPreferences;
        const resolvedMedications = metadata.medications.length > 0 ? metadata.medications : store.medications;
        const resolvedMedicationSchedules =
            metadata.medicationSchedules.length > 0 ? metadata.medicationSchedules : store.medicationSchedules;
        const resolvedAdditionalConditions = metadata.additionalConditions;
        const localRecentDietSignals = buildRecentDietSignalsFromLogs(mergedLogs, todayKey);
        const syncPatch: Partial<{
            treatmentMeta: TreatmentMeta;
            medications: string[];
            medicationSchedules: MedicationSchedule[];
            recentDietSignals: string[];
            dailyPreferences: Record<string, PreferenceType[]>;
            dailyLogs: Record<string, DayLog>;
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
        if (metadata.recentDietSignals.length === 0 && localRecentDietSignals.length > 0) {
            syncPatch.recentDietSignals = localRecentDietSignals;
        }
        if (Object.keys(metadata.dailyPreferences).length === 0 && Object.keys(store.dailyPreferences).length > 0) {
            syncPatch.dailyPreferences = store.dailyPreferences;
        }
        if (tableMode === 'metadata') {
            const nextMetadataLogs = compactMetadataDailyLogs(mergedLogs);
            if (!areDailyLogsEqual(metadata.dailyLogs, nextMetadataLogs)) {
                syncPatch.dailyLogs = nextMetadataLogs;
            }
        }
        if (Object.keys(syncPatch).length > 0) {
            const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, syncPatch);
            const { error: metadataSyncError } = await supabase.auth.updateUser({
                data: updatedMetadata,
            });
            if (metadataSyncError) {
                console.error('식단 초기 메타데이터 동기화 실패', metadataSyncError);
            }
        }

        if (!localTreatmentMeta && resolvedTreatmentMeta) {
            localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
        }
        if (
            JSON.stringify(store.medications) !== JSON.stringify(resolvedMedications) ||
            JSON.stringify(store.medicationSchedules) !== JSON.stringify(resolvedMedicationSchedules)
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

        syncedLogSignaturesRef.current = Object.fromEntries(
            Object.entries(mergedLogs).map(([dateKey, log]) => [dateKey, JSON.stringify(log)])
        );
        setLogs(mergedLogs);
        setMedications(resolvedMedications);
        setMedicationSchedules(resolvedMedicationSchedules);
        setAdditionalConditions(resolvedAdditionalConditions);
        setDailyPreferences(resolvedDailyPreferences);
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
        if (!storeReady || !userId || !hasSupabaseEnv || !supabase) {
            return;
        }

        const supabaseClient = supabase;
        const nextSignals = buildRecentDietSignalsFromLogs(logs, todayKey);
        const timer = window.setTimeout(() => {
            void (async () => {
                const { user, error: userError } = await getAuthSessionUser();
                if (userError || !user) {
                    return;
                }

                const metadata = readIamfineMetadata(user.user_metadata);
                const currentSignals = metadata.recentDietSignals;
                const isSame =
                    currentSignals.length === nextSignals.length &&
                    currentSignals.every((signal, index) => signal === nextSignals[index]);
                if (isSame) {
                    return;
                }

                const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, {
                    recentDietSignals: nextSignals,
                });
                const { error: updateError } = await supabaseClient.auth.updateUser({
                    data: updatedMetadata,
                });
                if (updateError) {
                    console.error('최근 식단 신호 저장 실패', updateError);
                }
            })();
        }, 700);

        return () => window.clearTimeout(timer);
    }, [storeReady, userId, logs, todayKey]);

    useEffect(() => {
        if (!storeReady || !userId || !hasSupabaseEnv || !supabase) {
            return;
        }

        const supabaseClient = supabase;
        const timer = window.setTimeout(() => {
            void (async () => {
                const { user, error: userError } = await getAuthSessionUser();
                if (userError || !user) {
                    return;
                }

                const metadata = readIamfineMetadata(user.user_metadata);
                const currentDaily = metadata.dailyPreferences;
                const nextDaily = normalizeDailyPreferencesRecord(dailyPreferences);
                const isSame = JSON.stringify(currentDaily) === JSON.stringify(nextDaily);
                if (isSame) {
                    return;
                }

                const updatedMetadata = buildUpdatedUserMetadata(user.user_metadata, {
                    dailyPreferences: nextDaily,
                });
                const { error: updateError } = await supabaseClient.auth.updateUser({
                    data: updatedMetadata,
                });
                if (updateError) {
                    console.error('일자별 식단 선호 저장 실패', updateError);
                }
            })();
        }, 700);

        return () => window.clearTimeout(timer);
    }, [storeReady, userId, dailyPreferences]);

    useEffect(() => {
        if (!storeReady || !userId || !hasSupabaseEnv || !supabase) {
            return;
        }

        const dirtyLogEntries = Object.entries(logs).filter(([dateKey, log]) => {
            const signature = JSON.stringify(log);
            return syncedLogSignaturesRef.current[dateKey] !== signature;
        });
        if (dirtyLogEntries.length === 0) {
            return;
        }

        const supabaseClient = supabase;
        const targetUserId = userId;
        const timer = window.setTimeout(() => {
            void (async () => {
                if (dailyLogsStorageMode === 'metadata') {
                    const metadataSyncOk = await syncDailyLogsToMetadata(logs);
                    if (!metadataSyncOk) {
                        return;
                    }

                    dirtyLogEntries.forEach(([dateKey, log]) => {
                        syncedLogSignaturesRef.current[dateKey] = JSON.stringify(log);
                    });
                    return;
                }

                const nowIso = new Date().toISOString();
                const { error: saveError } = await supabaseClient.from(DIET_DAILY_LOGS_TABLE).upsert(
                    dirtyLogEntries.map(([dateKey, log]) => ({
                        user_id: targetUserId,
                        date_key: dateKey,
                        log_payload: log,
                        updated_at: nowIso,
                    })),
                    {
                        onConflict: 'user_id,date_key',
                    }
                );

                if (saveError) {
                    if (isDietLogTableMissingError(saveError)) {
                        setDailyLogsStorageMode('metadata');
                        const metadataSyncOk = await syncDailyLogsToMetadata(logs);
                        if (!metadataSyncOk) {
                            return;
                        }
                    } else {
                        console.error('자동 기록 서버 저장 실패', saveError);
                        return;
                    }
                } else if (dailyLogsStorageMode === 'unknown') {
                    setDailyLogsStorageMode('table');
                }

                dirtyLogEntries.forEach(([dateKey, log]) => {
                    syncedLogSignaturesRef.current[dateKey] = JSON.stringify(log);
                });
            })();
        }, 900);

        return () => window.clearTimeout(timer);
    }, [storeReady, userId, logs, dailyLogsStorageMode, syncDailyLogsToMetadata]);

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

    useEffect(() => {
        if (!openRecordView) {
            return;
        }

        const scroller = recordDateScrollerRef.current;
        const targetButton = recordDateButtonRefs.current[selectedDate];
        if (!scroller || !targetButton) {
            return;
        }

        const centeredLeft = targetButton.offsetLeft - (scroller.clientWidth - targetButton.clientWidth) / 2;
        const nextLeft = Math.max(0, centeredLeft);
        scroller.scrollTo({
            left: nextLeft,
            behavior: 'smooth',
        });
        const retryTimer = window.setTimeout(() => {
            const retryScroller = recordDateScrollerRef.current;
            const retryTarget = recordDateButtonRefs.current[selectedDate];
            if (!retryScroller || !retryTarget) {
                return;
            }
            const retryCenteredLeft = retryTarget.offsetLeft - (retryScroller.clientWidth - retryTarget.clientWidth) / 2;
            retryScroller.scrollTo({
                left: Math.max(0, retryCenteredLeft),
                behavior: 'auto',
            });
        }, 120);

        return () => window.clearTimeout(retryTimer);
    }, [openRecordView, selectedDate, recordDateKeys, loading]);

    const selectRecordDate = (nextDateKey: string) => {
        const normalizedDateKey = nextDateKey.trim();
        if (!DATE_KEY_PATTERN.test(normalizedDateKey)) {
            return;
        }
        if (normalizedDateKey > todayKey) {
            setError('미래 날짜는 선택할 수 없어요.');
            return;
        }
        setError('');
        setSelectedDate(normalizedDateKey);
        setOpenSubstituteTarget(null);
    };

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
            const alertMessage = '먼저 수정 제안을 요청해 주세요.';
            setError(alertMessage);
            window.alert(alertMessage);
            return;
        }

        if (draftTodayPreferences.length === 0) {
            const alertMessage = '원하는 방향을 하나 이상 선택해 주세요.';
            setError(alertMessage);
            window.alert(alertMessage);
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
        const resetItems = buildDefaultLog(selectedDate, selectedPlan).meals[slot];
        if (status === 'reset') {
            setOpenSubstituteTarget((prev) => (prev?.slot === slot ? null : prev));
        }
        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: status === 'reset'
                    ? resetItems
                    : current.meals[slot].map((item) => {
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

    const toggleMealSubstitutePanel = (slot: MealSlot, itemId: string) => {
        setOpenSubstituteTarget((prev) => {
            if (prev?.slot === slot && prev.itemId === itemId) {
                return null;
            }
            return {
                slot,
                itemId,
            };
        });
    };

    const applyMealSubstitute = (
        slot: MealSlot,
        itemId: string,
        originalName: string,
        substituteName: string
    ) => {
        const normalizedSubstitute = normalizeManualMealName(substituteName);
        if (!normalizedSubstitute) {
            return;
        }

        updateCurrentLog((current) => ({
            ...current,
            meals: {
                ...current.meals,
                [slot]: current.meals[slot].map((item) =>
                    item.id === itemId
                        ? {
                              ...item,
                              name: `${normalizedSubstitute} · ${baseAmountByFoodName(normalizedSubstitute, slot)}`,
                              eaten: true,
                              notEaten: false,
                              isManual: true,
                              servings: 1,
                          }
                        : item
                ),
            },
        }));

        setOpenSubstituteTarget(null);
        setMessage(`"${stripPortionLabel(originalName)}" 대신 "${normalizedSubstitute}"으로 기록했어요.`);
    };

    const addMealItem = (
        slot: MealSlot,
        matchedFoodName?: string,
        source: 'button' | 'keyboard' | 'chip' = 'button'
    ) => {
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
        const now = Date.now();
        const lastManualAdd = lastManualAddRef.current;
        if (
            lastManualAdd &&
            lastManualAdd.slot === slot &&
            lastManualAdd.name === normalizedName &&
            now - lastManualAdd.at < 700
        ) {
            return;
        }
        lastManualAddRef.current = {
            slot,
            name: normalizedName,
            at: now,
        };

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
            if (source === 'keyboard' || source === 'button') {
                setMessage(`입력한 "${typedRaw}"을 "${normalizedName}"(으)로 매칭해 기록했어요.`);
            }
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

        if (!hasSupabaseEnv || !supabase) {
            setSaving(false);
            setError('설정이 필요해요. .env.local 파일을 확인해 주세요.');
            return;
        }

        if (!userId) {
            setSaving(false);
            setError('로그인이 필요해요.');
            return;
        }

        const currentLog = logs[selectedDate] ?? buildDefaultLog(selectedDate, selectedPlan);
        const nextLogs = {
            ...logs,
            [selectedDate]: currentLog,
        };

        if (dailyLogsStorageMode === 'metadata') {
            const metadataSyncOk = await syncDailyLogsToMetadata(nextLogs);
            setSaving(false);
            if (!metadataSyncOk) {
                setError('서버 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
                return;
            }

            syncedLogSignaturesRef.current[selectedDate] = JSON.stringify(currentLog);
            showSaveSuccessPopup(RECORD_SAVE_SUCCESS_MESSAGE);
            return;
        }

        const { error: saveError } = await supabase.from(DIET_DAILY_LOGS_TABLE).upsert(
            {
                user_id: userId,
                date_key: selectedDate,
                log_payload: currentLog,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: 'user_id,date_key',
            }
        );

        if (saveError) {
            if (isDietLogTableMissingError(saveError)) {
                setDailyLogsStorageMode('metadata');
                const metadataSyncOk = await syncDailyLogsToMetadata(nextLogs);
                setSaving(false);
                if (!metadataSyncOk) {
                    setError('서버 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
                    return;
                }

                syncedLogSignaturesRef.current[selectedDate] = JSON.stringify(currentLog);
                showSaveSuccessPopup(RECORD_SAVE_SUCCESS_MESSAGE);
                return;
            }

            setSaving(false);
            console.error('오늘 기록 서버 저장 실패', saveError);
            setError('서버 저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
            return;
        }

        setSaving(false);
        if (dailyLogsStorageMode === 'unknown') {
            setDailyLogsStorageMode('table');
        }
        syncedLogSignaturesRef.current[selectedDate] = JSON.stringify(currentLog);
        showSaveSuccessPopup(RECORD_SAVE_SUCCESS_MESSAGE);
    };

    const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await saveCurrentRecord();
    };

    if (loading) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm dark:bg-emerald-600">
                            <Utensils className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm dark:bg-emerald-600">
                            <Utensils className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    </div>
                </section>
                <section
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일의 연결 설정을 확인해 주세요.</p>
                </section>
                <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    <p>{DISCLAIMER_TEXT}</p>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm dark:bg-emerald-600">
                            <Utensils className="h-5 w-5" />
                        </span>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">식단 제안</h1>
                    </div>
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
                <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    <p>{DISCLAIMER_TEXT}</p>
                </section>
            </main>
        );
    }

    return (
        <main className="space-y-4">
            {!openRecordView && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex justify-end">
                            <p className="inline-flex shrink-0 rounded-md border border-gray-900 bg-gray-900 px-2.5 py-1 text-sm font-semibold text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900">
                                {viewedTodayDateLabel}
                            </p>
                        </div>
                        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <button
                                type="button"
                                onClick={() => setTodayPlanOffset((prev) => Math.max(-1, prev - 1))}
                                disabled={todayPlanOffset <= -1}
                                className="shrink-0 rounded-full border border-gray-300 bg-white p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                aria-label="어제 식단 보기"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm dark:bg-emerald-600">
                                <Utensils className="h-5 w-5" />
                            </span>
                            <h1 className="shrink-0 whitespace-nowrap text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">{viewedTodayLabel} 식단</h1>
                            <button
                                type="button"
                                onClick={() => setTodayPlanOffset((prev) => Math.min(1, prev + 1))}
                                disabled={todayPlanOffset >= 1}
                                className="shrink-0 rounded-full border border-gray-300 bg-white p-1.5 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                aria-label="내일 식단 보기"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        {profile?.nickname && (
                            <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-200">
                                {profile.nickname} 님 맞춤 추천이에요.
                            </p>
                        )}
                    </div>
                    <div className="galaxySafeActions w-full sm:w-auto sm:justify-end">
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
                                    : Utensils;
                        const mealTimeBadges =
                            slot === 'breakfast'
                                ? ['7시~9시']
                                : slot === 'lunch'
                                  ? ['12시~1시']
                                  : slot === 'dinner'
                                    ? ['6시~7시']
                                    : [`간식 ${snackCoffeeRecommendedTime.snack}`];
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
                                <div className="mealTileMono__header flex-wrap items-start gap-2 sm:justify-between">
                                    <div className="min-w-0 flex items-start gap-2">
                                        <span className="mealTileMono__iconWrap" aria-hidden="true">
                                            <MealIcon className="mealTileMono__icon" />
                                        </span>
                                        <div className="flex flex-wrap items-start gap-1.5">
                                            <h2 className="mealTileMono__title text-base font-extrabold tracking-tight">{mealTypeLabel(slot)}</h2>
                                            {mealTimeBadges.map((badgeText) => (
                                                <span
                                                    key={`${slot}-${badgeText}`}
                                                    className="-mt-0.5 rounded-full border border-gray-300 bg-white/95 px-2 py-0.5 text-xs font-semibold text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900/95 dark:text-gray-100"
                                                >
                                                    {badgeText}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {showMedicationArea && (
                                        <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto sm:max-w-[62%] sm:justify-end">
                                            <span className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
                                                식후 복용 약
                                            </span>
                                            {mealMedicationList.length === 0 ? (
                                                <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                                                    복용 약 없음
                                                </span>
                                            ) : (
                                                mealMedicationList.map((medication) => {
                                                    const taken = viewedTodayMedicationTakenSet.has(medication.id);
                                                    return (
                                                        <span
                                                            key={medication.id}
                                                            className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                                                                taken
                                                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                                                    : 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-50'
                                                            }`}
                                                        >
                                                            {taken ? '복용 확인' : '복용 전'} · {medication.name}
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="mealTileMono__body">
                                    <p className="text-base font-bold leading-snug">{meal.summary}</p>
                                    {slot !== 'snack' && <p className="mt-1 text-sm">반찬: {meal.sides.join(', ')}</p>}
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const guide = mealPortionGuideFromPlan(meal, slot);
                                                setOpenPortionGuideContent({
                                                    title: `${mealTypeLabel(slot)} 권장 섭취량(1인 기준)`,
                                                    slot,
                                                    guide,
                                                    substitutes: guide.items.map((guideItem) => {
                                                        const substitute = buildSubstituteCandidates(
                                                            guideItem.name,
                                                            slot,
                                                            manualFoodCandidates
                                                        );
                                                        return {
                                                            hint: substitute.hint,
                                                            options: substitute.options.slice(0, 5),
                                                        };
                                                    }),
                                                });
                                            }}
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
                                </div>
                            </article>
                        );
                    })}
                </div>

                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">오늘 간식 타이밍</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- 간식 권장 시간: {snackCoffeeRecommendedTime.snack}</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {timingGuide.snack}</p>
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">선택 음료 가이드(필수 아님)</p>
                        <p className="mt-1">- 커피(원할 때만) 권장 시간: {snackCoffeeRecommendedTime.coffee}</p>
                        <p className="mt-1">- 차(원할 때만) 권장 시간: {snackCoffeeRecommendedTime.tea}</p>
                        <p className="mt-1">- {timingGuide.coffee}</p>
                        <p className="mt-1">- {timingGuide.tea}</p>
                        <p className="mt-1">- {beverageCaution}</p>
                        {dailyCoffeeRecommendations.length > 0 && (
                            <div className="mt-2">
                                <p className="font-semibold text-gray-900 dark:text-gray-100">오늘 선택 커피(원할 때만)</p>
                                {dailyCoffeeRecommendations.map((item) => (
                                    <p key={`coffee-${item.name}`} className="mt-1">
                                        - <span className="font-semibold">{item.name}</span>: {item.reason}
                                    </p>
                                ))}
                            </div>
                        )}
                        {dailyTeaRecommendations.length > 0 && (
                            <div className="mt-2">
                                <p className="font-semibold text-gray-900 dark:text-gray-100">오늘 선택 차(원할 때만)</p>
                                {dailyTeaRecommendations.map((item) => (
                                    <p key={`tea-${item.name}`} className="mt-1">
                                        - <span className="font-semibold">{item.name}</span>: {item.reason}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setOpenRecipeSlot('coffee')}
                            className="cursor-pointer rounded-md border border-black bg-black px-2.5 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-800"
                        >
                            선택 커피/차 가이드 보기
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
                    className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-4"
                    onClick={() => setOpenRecipeSlot(null)}
                >
                    <section
                        className="mx-auto my-3 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:my-6 max-h-[70dvh] overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-1.5rem)] dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="galaxySafeHeader">
                            <div className="galaxySafeHeader__main">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{openRecipeContent.title}</h2>
                                <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                                    {openRecipeContent.recipeName}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpenRecipeSlot(null)}
                                className="galaxySafeHeader__action popupCloseButton"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {openRecipeContent.recipeSteps.map((step, index) => (
                                <p key={`${openRecipeContent.recipeName}-${index}`}>- {step}</p>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {openPortionGuideContent && (
                <div
                    className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-4"
                    onClick={() => setOpenPortionGuideContent(null)}
                >
                    <section
                        className="mx-auto my-3 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:my-6 max-h-[70dvh] overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-1.5rem)] dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="galaxySafeHeader">
                            <h2 className="galaxySafeHeader__main text-xl font-semibold text-gray-900 dark:text-gray-100">
                                {openPortionGuideContent.title}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setOpenPortionGuideContent(null)}
                                className="galaxySafeHeader__action popupCloseButton"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="mt-3 space-y-2 text-base text-gray-800 dark:text-gray-100">
                            {openPortionGuideContent.guide.items.map((item, index) => {
                                const substitute = openPortionGuideContent.substitutes[index];
                                return (
                                    <div
                                        key={`portion-modal-${item.name}-${index}`}
                                        className="rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/40"
                                    >
                                        <p>
                                            - <span className="font-semibold">{item.name}</span>: {item.amount}
                                        </p>
                                        {substitute && substitute.options.length > 0 && (
                                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                                                대체 가능한 음식({substitute.hint}): {substitute.options.join(', ')}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {openPortionGuideContent.guide.notes.length > 0 && (
                            <div className="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                {openPortionGuideContent.guide.notes.map((note) => (
                                    <p key={`portion-modal-note-${note}`}>· {note}</p>
                                ))}
                            </div>
                        )}
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

            {saveSuccessPopupOpen && (
                <div className="fixed inset-x-0 bottom-4 z-[60] px-4">
                    <section className="mx-auto w-full max-w-lg rounded-xl border border-emerald-300 bg-emerald-600 p-3 text-white shadow-2xl">
                        <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 text-sm font-semibold">{saveSuccessPopupMessage}</p>
                            <button type="button" onClick={closeSaveSuccessPopup} className="popupCloseButton px-2.5 py-1 text-xs">
                                닫기
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {!openRecordView && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="galaxySafeHeader">
                        <h2 className="galaxySafeHeader__main galaxySafeText text-lg font-semibold text-gray-900 dark:text-gray-100">
                            오늘만 이렇게 먹을래요
                        </h2>
                        <button
                            type="button"
                            aria-expanded={showTodayPreferencePanel}
                            onClick={() => setShowTodayPreferencePanel((prev) => !prev)}
                            className="galaxySafeHeader__action shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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

                            <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {PREFERENCE_OPTIONS.map((option) => {
                                    const selected = draftTodayPreferences.includes(option.key);
                                    const recommended = recentRecordRecommendations.includes(option.key);
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() => toggleDraftTodayPreference(option.key)}
                                            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
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

                            <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <button
                                    type="button"
                                    onClick={applyRecentRecordRecommendation}
                                    className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    추천 적용
                                </button>
                                <button
                                    type="button"
                                    onClick={requestTodayProposal}
                                    className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    수정 제안 요청
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmTodayPlanChange}
                                    className="shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
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
                        <div className="galaxySafeHeader">
                            <h2 className="galaxySafeHeader__main galaxySafeText text-lg font-semibold text-gray-900 dark:text-gray-100">
                                기록할 날짜 선택
                            </h2>
                            <div className="galaxySafeHeader__action flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpenRecordPortionSlot(null);
                                        setShowRecordPlanModal(true);
                                    }}
                                    className="whitespace-nowrap rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    식단 보기
                                </button>
                            </div>
                        </div>
                        <div ref={recordDateScrollerRef} className="mt-3 overflow-x-auto pb-1">
                            <div className="galaxySafeActions inline-flex min-w-full gap-2">
                                {recordDateKeys.map((key) => {
                                    const isSelected = key === selectedDate;
                                    const isToday = key === todayKey;
                                    return (
                                        <div key={key} className="contents">
                                            <button
                                                ref={(node) => {
                                                    recordDateButtonRefs.current[key] = node;
                                                }}
                                                type="button"
                                                onClick={() => {
                                                    selectRecordDate(key);
                                                }}
                                                className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                                    isSelected
                                                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                {formatDateLabel(key)} {isToday ? '· 오늘' : ''}
                                            </button>
                                            {isToday && (
                                                <input
                                                    id="record-date"
                                                    type="date"
                                                    enterKeyHint="done"
                                                    value={selectedDate}
                                                    max={todayKey}
                                                    onChange={(event) => {
                                                        selectRecordDate(event.target.value);
                                                    }}
                                                    aria-label="기록 날짜 선택"
                                                    className="h-10 w-[8.4rem] shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {showRecordPlanModal && (
                        <div
                            className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-4"
                            onClick={() => {
                                setShowRecordPlanModal(false);
                                setOpenRecordPortionSlot(null);
                            }}
                        >
                            <section
                                className="mx-auto my-3 w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl sm:my-6 max-h-[70dvh] overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-1.5rem)] dark:border-gray-800 dark:bg-gray-900"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="galaxySafeHeader">
                                    <div className="galaxySafeHeader__main">
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
                                        className="popupCloseButton"
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
                                            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/40 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <p className="min-w-0 text-sm text-gray-800 dark:text-gray-100">
                                                <span className="font-semibold">{medicationTimingLabel(medication.timing)}</span>
                                                {' · '}
                                                {medication.category}
                                                {' · '}
                                                {medication.name}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => toggleMedicationTaken(medication.id)}
                                                className={`shrink-0 self-start rounded-lg px-3 py-1 text-xs font-semibold sm:self-auto ${
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
                                className="w-full rounded-lg primarySaveButton px-4 py-2 text-sm font-semibold sm:w-auto"
                            >
                                {saving ? '저장 중...' : '저장하기'}
                            </button>
                        </div>
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="galaxySafeHeader">
                            <h2 className="galaxySafeHeader__main galaxySafeText text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {selectedDateLabel} 식단 기록
                            </h2>
                            <button
                                type="button"
                                className="galaxySafeHeader__action rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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
                                    const progress = selectedSlotProgress[slot];

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
                                                {items.map((item) => {
                                                    const isSubstitutePanelOpen =
                                                        openSubstituteTarget?.slot === slot &&
                                                        openSubstituteTarget.itemId === item.id;
                                                    const substituteCandidates = isSubstitutePanelOpen
                                                        ? buildSubstituteCandidates(item.name, slot, manualFoodCandidates)
                                                        : null;
                                                    const [displayFoodNameRaw, ...displayAmountParts] = item.name.split(' · ');
                                                    const displayFoodName = displayFoodNameRaw.trim();
                                                    const displayAmount = displayAmountParts.join(' · ').trim();

                                                    return (
                                                        <div key={item.id} className="space-y-1.5">
                                                            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-gray-800 dark:bg-gray-900">
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
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleMealSubstitutePanel(slot, item.id)}
                                                                    className="min-w-0 px-1 text-center leading-snug text-gray-800 underline decoration-dotted underline-offset-4 transition hover:text-gray-900 dark:text-gray-100 dark:hover:text-white"
                                                                >
                                                                    <span className="block text-base font-bold">{displayFoodName}</span>
                                                                    {displayAmount && (
                                                                        <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-300">
                                                                            {displayAmount}
                                                                        </span>
                                                                    )}
                                                                </button>
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

                                                            {isSubstitutePanelOpen && (
                                                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 dark:border-gray-700 dark:bg-gray-950/40">
                                                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                                                                            대체 가능한 음식
                                                                        </p>
                                                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                                            {substituteCandidates?.hint}
                                                                        </span>
                                                                    </div>

                                                                    {substituteCandidates && substituteCandidates.options.length > 0 ? (
                                                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                                            {substituteCandidates.options.map((candidate) => (
                                                                                <button
                                                                                    key={`${item.id}-${candidate}`}
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        applyMealSubstitute(
                                                                                            slot,
                                                                                            item.id,
                                                                                            item.name,
                                                                                            candidate
                                                                                        )
                                                                                    }
                                                                                    className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                                                                >
                                                                                    {candidate}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                                            대체 후보를 찾지 못했어요.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                                <input
                                                    aria-label={`${mealTypeLabel(slot)} 먹은 음식 추가`}
                                                    autoComplete="off"
                                                    autoCapitalize="none"
                                                    autoCorrect="off"
                                                    spellCheck={false}
                                                    enterKeyHint="done"
                                                    maxLength={60}
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
                                                        if (event.nativeEvent.isComposing || event.repeat) {
                                                            return;
                                                        }
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        addMealItem(slot, undefined, 'keyboard');
                                                    }}
                                                    placeholder="먹은 음식 추가"
                                                    className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => addMealItem(slot, undefined, 'button')}
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
                                                                    onClick={() => addMealItem(slot, candidate, 'chip')}
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
                                className="w-full rounded-lg primarySaveButton px-4 py-2 text-sm font-semibold sm:w-auto"
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

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                <p>{DISCLAIMER_TEXT}</p>
            </section>
        </main>
    );
}
