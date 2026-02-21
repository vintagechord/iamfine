'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    applySevenDayNoRepeatRule,
    detectCancerProfileMatch,
    formatDateKey,
    generatePlanForDate,
    optimizePlanByMedications,
    optimizePlanByPreference,
    optimizePlanByUserContext,
    PREFERENCE_OPTIONS,
    STAGE_TYPE_LABELS,
    type DayPlan,
    type MealSuggestion,
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

type MedicationTiming = 'breakfast' | 'lunch' | 'dinner';

type MedicationSchedule = {
    id: string;
    name: string;
    category: string;
    timing: MedicationTiming;
};

type ReportMealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

type TrackItem = {
    id: string;
    name: string;
    eaten: boolean;
    notEaten?: boolean;
    isManual?: boolean;
    servings?: number;
};

type DayLog = {
    meals: Partial<Record<ReportMealSlot, TrackItem[]>>;
    memo?: string;
    medicationTakenIds?: string[];
};

type DietStore = {
    medications: string[];
    medicationSchedules: MedicationSchedule[];
    dailyPreferences: Record<string, PreferenceType[]>;
    logs: Record<string, DayLog>;
};

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const DIET_DAILY_LOGS_TABLE = 'diet_daily_logs';
const USER_METADATA_NAMESPACE = 'iamfine';
const NO_REPEAT_DAYS = 7;
const TWO_WEEK_DAYS = 14;
const REPORT_SLOT_ORDER: ReportMealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PREFERENCE_KEYS = new Set<PreferenceType>(PREFERENCE_OPTIONS.map((option) => option.key));
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
        Object.entries(raw as Record<string, unknown>).map(([dateKey, values]) => [dateKey, normalizePreferenceList(values)])
    );
}

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
            additionalConditions: [] as AdditionalCondition[],
            dailyPreferences: {} as Record<string, PreferenceType[]>,
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
            dailyPreferences: {} as Record<string, PreferenceType[]>,
        };
    }

    const scoped = namespaced as Record<string, unknown>;
    return {
        treatmentMeta: parseTreatmentMetaFromUnknown(scoped.treatmentMeta),
        medications: parseMedicationNamesFromUnknown(scoped.medications),
        medicationSchedules: parseMedicationSchedulesFromUnknown(scoped.medicationSchedules),
        additionalConditions: parseAdditionalConditionsFromUnknown(scoped.additionalConditions),
        dailyPreferences: normalizeDailyPreferencesRecord(scoped.dailyPreferences),
    };
}

function parseStore(raw: string | null): DietStore {
    if (!raw) {
        return {
            medications: [],
            medicationSchedules: [],
            dailyPreferences: {},
            logs: {},
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
            dailyPreferences: normalizeDailyPreferencesRecord(parsed.dailyPreferences),
            logs:
                parsed.logs && typeof parsed.logs === 'object'
                    ? (parsed.logs as Record<string, DayLog>)
                    : {},
        };
    } catch {
        return {
            medications: [],
            medicationSchedules: [],
            dailyPreferences: {},
            logs: {},
        };
    }
}

function parseTrackItemsFromUnknown(raw: unknown, slot: ReportMealSlot, dateKey: string) {
    if (!Array.isArray(raw)) {
        return [] as TrackItem[];
    }

    return raw
        .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
        .map((item, index): TrackItem | null => {
            const candidate = item as Partial<TrackItem>;
            const normalizedName = typeof candidate.name === 'string' ? candidate.name.trim() : '';
            if (!normalizedName) {
                return null;
            }

            return {
                id:
                    typeof candidate.id === 'string' && candidate.id.trim()
                        ? candidate.id
                        : `${dateKey}-${slot}-server-${index}`,
                name: normalizedName,
                eaten: Boolean(candidate.eaten),
                notEaten: Boolean(candidate.notEaten),
                isManual: Boolean(candidate.isManual),
                servings:
                    typeof candidate.servings === 'number' && Number.isFinite(candidate.servings)
                        ? Math.max(1, Math.round(candidate.servings))
                        : 1,
            } satisfies TrackItem;
        })
        .filter((item): item is TrackItem => Boolean(item));
}

