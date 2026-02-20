'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    applySevenDayNoRepeatRule,
    formatDateKey,
    formatDateLabel,
    generatePlanForDate,
    optimizePlanByMedications,
    optimizePlanByPreference,
    optimizePlanByUserContext,
    STAGE_TYPE_LABELS,
    type DayPlan,
    type PreferenceType,
    type StageType,
    type UserDietContext,
    type UserMedicationSchedule,
} from '@/lib/dietEngine';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type StageStatus = 'planned' | 'active' | 'completed';

type TreatmentStageRow = {
    id: string;
    stage_type: StageType;
    stage_label?: string | null;
    stage_order: number;
    status: StageStatus;
    created_at: string;
};

type ProfileRow = {
    user_id: string;
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
    preferences?: PreferenceType[];
    dailyPreferences?: Record<string, PreferenceType[]>;
    carryPreferences?: PreferenceType[];
    medications?: string[];
    medicationSchedules?: MedicationSchedule[];
    logs?: Record<string, DayLog>;
};

type TrackItem = {
    id?: string;
    name: string;
    eaten: boolean;
    notEaten?: boolean;
    servings?: number;
};

type DayLog = {
    meals: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', TrackItem[]>>;
    memo?: string;
    medicationTakenIds?: string[];
};

type CategoryKey =
    | '곡물/밥'
    | '단백질 식품'
    | '채소/과일'
    | '국/수프 재료'
    | '단 음식/간식'
    | '면·간편식'
    | '기타';

type GroceryCategory = {
    category: CategoryKey;
    items: Array<{ name: string; count: number; amount: string }>;
};

type CountUnit = '개' | '모' | '마리' | '알' | '장' | '송이' | '통' | '포기' | '봉';

type QuantityRule =
    | {
          kind: 'count';
          unit: CountUnit;
          perUse: number;
      }
    | {
          kind: 'weight';
          perUseGram: number;
          preferKg?: boolean;
      }
    | {
          kind: 'volume';
          perUseMl: number;
      };

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const SHOPPING_MEMO_PREFIX = 'shopping-memo-v1';
const USER_METADATA_NAMESPACE = 'iamfine';
const TWO_WEEK_DAYS = 14;
const NO_REPEAT_DAYS = 30;
const PREFERENCE_KEYS = new Set<PreferenceType>([
    'spicy',
    'sweet',
    'meat',
    'pizza',
    'healthy',
    'fish',
    'sashimi',
    'sushi',
    'cool_food',
    'warm_food',
    'soft_food',
    'soupy',
    'high_protein',
    'vegetable',
    'bland',
    'appetite_boost',
    'digestive',
    'low_salt',
    'noodle',
    'weight_loss',
]);

const CATEGORY_ORDER: CategoryKey[] = [
    '곡물/밥',
    '단백질 식품',
    '채소/과일',
    '국/수프 재료',
    '단 음식/간식',
    '면·간편식',
    '기타',
];

const PANTRY_INGREDIENTS = new Set([
    '물',
    '따뜻한 물',
    '소금',
    '설탕',
    '시럽',
    '식용유',
    '올리브유',
    '참기름',
    '들기름',
    '카놀라유',
    '간장',
    '된장',
    '고추장',
    '식초',
    '고춧가루',
    '후추',
    '양념',
    '소스',
    '드레싱',
    '토마토소스',
]);

