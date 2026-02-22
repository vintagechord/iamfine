'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    applySevenDayNoRepeatRule,
    formatDateLabel,
    generatePlanForDate,
    generateMonthPlans,
    optimizePlanByMedications,
    optimizePlanByPreference,
    optimizePlanByUserContext,
    PREFERENCE_OPTIONS,
    STAGE_TYPE_LABELS,
    type DayPlan,
    type PreferenceType,
    type StageType,
    type UserDietContext,
    type UserMedicationSchedule,
} from '@/lib/dietEngine';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

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

const DISCLAIMER_TEXT =
    '이 서비스는 참고용 식단/기록 도구이며, 치료·약물 관련 결정은 반드시 의료진과 상의하세요.';

const STORAGE_PREFIX = 'diet-store-v2';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const DIET_DAILY_LOGS_TABLE = 'diet_daily_logs';
const USER_METADATA_NAMESPACE = 'iamfine';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TWO_WEEK_DAYS = 14;
const NO_REPEAT_DAYS = 30;

const PREFERENCE_LABELS = Object.fromEntries(
    PREFERENCE_OPTIONS.map((option) => [option.key, option.label])
) as Record<PreferenceType, string>;

const PREFERENCE_KEYS = new Set<PreferenceType>(PREFERENCE_OPTIONS.map((option) => option.key));

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

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
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
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            dailyLogs: {} as Record<string, DayLog>,
        };
    }

    const scoped = namespaced as Record<string, unknown>;
    return {
        treatmentMeta: parseTreatmentMetaFromUnknown(scoped.treatmentMeta),
        medications: parseMedicationNamesFromUnknown(scoped.medications),
        medicationSchedules: parseMedicationSchedulesFromUnknown(scoped.medicationSchedules),
        dailyPreferences: normalizeDailyPreferencesRecord(scoped.dailyPreferences),
        dailyLogs: parseMetadataDailyLogsFromUnknown(scoped.dailyLogs),
    };
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

function normalizePreferences(value: unknown): PreferenceType[] {
    return normalizePreferenceList(value);
}

