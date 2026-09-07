'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import {
    applyDinnerCarbSafety,
    formatDateKey,
    formatDateLabel,
    generateMonthPlans,
    optimizePlanByMedications,
    optimizePlanByPreference,
    optimizePlanByUserContext,
    PREFERENCE_OPTIONS,
    STAGE_TYPE_LABELS,
    type PreferenceType,
    type StageType,
    type UserDietContext,
    type UserMedicationSchedule,
} from '@/lib/dietEngine';
import { parseAdditionalConditionsFromUnknown, type AdditionalCondition } from '@/lib/additionalConditions';
import { applyFoodPersonalization, hasRenalDietRestrictions, parseFoodPersonalization, readFoodPersonalization } from '@/lib/personalization';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { buildDietRecordContext, applyMealRecordGuidance } from '@/lib/dietRecordContext';

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

export default function DietCalendarPage() {
    const now = new Date();
    const todayKey = formatDateKey(now);

    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [treatmentMeta, setTreatmentMeta] = useState<TreatmentMeta | null>(null);
    const [stageType, setStageType] = useState<StageType>('other');
    const [activeStage, setActiveStage] = useState<TreatmentStageRow | null>(null);
    const [medications, setMedications] = useState<string[]>([]);
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [additionalConditions, setAdditionalConditions] = useState<AdditionalCondition[]>([]);
    const [foodPersonalization, setFoodPersonalization] = useState(() => parseFoodPersonalization(null));
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});
    const [monthValue, setMonthValue] = useState(toMonthInputValue(now.getFullYear(), now.getMonth()));
    const [showCalendarInfoModal, setShowCalendarInfoModal] = useState(false);

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
            ...buildDietRecordContext(logs, todayKey),
            age,
            sex: profile?.sex ?? 'unknown',
            heightCm: profile?.height_cm ?? undefined,
            weightKg: profile?.weight_kg ?? undefined,
            ethnicity: profile?.ethnicity ?? undefined,
            cancerType: treatmentMeta?.cancerType ?? '',
            cancerStage: treatmentMeta?.cancerStage ?? '',
            activeStageType: stageType,
            activeStageLabel: activeStage?.stage_label ?? '',
            activeStageOrder: activeStage?.stage_order,
            activeStageStatus: activeStage?.status,
            medicationSchedules: contextMedicationSchedules,
            additionalConditions,
        };
    }, [profile, treatmentMeta, stageType, activeStage, medicationSchedules, additionalConditions, logs, todayKey]);
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
                setAdditionalConditions([]);
                setFoodPersonalization(parseFoodPersonalization(null));
                setLogs({});
                setStageType('other');
                setActiveStage(null);
                setLoading(false);
                return;
            }

            const uid = user.id;
            setUserId(uid);
            const metadata = readIamfineMetadata(user.user_metadata);
            setAdditionalConditions(metadata.additionalConditions);
            setFoodPersonalization(readFoodPersonalization(user.user_metadata));
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
            setActiveStage(activeStage ?? null);
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
        return basePlans.map((basePlan) => {
            const dateKey = basePlan.date;
            if (hasRenalDietRestrictions(userDietContext)) {
                const contextAdjusted = optimizePlanByUserContext(basePlan, userDietContext);
                const personalized = applyFoodPersonalization(contextAdjusted.plan, foodPersonalization, userDietContext);
                return {
                    plan: personalized.plan,
                    requiresMealReview: personalized.plan !== contextAdjusted.plan,
                    appliedPreferences: [] as PreferenceType[],
                    source: '',
                };
            }
            const medicationAdjusted = optimizePlanByMedications(basePlan, medications);
            const byDatePreferences = dailyPreferences[dateKey];
            const adaptivePreferences = recommendAdaptivePreferencesByRecentLogs(logs, dateKey);
            const targetPreferences = mergePreferences(adaptivePreferences, byDatePreferences ?? []);
            const yesterdayLog = logs[offsetDateKey(dateKey, -1)];
            const lowAppetiteRisk = foodPersonalization.symptoms.length > 0
                || targetPreferences.includes('appetite_boost')
                || (yesterdayLog ? eatenTrackItems(yesterdayLog).length <= 2 : false);
            const appliedPreferences = lowAppetiteRisk
                ? targetPreferences.filter((preference) => preference !== 'weight_loss')
                : targetPreferences;
            const preferenceAdjusted =
                appliedPreferences.length === 0
                    ? {
                          plan: medicationAdjusted.plan,
                      }
                    : optimizePlanByPreference(medicationAdjusted.plan, appliedPreferences);
            const dinnerAdjusted = applyDinnerCarbSafety(preferenceAdjusted.plan, {
                bmi,
                lowAppetiteRisk,
                weightLossPreference: appliedPreferences.includes('weight_loss'),
            });
            const yesterdayAdjusted = lowAppetiteRisk
                ? dinnerAdjusted
                : applyMealRecordGuidance(dinnerAdjusted.plan, logs[offsetDateKey(dateKey, -1)]);
            const contextAdjusted = optimizePlanByUserContext(yesterdayAdjusted.plan, userDietContext);

            const source =
                byDatePreferences && byDatePreferences.length > 0
                    ? adaptivePreferences.length > 0
                        ? ('당일 확정 + 기록 자동 반영' as const)
                        : ('당일 확정' as const)
                    : adaptivePreferences.length > 0
                      ? ('기록 자동 반영' as const)
                      : ('' as const);

            return {
                plan: applyFoodPersonalization(contextAdjusted.plan, foodPersonalization, userDietContext).plan,
                requiresMealReview: false,
                appliedPreferences,
                source,
            };
        });
    }, [year, month, stageType, userDietContext, medications, dailyPreferences, logs, bmi, foodPersonalization]);

    return (
        <main className="mx-auto max-w-4xl space-y-6">
            <section className="uiCard p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="uiPageHeader min-w-0">
                        <div className="flex items-center gap-3">
                            <h1>월간 식단표</h1>
                            <button
                                type="button"
                                onClick={() => setShowCalendarInfoModal(true)}
                                className="uiIconButton"
                                aria-label="월간 식단표 안내 열기"
                            >
                                <CircleHelp className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            현재 치료 단계: {STAGE_TYPE_LABELS[stageType]}
                        </p>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                        <Link
                            href="/diet?view=record#today-record-section"
                            className="uiButton uiButton--primary"
                        >
                            오늘 기록하기
                        </Link>
                        <Link
                            href="/"
                            className="uiButton uiButton--secondary"
                        >
                            식단 제안
                        </Link>
                    </div>
                </div>

                {!userId && (
                    <p className="mt-4 rounded-xl bg-[var(--ui-surface-muted)] px-4 py-3 text-sm leading-relaxed text-[var(--ui-muted)]">
                        로그인하면 치료 단계와 연동된 맞춤 식단표를 볼 수 있어요.
                    </p>
                )}

                <div className="mt-4 space-y-1 rounded-xl bg-[var(--ui-accent-soft)] p-4 text-sm leading-relaxed text-[var(--ui-accent)]">
                    <p>- 먹고 싶은 방향 선택은 당일에서만 확정할 수 있어요.</p>
                    <p>- 기록한 식사 패턴은 다음/다다음 날짜 식단에도 자동 반영돼요.</p>
                </div>
            </section>

            {showCalendarInfoModal && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-3 sm:p-4"
                    onClick={() => setShowCalendarInfoModal(false)}
                >
                    <section
                        className="uiCard max-h-[70dvh] w-full max-w-md overflow-y-auto overscroll-contain p-5 sm:p-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">월간 식단표 안내</h2>
                            <button type="button" onClick={() => setShowCalendarInfoModal(false)} className="uiButton uiButton--ghost uiButton--small">
                                닫기
                            </button>
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                            <p>- 먹고 싶은 방향 선택은 당일에서만 확정할 수 있어요.</p>
                            <p>- 기록한 식사 패턴은 다음/다다음 날짜 식단에도 자동 반영돼요.</p>
                        </div>
                    </section>
                </div>
            )}

            <section className="uiCard p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">전체 식단표</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            월 단위로 아침/점심/저녁/간식을 한 번에 확인할 수 있어요.
                        </p>
                    </div>
                    <label className="w-full min-w-0 text-sm font-medium text-[var(--ui-muted)] sm:w-auto">
                        월 선택
                        <input
                            type="month"
                            aria-label="월 선택"
                            enterKeyHint="done"
                            value={monthValue}
                            onChange={(event) => setMonthValue(event.target.value)}
                            className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-base text-[var(--ui-ink)] sm:w-auto"
                        />
                    </label>
                </div>

                {loading ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        {monthPlans.map(({ plan, appliedPreferences, source, requiresMealReview }) => (
                            <article
                                key={plan.date}
                                className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] p-4 sm:p-5"
                            >
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateLabel(plan.date)}</p>
                                {appliedPreferences.length > 0 && (
                                    <p className="mt-2 text-sm leading-relaxed text-[var(--ui-accent)]">
                                        {source ? `${source} 반영` : '방향 반영'}: {' '}
                                        {appliedPreferences.map((key) => PREFERENCE_LABELS[key]).join(', ')}
                                    </p>
                                )}
                                {requiresMealReview && (
                                    <p className="mt-2 text-sm leading-relaxed text-[var(--ui-muted)]">
                                        피할 재료를 제외했어요. 대체 음식과 식사량은 의료진과 확인해 주세요.
                                    </p>
                                )}
                                <div className="mt-3 grid gap-3 text-sm leading-relaxed text-[var(--ui-muted)] md:grid-cols-2">
                                    <p>
                                        <span className="font-semibold">아침</span>: {plan.breakfast.summary.trim() || '식사 구성 확인 필요'}
                                    </p>
                                    <p>
                                        <span className="font-semibold">점심</span>: {plan.lunch.summary.trim() || '식사 구성 확인 필요'}
                                    </p>
                                    <p>
                                        <span className="font-semibold">저녁</span>: {plan.dinner.summary.trim() || '식사 구성 확인 필요'}
                                    </p>
                                    <p>
                                        <span className="font-semibold">간식</span>: {plan.snack.summary.trim() || '식사 구성 확인 필요'}
                                    </p>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="px-1 text-sm leading-relaxed text-[var(--ui-muted)]">
                <p>{DISCLAIMER_TEXT}</p>
            </section>
        </main>
    );
}