const INGREDIENT_RULES: Array<{ pattern: RegExp; ingredient: string }> = [
    { pattern: /현미밥|현미/, ingredient: '현미' },
    { pattern: /잡곡밥|잡곡/, ingredient: '잡곡쌀' },
    { pattern: /귀리밥|귀리/, ingredient: '귀리' },
    { pattern: /보리밥|보리/, ingredient: '보리' },
    { pattern: /흑미밥|흑미/, ingredient: '흑미' },
    { pattern: /기장밥|기장/, ingredient: '기장' },
    { pattern: /죽/, ingredient: '쌀' },
    { pattern: /달걀두부|두부달걀/, ingredient: '달걀' },
    { pattern: /달걀두부|두부달걀/, ingredient: '두부' },
    { pattern: /닭가슴살/, ingredient: '닭가슴살' },
    { pattern: /닭안심/, ingredient: '닭안심' },
    { pattern: /소고기/, ingredient: '소고기' },
    { pattern: /돼지안심|돼지고기/, ingredient: '돼지안심' },
    { pattern: /연어/, ingredient: '연어' },
    { pattern: /흰살생선|생선찜|생선숙회|생선초밥/, ingredient: '흰살생선' },
    { pattern: /고등어/, ingredient: '고등어' },
    { pattern: /두부|연두부/, ingredient: '두부' },
    { pattern: /달걀|계란/, ingredient: '달걀' },
    { pattern: /콩/, ingredient: '콩류' },
    { pattern: /요거트|그릭요거트/, ingredient: '무가당 요거트' },
    { pattern: /두유/, ingredient: '무가당 두유' },
    { pattern: /브로콜리/, ingredient: '브로콜리' },
    { pattern: /버섯/, ingredient: '버섯' },
    { pattern: /시금치/, ingredient: '시금치' },
    { pattern: /오이/, ingredient: '오이' },
    { pattern: /당근/, ingredient: '당근' },
    { pattern: /애호박/, ingredient: '애호박' },
    { pattern: /단호박/, ingredient: '단호박' },
    { pattern: /양배추/, ingredient: '양배추' },
    { pattern: /배추/, ingredient: '배추' },
    { pattern: /(?:^|\s)무(?:\s|$)|무피클/, ingredient: '무' },
    { pattern: /미나리/, ingredient: '미나리' },
    { pattern: /토마토/, ingredient: '토마토' },
    { pattern: /가지/, ingredient: '가지' },
    { pattern: /상추/, ingredient: '상추' },
    { pattern: /아스파라거스/, ingredient: '아스파라거스' },
    { pattern: /냉이/, ingredient: '냉이' },
    { pattern: /달래/, ingredient: '달래' },
    { pattern: /두릅/, ingredient: '두릅' },
    { pattern: /쑥/, ingredient: '쑥' },
    { pattern: /완두콩/, ingredient: '완두콩' },
    { pattern: /옥수수/, ingredient: '옥수수' },
    { pattern: /레몬/, ingredient: '레몬' },
    { pattern: /나물/, ingredient: '나물채소' },
    { pattern: /채소|샐러드|구운채소/, ingredient: '채소믹스' },
    { pattern: /해초/, ingredient: '해초' },
    { pattern: /미역/, ingredient: '마른미역' },
    { pattern: /멸치/, ingredient: '멸치' },
    { pattern: /또띠아/, ingredient: '통밀 또띠아' },
    { pattern: /피자/, ingredient: '통밀 또띠아' },
    { pattern: /피자/, ingredient: '채소믹스' },
    { pattern: /국수|소면|면|파스타|라면/, ingredient: '면류' },
    { pattern: /제철 과일|과일/, ingredient: '제철 과일' },
    { pattern: /바나나/, ingredient: '바나나' },
    { pattern: /사과/, ingredient: '사과' },
    { pattern: /배 조각|(?:^|\s)배(?:\s|$)/, ingredient: '배' },
    { pattern: /키위/, ingredient: '키위' },
    { pattern: /딸기/, ingredient: '딸기' },
    { pattern: /베리/, ingredient: '베리류' },
    { pattern: /복숭아/, ingredient: '복숭아' },
    { pattern: /자두/, ingredient: '자두' },
    { pattern: /감/, ingredient: '감' },
    { pattern: /귤/, ingredient: '귤' },
    { pattern: /고구마/, ingredient: '고구마' },
    { pattern: /호두/, ingredient: '호두' },
    { pattern: /아몬드/, ingredient: '아몬드' },
    { pattern: /견과/, ingredient: '견과류' },
];