function normalizeMedicationNames(value: unknown) {
    if (!Array.isArray(value)) {
        return [] as string[];
    }

    return Array.from(
        new Set(
            value.filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter(Boolean)
        )
    );
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
        const fallbackMedications = Array.from(
            new Set(medicationSchedules.map((item) => item.name.trim()).filter(Boolean))
        );

        return {
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
            medications: normalizedMedications.length > 0 ? normalizedMedications : fallbackMedications,
            medicationSchedules,
            logs: parsedLogs,
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

function parseTrackItemsFromUnknown(raw: unknown, slot: 'breakfast' | 'lunch' | 'dinner' | 'snack', dateKey: string) {
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

    if (!normalizedRaw || typeof normalizedRaw !== 'object' || Array.isArray(normalizedRaw)) {
        return null;
    }

    const candidate = normalizedRaw as Partial<DayLog>;
    const mealsRaw =
        candidate.meals && typeof candidate.meals === 'object' && !Array.isArray(candidate.meals)
            ? (candidate.meals as Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', unknown>>)
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

function parseMetadataDailyLogsFromUnknown(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {} as Record<string, DayLog>;
    }

    return Object.entries(raw as Record<string, unknown>).reduce(
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

export default function DietCalendarPage() {
    const now = new Date();

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stageType, setStageType] = useState<StageType>('other');
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});
    const [monthValue, setMonthValue] = useState(toMonthInputValue(now.getFullYear(), now.getMonth()));

    const { year, month } = useMemo(() => parseMonthKey(monthValue), [monthValue]);
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

            const { user, error: authError } = await getAuthSessionUser();
            if (authError || !user) {
                setUserId(null);
                setProfile(null);
                setTreatmentMeta(null);
                setDailyPreferences({});
                setMedications([]);
                setMedicationSchedules([]);
                setLogs({});
                setStageType('other');
                setLoading(false);
                return;
            }

            const uid = user.id;
            setUserId(uid);
            const metadata = readIamfineMetadata(user.user_metadata);
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
            let serverLogs: Record<string, DayLog> = {};
            const { data: serverLogRows, error: serverLogsError } = await supabase
                .from(DIET_DAILY_LOGS_TABLE)
                .select('date_key, log_payload')
                .eq('user_id', uid)
                .order('date_key', { ascending: true });
            if (serverLogsError) {
                if (!isDietLogTableMissingError(serverLogsError)) {
                    console.error('서버 기록 조회 실패', serverLogsError);
                }
            } else {
                serverLogs = parseServerDietLogs(serverLogRows as unknown);
            }
            const mergedLogs = {
                ...metadata.dailyLogs,
                ...parsed.logs,
                ...serverLogs,
            };
            const resolvedMedications = metadata.medications.length > 0 ? metadata.medications : parsed.medications;
            const resolvedMedicationSchedules =
                metadata.medicationSchedules.length > 0 ? metadata.medicationSchedules : parsed.medicationSchedules;
            const resolvedDailyPreferences =
                Object.keys(metadata.dailyPreferences).length > 0
                    ? metadata.dailyPreferences
                    : parsed.dailyPreferences;

            if (!localTreatmentMeta && resolvedTreatmentMeta) {
                localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
            }
            if (
                JSON.stringify(parsed.medications) !== JSON.stringify(resolvedMedications) ||
                JSON.stringify(parsed.medicationSchedules) !== JSON.stringify(resolvedMedicationSchedules) ||
                Object.keys(serverLogs).length > 0 ||
                Object.keys(metadata.dailyPreferences).length > 0
            ) {
                localStorage.setItem(
                    getStoreKey(uid),
                    JSON.stringify({
                        ...parsed,
                        medications: resolvedMedications,
                        medicationSchedules: resolvedMedicationSchedules,
                        logs: mergedLogs,
                        dailyPreferences: resolvedDailyPreferences,
                    } satisfies DietStore)
                );
            }
            setDailyPreferences(resolvedDailyPreferences);
            setMedications(resolvedMedications);
            setMedicationSchedules(resolvedMedicationSchedules);
            setLogs(mergedLogs);
            setLoading(false);
        };

        const timer = window.setTimeout(() => {
            void loadContext();
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const monthPlans = useMemo(() => {
        const basePlans = generateMonthPlans(year, month, stageType, 70);
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
            const yesterdayAdjusted = applyYesterdayIntakeCorrection(dateKey, preferenceAdjusted.plan, logs, {
                stageType,
                bmi,
            });

            const source =
                byDatePreferences && byDatePreferences.length > 0
                    ? adaptivePreferences.length > 0
                        ? ('당일 확정 + 기록 자동 반영' as const)
                        : ('당일 확정' as const)
                    : adaptivePreferences.length > 0
                      ? ('기록 자동 반영' as const)
                      : ('' as const);

            return {
                plan: yesterdayAdjusted.plan,
                appliedPreferences,
                source,
            };
        };

        const firstDateKey = basePlans[0]?.date;
        const rollingHistory =
            firstDateKey === undefined
                ? ([] as Array<ReturnType<typeof buildAdjustedPlanByDate>['plan']>)
                : Array.from({ length: NO_REPEAT_DAYS }, (_, index) => {
                      const historyDateKey = offsetDateKey(firstDateKey, -(NO_REPEAT_DAYS - index));
                      return buildAdjustedPlanByDate(historyDateKey).plan;
                  });

        return basePlans.map((basePlan) => {
            const adjusted = buildAdjustedPlanByDate(basePlan.date);
            const noRepeatAdjusted = applySevenDayNoRepeatRule(adjusted.plan, rollingHistory, NO_REPEAT_DAYS);
            rollingHistory.push(noRepeatAdjusted.plan);
            if (rollingHistory.length > NO_REPEAT_DAYS) {
                rollingHistory.shift();
            }

            return {
                plan: noRepeatAdjusted.plan,
                appliedPreferences: adjusted.appliedPreferences,
                source: adjusted.source,
            };
        });
    }, [year, month, stageType, userDietContext, medications, dailyPreferences, logs, bmi]);

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">월간 식단표</h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            현재 치료 단계: {STAGE_TYPE_LABELS[stageType]}
                        </p>
                    </div>
                    <div className="galaxySafeActions w-full sm:w-auto">
                        <Link
                            href="/diet"
                            className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            오늘 기록하기
                        </Link>
                        <Link
                            href="/"
                            className="shrink-0 whitespace-nowrap rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">전체 식단표</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            월 단위로 아침/점심/저녁/간식을 한 번에 확인할 수 있어요.
                        </p>
                    </div>
                    <label className="w-full text-sm font-medium text-gray-700 dark:text-gray-200 sm:w-auto">
                        월 선택
                        <input
                            type="month"
                            aria-label="월 선택"
                            enterKeyHint="done"
                            value={monthValue}
                            onChange={(event) => setMonthValue(event.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 sm:w-auto"
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
                                        <span className="font-semibold">간식</span>: {plan.snack.summary}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                <p>{DISCLAIMER_TEXT}</p>
            </section>
        </main>
    );
}