function parseDayLogFromUnknown(raw: unknown, dateKey: string): DayLog | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }

    const candidate = raw as Partial<DayLog>;
    const mealsRaw =
        candidate.meals && typeof candidate.meals === 'object' && !Array.isArray(candidate.meals)
            ? (candidate.meals as Partial<Record<ReportMealSlot, unknown>>)
            : {};

    return {
        meals: {
            breakfast: parseTrackItemsFromUnknown(mealsRaw.breakfast, 'breakfast', dateKey),
            lunch: parseTrackItemsFromUnknown(mealsRaw.lunch, 'lunch', dateKey),
            dinner: parseTrackItemsFromUnknown(mealsRaw.dinner, 'dinner', dateKey),
            snack: parseTrackItemsFromUnknown(mealsRaw.snack, 'snack', dateKey),
        },
        memo: typeof candidate.memo === 'string' ? candidate.memo : '',
        medicationTakenIds: Array.isArray(candidate.medicationTakenIds)
            ? Array.from(
                  new Set(
                      candidate.medicationTakenIds
                          .filter((item): item is string => typeof item === 'string')
                          .map((item) => item.trim())
                          .filter(Boolean)
                  )
              )
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
            const dateKey = typeof row.date_key === 'string' ? row.date_key : '';
            if (!dateKey) {
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

function offsetDateKey(baseDateKey: string, offset: number) {
    const [year, month, day] = baseDateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + offset);
    return formatDateKey(date);
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function mergePreferences(...lists: Array<PreferenceType[]>) {
    const merged = new Set<PreferenceType>();
    lists.forEach((list) => {
        list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
}

function slotItems(log: DayLog, slot: ReportMealSlot) {
    const items = log.meals?.[slot];
    return Array.isArray(items) ? items : [];
}

function stripPortionLabel(rawName: string) {
    const [name] = rawName.split(' · ');
    return name.trim();
}

function normalizeText(input: string) {
    return input.trim().toLowerCase();
}

function countKeywords(text: string, keywords: string[]) {
    const normalized = normalizeText(text);
    return keywords.reduce((count, keyword) => count + (normalized.includes(keyword) ? 1 : 0), 0);
}

function countKeywordsByItems(items: Array<Pick<TrackItem, 'name' | 'servings'>>, keywords: string[]) {
    const normalizedKeywords = keywords.map((keyword) => normalizeText(keyword));
    return items.reduce((count, item) => {
        const normalizedName = normalizeText(stripPortionLabel(item.name));
        const matched = normalizedKeywords.some((keyword) => normalizedName.includes(keyword));
        if (!matched) {
            return count;
        }
        const servingCount = Math.max(1, Math.round(item.servings ?? 1));
        return count + servingCount;
    }, 0);
}

function eatenTrackItems(log: DayLog) {
    return REPORT_SLOT_ORDER.flatMap((slot) => slotItems(log, slot).filter((item) => item.eaten));
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

function cloneDayPlan(plan: DayPlan): DayPlan {
    return {
        date: plan.date,
        breakfast: { ...plan.breakfast, sides: [...plan.breakfast.sides], recipeSteps: [...plan.breakfast.recipeSteps] },
        lunch: { ...plan.lunch, sides: [...plan.lunch.sides], recipeSteps: [...plan.lunch.recipeSteps] },
        dinner: { ...plan.dinner, sides: [...plan.dinner.sides], recipeSteps: [...plan.dinner.recipeSteps] },
        snack: { ...plan.snack, sides: [...plan.snack.sides], recipeSteps: [...plan.snack.recipeSteps] },
    };
}

function rebalanceMealNutrient(nutrient: MealSuggestion['nutrient'], carbDelta: number, proteinDelta: number) {
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

    return { carb, protein, fat };
}

type IntakeCorrectionContext = {
    stageType: StageType;
    bmi: number | null;
};

function computeIntakeRecordReliability(log: DayLog) {
    const allItems = REPORT_SLOT_ORDER.flatMap((slot) => slotItems(log, slot));
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
    const skippedMeals = (['breakfast', 'lunch', 'dinner'] as const).reduce((count, slot) => {
        const hasEaten = slotItems(yesterdayLog, slot).some((item) => item.eaten);
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

        (['breakfast', 'lunch', 'dinner'] as const).forEach((slot) => {
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

        (['breakfast', 'lunch', 'dinner'] as const).forEach((slot) => {
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

function preferenceLabel(value: PreferenceType) {
    return PREFERENCE_OPTIONS.find((option) => option.key === value)?.label ?? value;
}

function StageLabel({ stage }: { stage: TreatmentStageRow | null }) {
    if (!stage) {
        return <span>미입력</span>;
    }
    const statusText = stage.status === 'active' ? '진행중' : stage.status === 'completed' ? '완료' : '예정';
    return (
        <span>
            {STAGE_TYPE_LABELS[stage.stage_type]} / {stage.stage_label?.trim() || '미입력'} / {stage.stage_order}순서 / {statusText}
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
    const [additionalConditions, setAdditionalConditions] = useState<AdditionalCondition[]>([]);
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});

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

    const userSelectedTodayPreferences = useMemo(() => dailyPreferences[todayKey] ?? [], [dailyPreferences, todayKey]);
    const adaptiveTodayPreferences = useMemo(
        () => recommendAdaptivePreferencesByRecentLogs(logs, todayKey),
        [logs, todayKey]
    );
    const confirmedTodayPreferences = useMemo(
        () => mergePreferences(adaptiveTodayPreferences, userSelectedTodayPreferences),
        [adaptiveTodayPreferences, userSelectedTodayPreferences]
    );
    const bmi = useMemo(() => {
        const validHeight = userDietContext.heightCm && userDietContext.heightCm > 0 ? userDietContext.heightCm : null;
        const validWeight = userDietContext.weightKg && userDietContext.weightKg > 0 ? userDietContext.weightKg : null;
        if (!validHeight || !validWeight) {
            return null;
        }
        return Number((validWeight / Math.pow(validHeight / 100, 2)).toFixed(1));
    }, [userDietContext.heightCm, userDietContext.weightKg]);

    const basePlan = useMemo(() => generatePlanForDate(todayKey, stageType, 70), [todayKey, stageType]);
    const contextAdjusted = useMemo(() => optimizePlanByUserContext(basePlan, userDietContext), [basePlan, userDietContext]);
    const medicationAdjusted = useMemo(
        () => optimizePlanByMedications(contextAdjusted.plan, medications),
        [contextAdjusted.plan, medications]
    );
    const preferenceAdjusted = useMemo(() => {
        if (confirmedTodayPreferences.length === 0) {
            return {
                plan: medicationAdjusted.plan,
                notes: [] as string[],
            };
        }
        return optimizePlanByPreference(medicationAdjusted.plan, confirmedTodayPreferences);
    }, [medicationAdjusted.plan, confirmedTodayPreferences]);
    const yesterdayAdjusted = useMemo(
        () => applyYesterdayIntakeCorrection(todayKey, preferenceAdjusted.plan, logs, { stageType, bmi }),
        [todayKey, preferenceAdjusted.plan, logs, stageType, bmi]
    );

    const getPlanBeforeNoRepeatForDate = useCallback(
        (dateKey: string) => {
            const dateBasePlan = generatePlanForDate(dateKey, stageType, 70);
            const dateContextAdjusted = optimizePlanByUserContext(dateBasePlan, userDietContext);
            const dateMedicationAdjusted = optimizePlanByMedications(dateContextAdjusted.plan, medications);
            const datePreferences = dailyPreferences[dateKey] ?? [];
            const adaptivePreferences = recommendAdaptivePreferencesByRecentLogs(logs, dateKey);
            const appliedPreferences = mergePreferences(adaptivePreferences, datePreferences);
            const datePreferenceAdjusted =
                appliedPreferences.length === 0
                    ? {
                          plan: dateMedicationAdjusted.plan,
                      }
                    : optimizePlanByPreference(dateMedicationAdjusted.plan, appliedPreferences);

            return applyYesterdayIntakeCorrection(dateKey, datePreferenceAdjusted.plan, logs, {
                stageType,
                bmi,
            }).plan;
        },
        [stageType, userDietContext, medications, dailyPreferences, logs, bmi]
    );

    const recentHistoryPlans = useMemo(
        () =>
            Array.from({ length: NO_REPEAT_DAYS }, (_, index) => {
                const historyDateKey = offsetDateKey(todayKey, -(NO_REPEAT_DAYS - index));
                return getPlanBeforeNoRepeatForDate(historyDateKey);
            }),
        [todayKey, getPlanBeforeNoRepeatForDate]
    );

    const noRepeatAdjusted = useMemo(
        () => applySevenDayNoRepeatRule(yesterdayAdjusted.plan, recentHistoryPlans, NO_REPEAT_DAYS),
        [yesterdayAdjusted.plan, recentHistoryPlans]
    );

    const finalPlan: DayPlan = noRepeatAdjusted.plan;
    const profileMatch = useMemo(() => detectCancerProfileMatch(userDietContext.cancerType), [userDietContext.cancerType]);
    const mergedNotes = useMemo(
        () => [
            ...contextAdjusted.notes,
            ...medicationAdjusted.notes,
            ...preferenceAdjusted.notes,
            ...yesterdayAdjusted.notes,
            ...noRepeatAdjusted.notes,
        ],
        [contextAdjusted.notes, medicationAdjusted.notes, preferenceAdjusted.notes, yesterdayAdjusted.notes, noRepeatAdjusted.notes]
    );

    const reviewWarnings = useMemo(() => {
        const warnings: string[] = [];
        if (!userDietContext.cancerType?.trim()) {
            warnings.push('암 종류가 입력되지 않아 기본 안전식 규칙 위주로 추천되었습니다.');
        }
        if (!profileMatch && userDietContext.cancerType?.trim()) {
            warnings.push('현재 암종은 전용 프로필이 없어 일반 안전식 규칙을 적용했습니다.');
        }
        if (!activeStage) {
            warnings.push('활성 치료 단계 정보가 없어 보수적인 기본 단계로 계산되었습니다.');
        }
        if (medicationSchedules.length === 0) {
            warnings.push('복용 시기 데이터가 없어 식후 복용 맞춤 조정이 제외되었습니다.');
        }
        if (confirmedTodayPreferences.length === 0) {
            warnings.push('당일 선호 방향이 없어 기본 균형형이 유지되었습니다.');
        }
        if (Object.keys(logs).length === 0) {
            warnings.push('식단 기록이 없어 전날 섭취 보정 강도는 기본값으로 계산되었습니다.');
        }
        return warnings;
    }, [userDietContext.cancerType, profileMatch, activeStage, medicationSchedules.length, confirmedTodayPreferences.length, logs]);

    const loadInitial = useCallback(async () => {
        setLoading(true);

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
        const metadata = readIamfineMetadata(user.user_metadata);
        const localTreatmentMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
        const resolvedTreatmentMeta = metadata.treatmentMeta ?? localTreatmentMeta;
        setTreatmentMeta(resolvedTreatmentMeta);
        setAdditionalConditions(metadata.additionalConditions);

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
        let serverLogs: Record<string, DayLog> = {};
        const { data: serverLogRows, error: serverLogsError } = await supabase
            .from(DIET_DAILY_LOGS_TABLE)
            .select('date_key, log_payload')
            .eq('user_id', uid)
            .order('date_key', { ascending: true });
        if (serverLogsError) {
            console.error('서버 기록 조회 실패', serverLogsError);
        } else {
            serverLogs = parseServerDietLogs(serverLogRows as unknown);
        }
        const mergedLogs = {
            ...store.logs,
            ...serverLogs,
        };
        const resolvedDailyPreferences =
            Object.keys(metadata.dailyPreferences).length > 0
                ? metadata.dailyPreferences
                : store.dailyPreferences;
        const resolvedMedications = store.medications.length > 0 ? store.medications : metadata.medications;
        const resolvedMedicationSchedules =
            store.medicationSchedules.length > 0 ? store.medicationSchedules : metadata.medicationSchedules;

        if (!localTreatmentMeta && resolvedTreatmentMeta) {
            localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
        }
        if (
            (store.medications.length === 0 && resolvedMedications.length > 0) ||
            (store.medicationSchedules.length === 0 && resolvedMedicationSchedules.length > 0) ||
            Object.keys(serverLogs).length > 0 ||
            Object.keys(metadata.dailyPreferences).length > 0
        ) {
            localStorage.setItem(
                getStoreKey(uid),
                JSON.stringify({
                    ...store,
                    medications: resolvedMedications,
                    medicationSchedules: resolvedMedicationSchedules,
                    logs: mergedLogs,
                    dailyPreferences: resolvedDailyPreferences,
                } satisfies DietStore)
            );
        }

        setMedications(resolvedMedications);
        setMedicationSchedules(resolvedMedicationSchedules);
        setDailyPreferences(resolvedDailyPreferences);
        setLogs(mergedLogs);
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
                    <p>- 암 정보: {userDietContext.cancerType?.trim() || '미입력'}</p>
                    <p>
                        - 추가 질병: {additionalConditions.length > 0
                            ? additionalConditions.map((item) => `${item.name}(${item.code})`).join(', ')
                            : '없음'}
                    </p>
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
                    <p>
                        - 사용자 선택 선호: {userSelectedTodayPreferences.length > 0
                            ? userSelectedTodayPreferences.map((item) => preferenceLabel(item)).join(', ')
                            : '없음'}
                    </p>
                    <p>
                        - 기록 자동 반영 선호: {adaptiveTodayPreferences.length > 0
                            ? adaptiveTodayPreferences.map((item) => preferenceLabel(item)).join(', ')
                            : '없음'}
                    </p>
                    <p>
                        - 최종 선호 반영: {confirmedTodayPreferences.length > 0
                            ? confirmedTodayPreferences.map((item) => preferenceLabel(item)).join(', ')
                            : '없음'}
                    </p>
                </div>
            </section>

            <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-100">
                <p className="font-semibold">식단 생성 데이터 출처</p>
                <div className="mt-2 space-y-1">
                    <p>- 생성 방식: 외부 식단 API를 조회하지 않고 내부 규칙 엔진으로 계산합니다.</p>
                    <p>- 반영 데이터: 사용자 프로필, 암 정보, 치료 단계, 복용 약/복용 시기, 최근 식단 기록.</p>
                    <p>- 영양비율: 암환자 일반 영양 원칙(단백질 유지, 정제 탄수화물 과다 억제)을 기준으로 보수적으로 배분합니다.</p>
                    <p className="mt-1 text-xs text-indigo-800 dark:text-indigo-200">
                        참고 근거:
                        {' '}
                        <a
                            href="https://www.cancer.gov/about-cancer/treatment/side-effects/appetite-loss/nutrition-pdq"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold underline"
                        >
                            NCI 영양 가이드
                        </a>
                        {' · '}
                        <a
                            href="https://www.cancer.org/cancer/survivorship/coping/nutrition.html"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold underline"
                        >
                            ACS 영양 권고
                        </a>
                        {' · '}
                        <a
                            href="https://pubmed.ncbi.nlm.nih.gov/33946039/"
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold underline"
                        >
                            ESPEN 암 환자 영양 가이드라인
                        </a>
                    </p>
                </div>
            </section>

            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                <p className="font-semibold">암종 프로필 매칭 근거</p>
                <div className="mt-2">
                    {profileMatch ? (
                        <div className="rounded-lg border border-emerald-200 bg-white/70 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                            <p className="text-xs text-emerald-700 dark:text-emerald-300">매칭 프로필</p>
                            <p className="mt-1 text-base font-bold text-emerald-900 dark:text-emerald-100">{profileMatch.profileLabel}</p>
                        </div>
                    ) : (
                        <p>- 전용 암종 프로필 미매칭: 일반 안전식 + 치료 단계 규칙으로 계산</p>
                    )}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">규칙 적용 로그</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-4">
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
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">3) 당일/자동 선호 반영</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {preferenceAdjusted.notes.length > 0 ? (
                                preferenceAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">4) 전날 기록 보정 반영</p>
                        <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            {yesterdayAdjusted.notes.length > 0 ? (
                                yesterdayAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
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