const QUANTITY_RULES: Array<{ pattern: RegExp; rule: QuantityRule }> = [
    { pattern: /현미|잡곡쌀|귀리|보리|흑미|기장|쌀/, rule: { kind: 'weight', perUseGram: 70, preferKg: true } },
    { pattern: /닭가슴살|닭안심/, rule: { kind: 'weight', perUseGram: 100 } },
    { pattern: /소고기|돼지안심/, rule: { kind: 'weight', perUseGram: 90 } },
    { pattern: /연어/, rule: { kind: 'weight', perUseGram: 100 } },
    { pattern: /흰살생선|고등어/, rule: { kind: 'count', unit: '마리', perUse: 0.5 } },
    { pattern: /두부/, rule: { kind: 'count', unit: '모', perUse: 0.5 } },
    { pattern: /달걀/, rule: { kind: 'count', unit: '알', perUse: 1 } },
    { pattern: /콩류/, rule: { kind: 'weight', perUseGram: 40 } },
    { pattern: /요거트/, rule: { kind: 'weight', perUseGram: 90 } },
    { pattern: /두유/, rule: { kind: 'volume', perUseMl: 190 } },
    { pattern: /브로콜리/, rule: { kind: 'count', unit: '송이', perUse: 0.5 } },
    { pattern: /버섯/, rule: { kind: 'weight', perUseGram: 60 } },
    { pattern: /시금치|나물채소|상추|미나리|냉이|달래|두릅|쑥/, rule: { kind: 'weight', perUseGram: 70 } },
    { pattern: /오이|당근|애호박|가지|토마토/, rule: { kind: 'count', unit: '개', perUse: 0.5 } },
    { pattern: /단호박/, rule: { kind: 'count', unit: '통', perUse: 0.25 } },
    { pattern: /양배추/, rule: { kind: 'count', unit: '통', perUse: 0.25 } },
    { pattern: /배추/, rule: { kind: 'count', unit: '포기', perUse: 0.25 } },
    { pattern: /무/, rule: { kind: 'count', unit: '개', perUse: 0.2 } },
    { pattern: /해초/, rule: { kind: 'weight', perUseGram: 30 } },
    { pattern: /마른미역/, rule: { kind: 'weight', perUseGram: 10 } },
    { pattern: /멸치/, rule: { kind: 'weight', perUseGram: 15 } },
    { pattern: /통밀 또띠아/, rule: { kind: 'count', unit: '장', perUse: 1 } },
    { pattern: /면류/, rule: { kind: 'weight', perUseGram: 90 } },
    { pattern: /바나나|사과|배|키위|복숭아|자두|감|귤/, rule: { kind: 'count', unit: '개', perUse: 0.5 } },
    { pattern: /딸기|베리류|제철 과일/, rule: { kind: 'weight', perUseGram: 80 } },
    { pattern: /고구마/, rule: { kind: 'weight', perUseGram: 100 } },
    { pattern: /아몬드|호두|견과류/, rule: { kind: 'weight', perUseGram: 15 } },
    { pattern: /채소믹스|아스파라거스|완두콩|옥수수|레몬/, rule: { kind: 'weight', perUseGram: 80 } },
];

const HALF_COUNT_UNITS = new Set<CountUnit>(['개', '모', '마리', '송이', '통', '포기']);

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

function getShoppingMemoKey(userId: string | null) {
    return userId ? `${SHOPPING_MEMO_PREFIX}:${userId}` : `${SHOPPING_MEMO_PREFIX}:guest`;
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
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
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
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
            medications: Array.isArray(parsed.medications) ? parsed.medications : [],
            medicationSchedules,
            logs: parsed.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, DayLog>) : {},
        };
    } catch {
        return {
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            carryPreferences: [] as PreferenceType[],
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
            logs: {} as Record<string, DayLog>,
        };
    }
}

function offsetDateKey(baseDateKey: string, offset: number) {
    const [year, month, day] = baseDateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + offset);
    return formatDateKey(date);
}

function dateRangeKeys(startDateKey: string, days: number) {
    return Array.from({ length: days }, (_, index) => offsetDateKey(startDateKey, index));
}

