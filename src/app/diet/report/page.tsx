'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    applyDinnerCarbSafety,
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
import { applyFoodPersonalization, hasRenalDietRestrictions, parseFoodPersonalization, readFoodPersonalization } from '@/lib/personalization';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { applyMealRecordGuidance, buildDietRecordContext } from '@/lib/dietRecordContext';

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
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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
        dailyPreferences: normalizeDailyPreferencesRecord(scoped.dailyPreferences),
        dailyLogs: parseMetadataDailyLogsFromUnknown(scoped.dailyLogs),
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
        const normalizeMedicationNames = (value: unknown) => {
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
        };
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
        const logs =
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
        const fallbackFromSchedules = Array.from(
            new Set(medicationSchedules.map((item) => item.name.trim()).filter(Boolean))
        );

        return {
            medications: normalizedMedications.length > 0 ? normalizedMedications : fallbackFromSchedules,
            medicationSchedules,
            dailyPreferences: normalizeDailyPreferencesRecord(parsed.dailyPreferences),
            logs,
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

    if (!normalizedRaw || typeof normalizedRaw !== 'object' || Array.isArray(normalizedRaw)) {
        return null;
    }

    const candidate = normalizedRaw as Partial<DayLog>;
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
    const [foodPersonalization, setFoodPersonalization] = useState(() => parseFoodPersonalization(null));

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
            ...buildDietRecordContext(logs, todayKey),
            cancerType: treatmentMeta?.cancerType ?? '',
            cancerStage: treatmentMeta?.cancerStage ?? '',
            activeStageType: activeStage?.stage_type ?? undefined,
            activeStageLabel: activeStage?.stage_label ?? '',
            activeStageOrder: activeStage?.stage_order ?? undefined,
            activeStageStatus: activeStage?.status ?? undefined,
            medicationSchedules: contextMedicationSchedules,
            additionalConditions: contextAdditionalConditions,
        };
    }, [profile, treatmentMeta, activeStage, medicationSchedules, additionalConditions, logs, todayKey]);

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

    const renalRestricted = hasRenalDietRestrictions(userDietContext);
    const yesterdayLog = logs[offsetDateKey(todayKey, -1)];
    const lowAppetiteRisk = foodPersonalization.symptoms.length > 0
        || confirmedTodayPreferences.includes('appetite_boost')
        || (yesterdayLog ? eatenTrackItems(yesterdayLog).length <= 2 : false);
    const basePlan = useMemo(() => generatePlanForDate(todayKey, stageType, 70), [todayKey, stageType]);
    const medicationAdjusted = useMemo(
        () => renalRestricted ? { plan: basePlan, notes: [] as string[] }
            : optimizePlanByMedications(basePlan, medications),
        [basePlan, medications, renalRestricted]
    );
    const preferenceAdjusted = useMemo(() => {
        const effective = lowAppetiteRisk ? confirmedTodayPreferences.filter((item) => item !== 'weight_loss') : confirmedTodayPreferences;
        if (renalRestricted || effective.length === 0) return { plan: medicationAdjusted.plan, notes: [] as string[] };
        return optimizePlanByPreference(medicationAdjusted.plan, effective);
    }, [medicationAdjusted.plan, confirmedTodayPreferences, renalRestricted, lowAppetiteRisk]);
    const dinnerAdjusted = useMemo(() => renalRestricted
        ? { plan: preferenceAdjusted.plan, notes: [] as string[] }
        : applyDinnerCarbSafety(preferenceAdjusted.plan, {
            bmi, lowAppetiteRisk, weightLossPreference: !lowAppetiteRisk && confirmedTodayPreferences.includes('weight_loss'),
        }), [preferenceAdjusted.plan, renalRestricted, bmi, lowAppetiteRisk, confirmedTodayPreferences]);
    const yesterdayAdjusted = useMemo(() => renalRestricted || lowAppetiteRisk
        ? { plan: dinnerAdjusted.plan, notes: [] as string[] }
        : applyMealRecordGuidance(dinnerAdjusted.plan, logs[offsetDateKey(todayKey, -1)]),
    [todayKey, dinnerAdjusted.plan, logs, renalRestricted, lowAppetiteRisk]);
    const contextAdjusted = useMemo(
        () => optimizePlanByUserContext(yesterdayAdjusted.plan, userDietContext),
        [yesterdayAdjusted.plan, userDietContext]
    );
    const personalized = useMemo(
        () => applyFoodPersonalization(contextAdjusted.plan, foodPersonalization, userDietContext),
        [contextAdjusted.plan, foodPersonalization, userDietContext]
    );
    const finalPlan: DayPlan = personalized.plan;
    const profileMatch = useMemo(() => detectCancerProfileMatch(userDietContext.cancerType), [userDietContext.cancerType]);
    const mergedNotes = useMemo(
        () => [
            ...contextAdjusted.notes,
            ...medicationAdjusted.notes,
            ...preferenceAdjusted.notes,
            ...yesterdayAdjusted.notes,
            ...dinnerAdjusted.notes,
            ...personalized.notes,
        ],
        [contextAdjusted.notes, medicationAdjusted.notes, preferenceAdjusted.notes, yesterdayAdjusted.notes, dinnerAdjusted.notes, personalized.notes]
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
        setFoodPersonalization(readFoodPersonalization(user.user_metadata));
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
            if (!isDietLogTableMissingError(serverLogsError)) {
                console.error('서버 기록 조회 실패', serverLogsError);
            }
        } else {
            serverLogs = parseServerDietLogs(serverLogRows as unknown);
        }
        const mergedLogs = {
            ...metadata.dailyLogs,
            ...store.logs,
            ...serverLogs,
        };
        const resolvedDailyPreferences =
            Object.keys(metadata.dailyPreferences).length > 0
                ? metadata.dailyPreferences
                : store.dailyPreferences;
        const resolvedMedications = metadata.medications.length > 0 ? metadata.medications : store.medications;
        const resolvedMedicationSchedules =
            metadata.medicationSchedules.length > 0 ? metadata.medicationSchedules : store.medicationSchedules;

        if (!localTreatmentMeta && resolvedTreatmentMeta) {
            localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(resolvedTreatmentMeta));
        }
        if (
            JSON.stringify(store.medications) !== JSON.stringify(resolvedMedications) ||
            JSON.stringify(store.medicationSchedules) !== JSON.stringify(resolvedMedicationSchedules) ||
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
            <main className="mx-auto max-w-4xl space-y-6">
                <section className="uiCard uiPageHeader p-5 sm:p-6">
                    <h1>적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="mx-auto max-w-4xl space-y-6">
                <section className="uiCard uiPageHeader p-5 sm:p-6">
                    <h1>적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section className="uiCard p-5 text-[var(--ui-muted)] sm:p-6">
                    <p className="text-sm font-semibold">설정이 필요해요</p>
                    <p className="mt-1 text-sm">`.env.local` 파일의 Supabase 연결 설정을 확인해 주세요.</p>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="mx-auto max-w-4xl space-y-6">
                <section className="uiCard uiPageHeader p-5 sm:p-6">
                    <h1>적용 근거 리포트</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>
                <section className="uiCard p-5 text-[var(--ui-muted)] sm:p-6">
                    <p className="text-sm font-semibold">로그인이 필요해요</p>
                    <p className="mt-2 text-sm leading-relaxed">로그인하면 내 식단의 적용 근거를 확인할 수 있어요.</p>
                    <Link href="/auth" className="uiButton uiButton--primary mt-4">로그인</Link>
                </section>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-4xl space-y-6">
            <section className="uiCard uiPageHeader p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1>적용 근거 리포트</h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">생성 시각: {nowIso}</p>
                    </div>
                    <Link
                        href="/diet"
                        className="uiButton uiButton--primary w-full shrink-0 sm:w-auto"
                    >
                        식단 제안으로
                    </Link>
                </div>
            </section>

            <section className="uiCard p-5 text-sm leading-relaxed sm:p-6">
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

            <section className="uiCard p-5 text-sm leading-relaxed sm:p-6">
                <p className="font-semibold">식단 생성 데이터 출처</p>
                <div className="mt-2 space-y-1">
                    <p>- 추천 기준: 먹을 수 있는 음식 안에서 재료와 조리법이 다양하도록 구성합니다.</p>
                    <p>- 반영 데이터: 사용자 프로필, 암 정보, 치료 단계, 복용 약/복용 시기, 최근 식단 기록.</p>
                    <p>- 식품 구성: 한 달 동안 곡류·단백질 식품·채소를 분산하고, 병명과 먹기 불편한 증상·피할 재료를 반영합니다.</p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--ui-muted)]">
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

            <section className="uiCard p-5 text-sm leading-relaxed sm:p-6">
                <p className="font-semibold">암종 프로필 매칭 근거</p>
                <div className="mt-2">
                    {profileMatch ? (
                        <div className="rounded-xl bg-[var(--ui-accent-soft)] p-4">
                            <p className="text-sm text-[var(--ui-accent)]">매칭 프로필</p>
                            <p className="mt-1 text-base font-semibold text-[var(--ui-ink)]">{profileMatch.profileLabel}</p>
                        </div>
                    ) : (
                        <p>- 전용 암종 프로필 미매칭: 일반 안전식 + 치료 단계 규칙으로 계산</p>
                    )}
                </div>
            </section>

            <section className="uiCard p-5 sm:p-6">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">규칙 적용 로그</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">1) 개인 정보/암 정보 반영</p>
                        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                            {contextAdjusted.notes.length > 0 ? (
                                contextAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">2) 약물 정보 반영</p>
                        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                            {medicationAdjusted.notes.length > 0 ? (
                                medicationAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">3) 당일/자동 선호 반영</p>
                        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                            {preferenceAdjusted.notes.length > 0 ? (
                                preferenceAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">4) 전날 기록 보정 반영</p>
                        <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                            {yesterdayAdjusted.notes.length > 0 ? (
                                yesterdayAdjusted.notes.map((note) => <p key={note}>- {note}</p>)
                            ) : (
                                <p>- 적용 없음</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-4 space-y-1 rounded-xl bg-[var(--ui-surface-muted)] p-4 text-sm leading-relaxed text-[var(--ui-muted)]">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">최종 적용 노트(통합)</p>
                    {mergedNotes.length > 0 ? mergedNotes.map((note) => <p key={note}>- {note}</p>) : <p className="mt-1">- 적용 없음</p>}
                </div>
            </section>

            <section className="uiCard p-5 sm:p-6">
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
                            <article key={item.key} className="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.label}</p>
                                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">최종: {item.final.summary || '식사 구성 확인 필요'}</p>
                                <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                                    {item.final.nutritionUnavailable ? '상세 영양량은 계산 전이에요. 의료진과 정한 식사량을 따라 주세요.' : `기본 구성 참고: 탄수 ${item.final.nutrient.carb}% / 단백질 ${item.final.nutrient.protein}% / 지방 ${item.final.nutrient.fat}%`}
                                </p>
                                <div className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                                    {changes.length > 0 ? changes.map((change) => <p key={change}>- {change}</p>) : <p>- 변경 없음</p>}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className="uiCard p-5 text-sm leading-relaxed sm:p-6">
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