function slotItems(log: DayLog, slot: 'breakfast' | 'lunch' | 'dinner' | 'snack') {
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

function mergePreferences(...lists: Array<PreferenceType[]>) {
    const merged = new Set<PreferenceType>();
    lists.forEach((list) => {
        list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
}

function eatenTrackItems(log: DayLog) {
    const slots: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = ['breakfast', 'lunch', 'dinner', 'snack'];
    return slots.flatMap((slot) => slotItems(log, slot).filter((item) => item.eaten));
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

function rebalanceMealNutrient(
    nutrient: { carb: number; protein: number; fat: number },
    carbDelta: number,
    proteinDelta: number
) {
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
    const slots: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = ['breakfast', 'lunch', 'dinner', 'snack'];
    const allItems = slots.flatMap((slot) => slotItems(log, slot));
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
    }

    return {
        plan: adjusted,
        notes,
    };
}

function classifyItem(item: string): CategoryKey {
    if (
        /요거트|두유|바나나|사과|키위|딸기|베리|고구마|아몬드|견과|복숭아|자두|감|귤/.test(item) ||
        item === '배' ||
        item === '제철 과일'
    ) {
        return '단 음식/간식';
    }
    if (/현미|잡곡쌀|귀리|보리|흑미|기장|쌀/.test(item)) {
        return '곡물/밥';
    }
    if (/닭|소고기|돼지|연어|생선|고등어|두부|달걀|콩/.test(item)) {
        return '단백질 식품';
    }
    if (
        /브로콜리|버섯|시금치|오이|당근|애호박|단호박|양배추|배추|무|미나리|채소|해초|토마토|가지|상추|나물|냉이|달래|두릅|아스파라거스|쑥|완두콩|옥수수|레몬/.test(
            item
        )
    ) {
        return '채소/과일';
    }
    if (/미역|멸치/.test(item)) {
        return '국/수프 재료';
    }
    if (/면류|또띠아/.test(item)) {
        return '면·간편식';
    }
    return '기타';
}

function extractIngredientsFromLabel(label: string) {
    const cleaned = label
        .replace(/[()+,/]/g, ' ')
        .replace(/저염|저당|무가당|소량|담백한|따뜻한|익힌|부드러운|그린|저지방|저자극|새콤한|매콤한|제철|반\s*개|조각|모둠/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) {
        return [] as string[];
    }

    const found = new Set<string>();
    INGREDIENT_RULES.forEach((rule) => {
        if (rule.pattern.test(cleaned)) {
            found.add(rule.ingredient);
        }
    });

    return Array.from(found).filter((ingredient) => !PANTRY_INGREDIENTS.has(ingredient));
}

function roundToHalf(value: number) {
    return Math.round(value * 2) / 2;
}

function formatCountAmount(totalCount: number, unit: CountUnit) {
    const normalized = HALF_COUNT_UNITS.has(unit)
        ? Math.max(0.5, roundToHalf(totalCount))
        : Math.max(1, Math.ceil(totalCount));

    if (HALF_COUNT_UNITS.has(unit) && normalized === 0.5) {
        return `반 ${unit}`;
    }
    if (Number.isInteger(normalized)) {
        return `${normalized}${unit}`;
    }
    return `${normalized}${unit}`;
}

function formatWeightAmount(totalGram: number, preferKg = false) {
    const gram = Math.max(10, Math.round(totalGram / 10) * 10);
    if (preferKg || gram >= 1000) {
        const kg = Math.max(0.1, Math.round((gram / 1000) * 10) / 10);
        return `${kg}kg`;
    }
    return `${gram}g`;
}

function formatVolumeAmount(totalMl: number) {
    const ml = Math.max(100, Math.round(totalMl / 10) * 10);
    if (ml >= 1000) {
        const liter = Math.round((ml / 1000) * 10) / 10;
        return `${liter}L`;
    }
    return `${ml}ml`;
}

function estimatePurchaseAmount(item: string, count: number) {
    const matched = QUANTITY_RULES.find((rule) => rule.pattern.test(item));
    if (!matched) {
        return `${Math.max(1, count)}개`;
    }

    if (matched.rule.kind === 'count') {
        return formatCountAmount(matched.rule.perUse * count, matched.rule.unit);
    }
    if (matched.rule.kind === 'weight') {
        return formatWeightAmount(matched.rule.perUseGram * count, matched.rule.preferKg);
    }
    return formatVolumeAmount(matched.rule.perUseMl * count);
}

function collectPlanIngredients(plan: DayPlan) {
    const labels = [
        plan.breakfast.riceType,
        plan.breakfast.main,
        plan.breakfast.soup,
        ...plan.breakfast.sides,
        plan.lunch.riceType,
        plan.lunch.main,
        plan.lunch.soup,
        ...plan.lunch.sides,
        plan.dinner.riceType,
        plan.dinner.main,
        plan.dinner.soup,
        ...plan.dinner.sides,
        plan.snack.main,
        ...plan.snack.sides,
    ];

    return labels.flatMap((label) => extractIngredientsFromLabel(label));
}

function buildGroceryCategories(plans: DayPlan[]): GroceryCategory[] {
    const buckets = new Map<CategoryKey, Map<string, number>>();

    CATEGORY_ORDER.forEach((category) => {
        buckets.set(category, new Map<string, number>());
    });

    plans.forEach((plan) => {
        const items = collectPlanIngredients(plan);
        items.forEach((item) => {
            const category = classifyItem(item);
            const categoryMap = buckets.get(category);
            if (!categoryMap) {
                return;
            }
            categoryMap.set(item, (categoryMap.get(item) ?? 0) + 1);
        });
    });

    return CATEGORY_ORDER.map((category) => ({
        category,
        items: Array.from(buckets.get(category)?.entries() ?? [])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
            .map(([name, count]) => ({ name, count, amount: estimatePurchaseAmount(name, count) })),
    })).filter((row) => row.items.length > 0);
}

function buildPerishableWarnings(plans: DayPlan[], days: number) {
    const mergedText = plans
        .flatMap((plan) => collectPlanIngredients(plan))
        .join(' ');

    const warnings: string[] = [];

    if (/연어|생선|고등어|대구|참치|해산물/.test(mergedText)) {
        warnings.push('생선류는 상하기 쉬워요. 1~2일 안에 먹을 분량만 먼저 사거나 냉동 보관해 주세요.');
    }
    if (/두부|요거트|두유|우유/.test(mergedText)) {
        warnings.push('두부·유제품은 유통기한을 꼭 확인하고 앞쪽(먼저 먹을 칸)에 보관해 주세요.');
    }
    if (/시금치|상추|미나리|오이|브로콜리|버섯/.test(mergedText)) {
        warnings.push('잎채소/신선채소는 쉽게 시들 수 있어요. 손질 후 밀폐 보관하고 2~3일 내 사용해 주세요.');
    }
    if (days >= 7) {
        warnings.push('1주 이상 장보기라면 신선 재료는 한 번에 다 사지 말고 2~3번으로 나눠 사면 더 좋아요.');
    }

    if (warnings.length === 0) {
        warnings.push('상하기 쉬운 재료는 소량으로 자주 구매하고, 먼저 산 재료부터 사용하는 순서를 지켜 주세요.');
    }

    return warnings;
}

export default function ShoppingPage() {
    const todayKey = formatDateKey(new Date());

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stageType, setStageType] = useState<StageType>('other');
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});

    const [startDateKey, setStartDateKey] = useState(todayKey);
    const [rangeDays, setRangeDays] = useState(3);
    const [memo, setMemo] = useState('');
    const [memoSavedAt, setMemoSavedAt] = useState('');
    const [showPlanSummary, setShowPlanSummary] = useState(false);
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
            activeStageType: stageType,
            medicationSchedules: contextMedicationSchedules,
        };
    }, [profile, treatmentMeta, stageType, medicationSchedules]);
    const bmi = useMemo(() => {
        const validHeight = userDietContext.heightCm && userDietContext.heightCm > 0 ? userDietContext.heightCm : null;
        const validWeight = userDietContext.weightKg && userDietContext.weightKg > 0 ? userDietContext.weightKg : null;
        if (!validHeight || !validWeight) {
            return null;
        }
        return Number((validWeight / Math.pow(validHeight / 100, 2)).toFixed(1));
    }, [userDietContext.heightCm, userDietContext.weightKg]);

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
                setProfile(null);
                setTreatmentMeta(null);
                setStageType('other');
                setMedications([]);
                setMedicationSchedules([]);
                setDailyPreferences({});
                setLogs({});
                setMemo(localStorage.getItem(getShoppingMemoKey(null)) ?? '');
                setLoading(false);
                return;
            }

            const uid = authData.user.id;
            setUserId(uid);
            const metadata = readIamfineMetadata(authData.user.user_metadata);
            const localTreatmentMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
            const resolvedTreatmentMeta = metadata.treatmentMeta ?? localTreatmentMeta;
            setTreatmentMeta(resolvedTreatmentMeta);

            const [{ data: profileData }, { data: stageData }] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('user_id, birth_year, sex, height_cm, weight_kg, ethnicity')
                    .eq('user_id', uid)
                    .maybeSingle(),
                supabase
                    .from('treatment_stages')
                    .select('id, stage_type, stage_label, stage_order, status, created_at')
                    .eq('user_id', uid)
                    .order('stage_order', { ascending: true })
                    .order('created_at', { ascending: true }),
            ]);

            const rows = (stageData ?? []) as TreatmentStageRow[];
            const activeStage = rows.find((row) => row.status === 'active') ?? rows[0];
            if (activeStage) {
                setStageType(activeStage.stage_type);
            } else {
                setStageType('other');
            }
            setProfile((profileData as ProfileRow | null) ?? null);

            const parsed = parseDietStore(localStorage.getItem(getStoreKey(uid)));
            const resolvedMedications = parsed.medications.length > 0 ? parsed.medications : metadata.medications;
            const resolvedMedicationSchedules =
                parsed.medicationSchedules.length > 0 ? parsed.medicationSchedules : metadata.medicationSchedules;

            if (!localTreatmentMeta && resolvedTreatmentMeta) {
                localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
            }
            if (
                (parsed.medications.length === 0 && resolvedMedications.length > 0) ||
                (parsed.medicationSchedules.length === 0 && resolvedMedicationSchedules.length > 0)
            ) {
                localStorage.setItem(
                    getStoreKey(uid),
                    JSON.stringify({
                        ...parsed,
                        medications: resolvedMedications,
                        medicationSchedules: resolvedMedicationSchedules,
                    } satisfies DietStore)
                );
            }
            setDailyPreferences(parsed.dailyPreferences);
            setMedications(resolvedMedications);
            setMedicationSchedules(resolvedMedicationSchedules);
            setLogs(parsed.logs);
            setMemo(localStorage.getItem(getShoppingMemoKey(uid)) ?? '');
            setLoading(false);
        };

        const timer = window.setTimeout(() => {
            void loadContext();
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const dateKeys = useMemo(
        () => dateRangeKeys(startDateKey, rangeDays),
        [startDateKey, rangeDays]
    );

    const planRows = useMemo(() => {
        const buildAdjustedPlanByDate = (dateKey: string) => {
            const basePlan = generatePlanForDate(dateKey, stageType, 70);
            const contextAdjusted = optimizePlanByUserContext(basePlan, userDietContext);
            const medicationAdjusted = optimizePlanByMedications(contextAdjusted.plan, medications);
            const byDatePreferences = dailyPreferences[dateKey];
            const adaptivePreferences = recommendAdaptivePreferencesByRecentLogs(logs, dateKey);
            const appliedPreferences = mergePreferences(adaptivePreferences, byDatePreferences ?? []);
            const preferenceAdjusted =
                appliedPreferences.length === 0
                    ? {
                          plan: medicationAdjusted.plan,
                      }
                    : optimizePlanByPreference(medicationAdjusted.plan, appliedPreferences);

            return {
                plan: applyYesterdayIntakeCorrection(dateKey, preferenceAdjusted.plan, logs, { stageType, bmi }).plan,
            };
        };

        const firstDateKey = dateKeys[0];
        const rollingHistory =
            firstDateKey === undefined
                ? ([] as DayPlan[])
                : Array.from({ length: NO_REPEAT_DAYS }, (_, index) => {
                      const historyDateKey = offsetDateKey(firstDateKey, -(NO_REPEAT_DAYS - index));
                      return buildAdjustedPlanByDate(historyDateKey).plan;
                  });

        return dateKeys.map((dateKey) => {
            const adjusted = buildAdjustedPlanByDate(dateKey);
            const noRepeatAdjusted = applySevenDayNoRepeatRule(adjusted.plan, rollingHistory, NO_REPEAT_DAYS);
            rollingHistory.push(noRepeatAdjusted.plan);
            if (rollingHistory.length > NO_REPEAT_DAYS) {
                rollingHistory.shift();
            }

            return {
                dateKey,
                plan: noRepeatAdjusted.plan,
            };
        });
    }, [dateKeys, stageType, userDietContext, medications, dailyPreferences, logs, bmi]);

    const plans = useMemo(
        () => planRows.map((row) => row.plan),
        [planRows]
    );

    const groceryCategories = useMemo(
        () => buildGroceryCategories(plans),
        [plans]
    );

    const perishableWarnings = useMemo(
        () => buildPerishableWarnings(plans, rangeDays),
        [plans, rangeDays]
    );

    const endDateKey = dateKeys[dateKeys.length - 1] ?? startDateKey;

    const saveMemo = () => {
        const key = getShoppingMemoKey(userId);
        const value = memo.trim();
        if (value.length === 0) {
            localStorage.removeItem(key);
            setMemoSavedAt('메모를 비웠어요.');
            return;
        }

        localStorage.setItem(key, memo);
        const now = new Date();
        setMemoSavedAt(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} 저장 완료`);
    };

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">장보기</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    날짜를 정하면 해당 기간 식단표를 기준으로 장볼 목록을 분야별로 추천해 드려요.
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    현재 치료 단계: {STAGE_TYPE_LABELS[stageType]}
                </p>
            </section>

            {!hasSupabaseEnv && (
                <section
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일에서 연결 설정을 확인해 주세요.</p>
                </section>
            )}

            {hasSupabaseEnv && !loading && !userId && (
                <section
                    role="alert"
                    className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 shadow-sm dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                >
                    <p className="text-sm">
                        로그인하면 오늘 확정한 방향까지 포함한 맞춤 장보기를 볼 수 있어요.{' '}
                        <Link href="/auth" className="font-semibold underline">
                            로그인/회원가입
                        </Link>
                    </p>
                </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">날짜 설정</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        시작 날짜
                        <input
                            type="date"
                            value={startDateKey}
                            onChange={(event) => setStartDateKey(event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                        />
                    </label>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        기간(일)
                        <input
                            type="number"
                            min={1}
                            max={30}
                            value={rangeDays}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                if (!Number.isFinite(next)) {
                                    return;
                                }
                                setRangeDays(Math.max(1, Math.min(30, next)));
                            }}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                        />
                    </label>
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    적용 기간: {formatDateLabel(startDateKey)} ~ {formatDateLabel(endDateKey)} ({rangeDays}일)
                </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">분야별 장볼 목록</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    식단 메뉴를 실제 구입 재료 기준으로 환산했어요. 재료별 예상 구입량(1인 기준)과 사용 횟수를 함께 보여드려요.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {groceryCategories.map((category) => (
                        <article
                            key={category.category}
                            className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40"
                        >
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{category.category}</h3>
                            <div className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                                {category.items.map((item) => (
                                    <p key={`${category.category}-${item.name}`}>
                                        - {item.name}: {item.amount} ({item.count}회 사용)
                                    </p>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-800 dark:bg-red-950/30">
                <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">상하기 쉬운 재료 주의사항</h2>
                <div className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
                    {perishableWarnings.map((warning) => (
                        <p key={warning}>- {warning}</p>
                    ))}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">장보기 개인 메모</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    마트/시장 방문 전에 필요한 내용을 간단히 적어두세요.
                </p>
                <textarea
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    placeholder="예: 채소는 2~3일치만 먼저 사기, 생선은 냉동으로 구입"
                    className="mt-3 min-h-28 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {memoSavedAt || '작성 후 저장 버튼을 눌러 보관하세요.'}
                    </p>
                    <button
                        type="button"
                        onClick={saveMemo}
                        className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                    >
                        메모 저장
                    </button>
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">기간 식단표 요약</h2>
                    <button
                        type="button"
                        onClick={() => setShowPlanSummary((prev) => !prev)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        {showPlanSummary ? '닫기' : '펼치기'}
                    </button>
                </div>

                {showPlanSummary && (
                    <>
                        {loading ? (
                            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                        ) : (
                            <div className="mt-3 grid gap-3">
                                {planRows.map((row) => (
                                    <article
                                        key={row.dateKey}
                                        className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40"
                                    >
                                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {formatDateLabel(row.dateKey)}
                                        </p>
                                        <div className="mt-2 grid gap-2 text-sm text-gray-700 dark:text-gray-200 sm:grid-cols-3">
                                            <p>
                                                <span className="font-semibold">아침</span>: {row.plan.breakfast.summary}
                                            </p>
                                            <p>
                                                <span className="font-semibold">점심</span>: {row.plan.lunch.summary}
                                            </p>
                                            <p>
                                                <span className="font-semibold">저녁</span>: {row.plan.dinner.summary}
                                            </p>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex justify-center">
                    <Link
                        href="/"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        홈으로
                    </Link>
                </div>
            </section>
        </main>
    );
}
