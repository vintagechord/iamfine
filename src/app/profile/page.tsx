'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

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

type DietStoreSnapshot = {
    medications?: string[];
    medicationSchedules?: MedicationSchedule[];
};

type MedicationTiming = 'breakfast' | 'lunch' | 'dinner';

type MedicationSchedule = {
    id: string;
    name: string;
    category: string;
    timing: MedicationTiming;
};

type StageType =
    | 'diagnosis'
    | 'chemo'
    | 'chemo_2nd'
    | 'radiation'
    | 'targeted'
    | 'immunotherapy'
    | 'hormone_therapy'
    | 'surgery'
    | 'medication'
    | 'other';

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

type ProfileTab = 'health' | 'medication' | 'treatment';

type Feedback = {
    type: 'success' | 'error';
    text: string;
} | null;

const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const DIET_STORE_PREFIX = 'diet-store-v2';
const USER_METADATA_NAMESPACE = 'iamfine';
const EMPTY_STAGE_LABEL = '미입력';
const MEDICATION_TIMING_OPTIONS: Array<{ value: MedicationTiming; label: string }> = [
    { value: 'breakfast', label: '아침 식후' },
    { value: 'lunch', label: '점심 식후' },
    { value: 'dinner', label: '저녁 식후' },
];
const MEDICATION_CATEGORY_OPTIONS = ['미분류', '항암/표적', '호르몬', '부작용 완화', '영양/기타'] as const;
const PROFILE_TABS: Array<{ key: ProfileTab; label: string }> = [
    { key: 'health', label: '기본 건강 정보' },
    { key: 'medication', label: '약 복용 정보' },
    { key: 'treatment', label: '치료 정보' },
];
const STAGE_TYPE_OPTIONS: StageType[] = [
    'diagnosis',
    'chemo',
    'chemo_2nd',
    'radiation',
    'targeted',
    'immunotherapy',
    'hormone_therapy',
    'surgery',
    'medication',
    'other',
];
const STAGE_TYPE_LABELS: Record<StageType, string> = {
    diagnosis: '진단',
    chemo: '항암치료',
    chemo_2nd: '항암치료(2차)',
    radiation: '방사선치료',
    targeted: '표적치료',
    immunotherapy: '면역치료',
    hormone_therapy: '호르몬치료',
    surgery: '수술',
    medication: '약물치료',
    other: '기타',
};
const STAGE_STATUS_OPTIONS: StageStatus[] = ['planned', 'active', 'completed'];
const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
    planned: '예정',
    active: '진행중',
    completed: '완료',
};
const BACKGROUND_COUNTRY_OPTIONS = [
    '한국',
    '미국',
    '일본',
    '중국',
    '대만',
    '홍콩',
    '싱가포르',
    '태국',
    '베트남',
    '필리핀',
    '인도',
    '인도네시아',
    '말레이시아',
    '호주',
    '캐나다',
    '영국',
    '프랑스',
    '독일',
    '스페인',
    '브라질',
] as const;

function normalizeNickname(input: string) {
    const trimmed = input.trim();
    return trimmed.replace(/[^a-zA-Z0-9_가-힣]/g, '');
}

function getTreatmentMetaKey(userId: string) {
    return `${TREATMENT_META_PREFIX}:${userId}`;
}

function getDietStoreKey(userId: string) {
    return `${DIET_STORE_PREFIX}:${userId}`;
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

function parseStoredMedications(raw: string | null) {
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as DietStoreSnapshot;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return [];
        }

        return Array.isArray(parsed.medications)
            ? parsed.medications
                  .filter((item): item is string => typeof item === 'string')
                  .map((item) => item.trim())
                  .filter(Boolean)
            : [];
    } catch {
        return [];
    }
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

function mergeUniqueMedications(existing: string[], incoming: string[]) {
    const unique = new Set<string>();

    existing
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => unique.add(item));

    incoming
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => unique.add(item));

    return Array.from(unique);
}

function parseStoredMedicationSchedules(raw: string | null) {
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw) as DietStoreSnapshot;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return [];
        }

        if (!Array.isArray(parsed.medicationSchedules)) {
            return [];
        }

        const isTiming = (value: string): value is MedicationTiming =>
            value === 'breakfast' || value === 'lunch' || value === 'dinner';

        return parsed.medicationSchedules
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
                if (typeof item.timing !== 'string' || !isTiming(item.timing)) {
                    return false;
                }
                return true;
            })
            .map((item) => ({
                id: typeof item.id === 'string' && item.id.trim() ? item.id : `med-${item.name}-${item.timing}`,
                name: item.name.trim(),
                category: item.category.trim(),
                timing: item.timing,
            }));
    } catch {
        return [];
    }
}

function parseMedicationSchedulesFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [];
    }

    const isTiming = (value: string): value is MedicationTiming =>
        value === 'breakfast' || value === 'lunch' || value === 'dinner';

    return raw
        .filter((item): item is MedicationSchedule => {
            if (!item || typeof item !== 'object') {
                return false;
            }

            const candidate = item as Partial<MedicationSchedule>;
            if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
                return false;
            }
            if (typeof candidate.category !== 'string' || !candidate.category.trim()) {
                return false;
            }
            if (typeof candidate.timing !== 'string' || !isTiming(candidate.timing)) {
                return false;
            }

            return true;
        })
        .map((item) => ({
            id: typeof item.id === 'string' && item.id.trim() ? item.id : `med-${item.name}-${item.timing}`,
            name: item.name.trim(),
            category: item.category.trim(),
            timing: item.timing,
        }));
}

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            root: {} as Record<string, unknown>,
            treatmentMeta: null as TreatmentMeta | null,
            medications: [] as string[],
            medicationSchedules: [] as MedicationSchedule[],
        };
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    const scoped =
        namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)
            ? (namespaced as Record<string, unknown>)
            : ({} as Record<string, unknown>);

    return {
        root,
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
    const { root } = readIamfineMetadata(raw);
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

function medicationNamesFromSchedules(schedules: MedicationSchedule[]) {
    return Array.from(new Set(schedules.map((item) => item.name.trim()).filter(Boolean)));
}

function addMedicationSchedule(
    list: MedicationSchedule[],
    medicationName: string,
    medicationCategory: string,
    medicationTiming: MedicationTiming
) {
    const normalizedName = medicationName.trim();
    const normalizedCategory = medicationCategory.trim() || '미분류';
    if (!normalizedName) {
        return list;
    }

    const duplicated = list.some(
        (item) =>
            item.name.toLowerCase() === normalizedName.toLowerCase() &&
            item.timing === medicationTiming &&
            item.category.toLowerCase() === normalizedCategory.toLowerCase()
    );
    if (duplicated) {
        return list;
    }

    return [
        ...list,
        {
            id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: normalizedName,
            category: normalizedCategory,
            timing: medicationTiming,
        },
    ];
}

function toFriendlyError(code?: string, message?: string) {
    if (code === '23505' || message?.includes('duplicate key')) {
        return '이미 사용 중인 닉네임이에요.';
    }
    if (
        code === '42501' ||
        message?.includes('row-level security') ||
        message?.includes('permission denied')
    ) {
        return '권한이 없어요. 다시 로그인해 주세요.';
    }
    return '요청 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

function showSaveCompletePopup() {
    if (typeof window !== 'undefined') {
        window.alert('저장이 완료되었습니다.');
    }
}

export default function ProfilePage() {
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ProfileTab>('health');

    const [profile, setProfile] = useState<ProfileRow | null>(null);
    const [nickname, setNickname] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [sex, setSex] = useState<ProfileRow['sex']>('unknown');
    const [heightCm, setHeightCm] = useState('');
    const [weightKg, setWeightKg] = useState('');
    const [ethnicity, setEthnicity] = useState('');
    const [cancerType, setCancerType] = useState('');
    const [cancerStage, setCancerStage] = useState('');
    const [medicationSchedules, setMedicationSchedules] = useState<MedicationSchedule[]>([]);
    const [medicationNameDraft, setMedicationNameDraft] = useState('');
    const [medicationCategoryDraft, setMedicationCategoryDraft] = useState<(typeof MEDICATION_CATEGORY_OPTIONS)[number]>(
        '미분류'
    );
    const [medicationTimingDraft, setMedicationTimingDraft] = useState<MedicationTiming>('breakfast');
    const [isMedicationComposing, setIsMedicationComposing] = useState(false);
    const [treatmentStages, setTreatmentStages] = useState<TreatmentStageRow[]>([]);
    const [addStageType, setAddStageType] = useState<StageType>('diagnosis');
    const [addStageLabel, setAddStageLabel] = useState('');
    const [addStageOrder, setAddStageOrder] = useState('');
    const [addStageStatus, setAddStageStatus] = useState<StageStatus>('planned');
    const [feedback, setFeedback] = useState<Feedback>(null);

    const [checking, setChecking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingMedicationInfo, setSavingMedicationInfo] = useState(false);
    const [savingTreatmentInfo, setSavingTreatmentInfo] = useState(false);
    const [addingTreatmentStage, setAddingTreatmentStage] = useState(false);
    const [deletingTreatmentStageId, setDeletingTreatmentStageId] = useState<string | null>(null);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

    const normalized = useMemo(() => normalizeNickname(nickname), [nickname]);
    const hasCustomEthnicityValue = useMemo(
        () => Boolean(ethnicity.trim()) && !BACKGROUND_COUNTRY_OPTIONS.includes(ethnicity.trim() as (typeof BACKGROUND_COUNTRY_OPTIONS)[number]),
        [ethnicity]
    );
    const nextTreatmentStageOrder = useMemo(
        () =>
            Math.max(
                0,
                ...treatmentStages.map((stage) =>
                    Number.isInteger(stage.stage_order) ? stage.stage_order : Number(stage.stage_order) || 0
                )
            ) + 1,
        [treatmentStages]
    );
    const treatmentStagesForDisplay = useMemo(() => {
        const statusPriority: Record<StageStatus, number> = {
            active: 0,
            planned: 1,
            completed: 2,
        };

        return [...treatmentStages].sort((a, b) => {
            const statusDiff = statusPriority[a.status] - statusPriority[b.status];
            if (statusDiff !== 0) {
                return statusDiff;
            }

            const orderDiff = Number(a.stage_order) - Number(b.stage_order);
            if (orderDiff !== 0) {
                return orderDiff;
            }

            return a.created_at.localeCompare(b.created_at);
        });
    }, [treatmentStages]);

    const loadTreatmentStages = useCallback(async (uid: string) => {
        if (!supabase) {
            setTreatmentStages([]);
            return [] as TreatmentStageRow[];
        }

        const { data, error: stageError } = await supabase
            .from('treatment_stages')
            .select(
                'id, user_id, stage_type, stage_label, stage_order, status, started_at, ended_at, notes, created_at, updated_at'
            )
            .eq('user_id', uid)
            .order('stage_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (stageError) {
            setTreatmentStages([]);
            setFeedback({
                type: 'error',
                text: '치료 단계 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
            });
            return [] as TreatmentStageRow[];
        }

        const rows = (data as TreatmentStageRow[] | null) ?? [];
        setTreatmentStages(rows);
        return rows;
    }, []);

    useEffect(() => {
        const run = async () => {
            setLoading(true);
            setFeedback(null);

            if (!hasSupabaseEnv || !supabase) {
                setUserId(null);
                setProfile(null);
                setLoading(false);
                return;
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) {
                setUserId(null);
                setProfile(null);
                setLoading(false);
                return;
            }

            const uid = authData.user.id;
            setUserId(uid);

            const metadata = readIamfineMetadata(authData.user.user_metadata);
            const localTreatmentMeta = parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(uid)));
            const treatmentMeta = metadata.treatmentMeta ?? localTreatmentMeta;
            setCancerType(treatmentMeta?.cancerType ?? '');
            setCancerStage(treatmentMeta?.cancerStage === EMPTY_STAGE_LABEL ? '' : (treatmentMeta?.cancerStage ?? ''));
            const rawDietStore = localStorage.getItem(getDietStoreKey(uid));
            const localStoredSchedules = parseStoredMedicationSchedules(rawDietStore);
            const localStoredMeds = parseStoredMedications(rawDietStore);
            const storedSchedules =
                metadata.medicationSchedules.length > 0
                    ? metadata.medicationSchedules
                    : localStoredSchedules;
            const storedMeds =
                metadata.medications.length > 0
                    ? metadata.medications
                    : localStoredMeds;

            const syncPatch: Partial<{
                treatmentMeta: TreatmentMeta;
                medications: string[];
                medicationSchedules: MedicationSchedule[];
            }> = {};
            if (!metadata.treatmentMeta && localTreatmentMeta) {
                syncPatch.treatmentMeta = localTreatmentMeta;
            }
            if (metadata.medications.length === 0 && localStoredMeds.length > 0) {
                syncPatch.medications = localStoredMeds;
            }
            if (metadata.medicationSchedules.length === 0 && localStoredSchedules.length > 0) {
                syncPatch.medicationSchedules = localStoredSchedules;
            }
            if (Object.keys(syncPatch).length > 0) {
                const updatedMetadata = buildUpdatedUserMetadata(authData.user.user_metadata, syncPatch);
                await supabase.auth.updateUser({
                    data: updatedMetadata,
                });
            }

            if (!localTreatmentMeta && metadata.treatmentMeta) {
                localStorage.setItem(getTreatmentMetaKey(uid), JSON.stringify(metadata.treatmentMeta));
            }
            if (
                (localStoredMeds.length === 0 && metadata.medications.length > 0) ||
                (localStoredSchedules.length === 0 && metadata.medicationSchedules.length > 0)
            ) {
                let currentDietStore: Record<string, unknown> = {};
                if (rawDietStore) {
                    try {
                        const parsed = JSON.parse(rawDietStore) as unknown;
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            currentDietStore = parsed as Record<string, unknown>;
                        }
                    } catch {
                        currentDietStore = {};
                    }
                }
                localStorage.setItem(
                    getDietStoreKey(uid),
                    JSON.stringify({
                        ...currentDietStore,
                        medications: metadata.medications.length > 0 ? metadata.medications : localStoredMeds,
                        medicationSchedules:
                            metadata.medicationSchedules.length > 0
                                ? metadata.medicationSchedules
                                : localStoredSchedules,
                    })
                );
            }
            setMedicationSchedules(
                storedSchedules.length > 0
                    ? storedSchedules
                    : storedMeds.map((name, index) => ({
                          id: `legacy-med-${index}`,
                          name,
                          category: '미분류',
                          timing: 'breakfast' as MedicationTiming,
                      }))
            );
            setMedicationNameDraft('');
            setMedicationCategoryDraft('미분류');
            setMedicationTimingDraft('breakfast');

            const { data: prof, error: profError } = await supabase
                .from('profiles')
                .select('user_id, nickname, birth_year, sex, height_cm, weight_kg, ethnicity')
                .eq('user_id', uid)
                .maybeSingle();

            const loadedStages = await loadTreatmentStages(uid);
            const initialNextOrder =
                Math.max(
                    0,
                    ...loadedStages.map((stage) =>
                        Number.isInteger(stage.stage_order) ? stage.stage_order : Number(stage.stage_order) || 0
                    )
                ) + 1;
            setAddStageOrder(String(initialNextOrder));

            if (profError) {
                setFeedback({
                    type: 'error',
                    text: toFriendlyError(profError.code, profError.message),
                });
                setProfile(null);
            } else {
                const nextProfile = (prof as ProfileRow | null) ?? null;
                setProfile(nextProfile);
                setNickname(nextProfile?.nickname ?? '');
                setBirthYear(nextProfile?.birth_year ? String(nextProfile.birth_year) : '');
                setSex(nextProfile?.sex ?? 'unknown');
                setHeightCm(nextProfile?.height_cm ? String(nextProfile.height_cm) : '');
                setWeightKg(nextProfile?.weight_kg ? String(nextProfile.weight_kg) : '');
                setEthnicity(nextProfile?.ethnicity ?? '');
            }

            setLoading(false);
        };

        void run();
    }, [loadTreatmentStages]);

    useEffect(() => {
        if (!addStageOrder.trim()) {
            setAddStageOrder(String(nextTreatmentStageOrder));
        }
    }, [addStageOrder, nextTreatmentStageOrder]);

    const validateNickname = () => {
        if (!nickname.trim() || normalized.length < 2) {
            setFeedback({ type: 'error', text: '닉네임을 입력해 주세요.' });
            return false;
        }

        if (normalized.length > 20) {
            setFeedback({ type: 'error', text: '닉네임은 20자 이하로 입력해 주세요.' });
            return false;
        }

        return true;
    };

    const checkAvailability = async () => {
        setFeedback(null);
        setIsAvailable(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        if (!validateNickname()) {
            return;
        }

        if (normalized !== nickname.trim()) {
            setNickname(normalized);
            setFeedback({
                type: 'error',
                text: '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있어요. 입력값을 자동으로 정리했어요.',
            });
            return;
        }

        if (profile && normalized === profile.nickname) {
            setIsAvailable(true);
            setFeedback({ type: 'success', text: '현재 사용 중인 닉네임이에요.' });
            return;
        }

        setChecking(true);

        const { data, error } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('nickname', normalized)
            .limit(1);

        setChecking(false);

        if (error) {
            setFeedback({ type: 'error', text: toFriendlyError(error.code, error.message) });
            return;
        }

        const taken = (data ?? []).length > 0;
        setIsAvailable(!taken);
        setFeedback({
            type: taken ? 'error' : 'success',
            text: taken ? '이미 사용 중인 닉네임이에요.' : '사용할 수 있는 닉네임이에요.',
        });
    };

    const saveNickname = async () => {
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        if (!validateNickname()) {
            return;
        }

        if (normalized !== nickname.trim()) {
            setNickname(normalized);
            setFeedback({
                type: 'error',
                text: '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있어요. 입력값을 자동으로 정리했어요.',
            });
            return;
        }

        setSaving(true);

        const { data: exists, error: existsError } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('nickname', normalized)
            .limit(1);

        if (existsError) {
            setSaving(false);
            setFeedback({
                type: 'error',
                text: toFriendlyError(existsError.code, existsError.message),
            });
            return;
        }

        const takenByOther = (exists ?? []).length > 0 && !(profile && normalized === profile.nickname);
        if (takenByOther) {
            setSaving(false);
            setIsAvailable(false);
            setFeedback({ type: 'error', text: '이미 사용 중인 닉네임이에요.' });
            return;
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ nickname: normalized })
            .eq('user_id', userId);

        setSaving(false);

        if (updateError) {
            setFeedback({ type: 'error', text: toFriendlyError(updateError.code, updateError.message) });
            return;
        }

        setProfile((prev) => (prev ? { ...prev, nickname: normalized } : prev));
        setIsAvailable(true);
        setFeedback({ type: 'success', text: '저장했어요.' });
        showSaveCompletePopup();
    };

    const saveHealthInfo = async () => {
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        const parsedBirthYear = birthYear.trim() ? Number(birthYear) : null;
        const parsedHeightCm = heightCm.trim() ? Number(heightCm) : null;
        const parsedWeightKg = weightKg.trim() ? Number(weightKg) : null;

        if (parsedBirthYear !== null && (!Number.isInteger(parsedBirthYear) || parsedBirthYear < 1900)) {
            setFeedback({ type: 'error', text: '출생연도는 올바른 숫자로 입력해 주세요.' });
            return;
        }

        if (parsedHeightCm !== null && (!Number.isFinite(parsedHeightCm) || parsedHeightCm <= 0)) {
            setFeedback({ type: 'error', text: '키는 1 이상 숫자로 입력해 주세요.' });
            return;
        }

        if (parsedWeightKg !== null && (!Number.isFinite(parsedWeightKg) || parsedWeightKg <= 0)) {
            setFeedback({ type: 'error', text: '몸무게는 1 이상 숫자로 입력해 주세요.' });
            return;
        }

        setSaving(true);

        const payload = {
            birth_year: parsedBirthYear,
            sex,
            height_cm: parsedHeightCm,
            weight_kg: parsedWeightKg,
            ethnicity: ethnicity.trim() || null,
        };

        const { error: updateError } = await supabase.from('profiles').update(payload).eq('user_id', userId);

        setSaving(false);

        if (updateError) {
            setFeedback({ type: 'error', text: toFriendlyError(updateError.code, updateError.message) });
            return;
        }

        setProfile((prev) =>
            prev
                ? {
                      ...prev,
                      ...payload,
                  }
                : prev
        );

        setFeedback({ type: 'success', text: '기본 정보를 저장했어요.' });
        showSaveCompletePopup();
    };

    const saveMedicationInfo = async () => {
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        if (medicationNameDraft.trim()) {
            setFeedback({ type: 'error', text: '입력 중인 약이 있어요. 약 추가 버튼으로 칩에 등록한 뒤 저장해 주세요.' });
            return;
        }

        const nextSchedules = medicationSchedules;
        const nextMedications = mergeUniqueMedications(medicationNamesFromSchedules(nextSchedules), []);

        setSavingMedicationInfo(true);

        try {
            const rawDietStore = localStorage.getItem(getDietStoreKey(userId));
            let currentDietStore: Record<string, unknown> = {};

            if (rawDietStore) {
                try {
                    const parsed = JSON.parse(rawDietStore) as unknown;
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        currentDietStore = parsed as Record<string, unknown>;
                    }
                } catch {
                    currentDietStore = {};
                }
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) {
                setFeedback({ type: 'error', text: '로그인이 만료되었어요. 다시 로그인해 주세요.' });
                return;
            }

            const updatedMetadata = buildUpdatedUserMetadata(authData.user.user_metadata, {
                medications: nextMedications,
                medicationSchedules: nextSchedules,
            });
            const { error: updateError } = await supabase.auth.updateUser({
                data: updatedMetadata,
            });
            if (updateError) {
                setFeedback({ type: 'error', text: '복용 약 정보를 서버에 저장하지 못했어요. 다시 시도해 주세요.' });
                return;
            }

            localStorage.setItem(
                getDietStoreKey(userId),
                JSON.stringify({
                    ...currentDietStore,
                    medications: nextMedications,
                    medicationSchedules: nextSchedules,
                })
            );
            setMedicationSchedules(nextSchedules);
            setMedicationNameDraft('');
            setMedicationCategoryDraft('미분류');
            setMedicationTimingDraft('breakfast');
            setFeedback({ type: 'success', text: '복용 약 정보를 저장했어요.' });
            showSaveCompletePopup();
        } finally {
            setSavingMedicationInfo(false);
        }
    };

    const saveTreatmentInfo = async () => {
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        const nextCancerType = cancerType.trim();
        if (!nextCancerType) {
            setFeedback({ type: 'error', text: '암 종류는 필수 입력이에요.' });
            return;
        }

        const nextCancerStage = cancerStage.trim() || EMPTY_STAGE_LABEL;
        setSavingTreatmentInfo(true);

        try {
            const treatmentPayload: TreatmentMeta = {
                cancerType: nextCancerType,
                cancerStage: nextCancerStage,
                updatedAt: new Date().toISOString(),
            };

            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) {
                setFeedback({ type: 'error', text: '로그인이 만료되었어요. 다시 로그인해 주세요.' });
                return;
            }

            const updatedMetadata = buildUpdatedUserMetadata(authData.user.user_metadata, {
                treatmentMeta: treatmentPayload,
            });
            const { error: updateError } = await supabase.auth.updateUser({
                data: updatedMetadata,
            });
            if (updateError) {
                setFeedback({ type: 'error', text: '치료 정보를 서버에 저장하지 못했어요. 다시 시도해 주세요.' });
                return;
            }

            localStorage.setItem(getTreatmentMetaKey(userId), JSON.stringify(treatmentPayload));
            setCancerType(nextCancerType);
            setCancerStage(cancerStage.trim());
            setFeedback({ type: 'success', text: '치료 정보를 저장했어요.' });
            showSaveCompletePopup();
        } finally {
            setSavingTreatmentInfo(false);
        }
    };

    const addTreatmentStage = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        if (!addStageLabel.trim()) {
            setFeedback({ type: 'error', text: '단계 이름을 입력해 주세요.' });
            return;
        }

        const parsedOrder = Number(addStageOrder);
        if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
            setFeedback({ type: 'error', text: '순서는 1 이상의 숫자로 입력해 주세요.' });
            return;
        }

        if (treatmentStages.some((stage) => Number(stage.stage_order) === parsedOrder)) {
            setFeedback({ type: 'error', text: `이미 같은 순서가 있어요. 추천 순서: ${nextTreatmentStageOrder}` });
            return;
        }

        setAddingTreatmentStage(true);

        if (addStageStatus === 'active') {
            const { error: clearActiveError } = await supabase
                .from('treatment_stages')
                .update({ status: 'planned' })
                .eq('user_id', userId)
                .eq('status', 'active');

            if (clearActiveError) {
                setFeedback({ type: 'error', text: toFriendlyError(clearActiveError.code, clearActiveError.message) });
                setAddingTreatmentStage(false);
                return;
            }
        }

        const { error: insertError } = await supabase.from('treatment_stages').insert({
            user_id: userId,
            stage_type: addStageType,
            stage_label: addStageLabel.trim(),
            stage_order: parsedOrder,
            status: addStageStatus,
        });

        if (insertError) {
            if (insertError.code === '23505' || insertError.message?.includes('treatment_stages_user_order_uniq')) {
                setFeedback({ type: 'error', text: `이미 같은 순서가 있어요. 추천 순서: ${nextTreatmentStageOrder}` });
            } else {
                setFeedback({ type: 'error', text: toFriendlyError(insertError.code, insertError.message) });
            }
            setAddingTreatmentStage(false);
            return;
        }

        await loadTreatmentStages(userId);
        setAddStageLabel('');
        setAddStageOrder('');
        setAddStageStatus('planned');
        setFeedback({ type: 'success', text: '치료 단계를 추가했어요.' });
        setAddingTreatmentStage(false);
    };

    const deleteTreatmentStage = async (stageId: string) => {
        setFeedback(null);

        if (!hasSupabaseEnv || !supabase) {
            setFeedback({ type: 'error', text: '설정이 필요해요. .env.local 파일을 확인해 주세요.' });
            return;
        }

        if (!userId) {
            setFeedback({ type: 'error', text: '로그인이 필요해요.' });
            return;
        }

        setDeletingTreatmentStageId(stageId);

        const { error: deleteError } = await supabase
            .from('treatment_stages')
            .delete()
            .eq('id', stageId)
            .eq('user_id', userId);

        if (deleteError) {
            setFeedback({ type: 'error', text: toFriendlyError(deleteError.code, deleteError.message) });
            setDeletingTreatmentStageId(null);
            return;
        }

        await loadTreatmentStages(userId);
        setFeedback({ type: 'success', text: '치료 단계를 삭제했어요.' });
        setDeletingTreatmentStageId(null);
    };

    const addMedicationScheduleDraft = () => {
        const nextList = addMedicationSchedule(
            medicationSchedules,
            medicationNameDraft,
            medicationCategoryDraft,
            medicationTimingDraft
        );
        if (nextList.length === medicationSchedules.length) {
            if (!medicationNameDraft.trim()) {
                setFeedback({ type: 'error', text: '약 이름을 입력해 주세요.' });
            }
            return;
        }

        setMedicationSchedules(nextList);
        setMedicationNameDraft('');
        setFeedback(null);
    };

    const removeMedicationScheduleDraft = (targetId: string) => {
        setMedicationSchedules((prev) => prev.filter((item) => item.id !== targetId));
    };

    const isAnyProfileActionBusy =
        checking ||
        saving ||
        savingMedicationInfo ||
        savingTreatmentInfo ||
        addingTreatmentStage ||
        deletingTreatmentStageId !== null;

    if (loading) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">내 정보</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">내 정보</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        설정이 필요해요. .env.local 파일을 확인해 주세요.
                    </p>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">내 정보</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">로그인이 필요해요.</p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">내 정보</h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    기본 건강 정보, 약 복용 정보, 치료 정보를 탭으로 나눠 관리할 수 있어요.
                </p>
            </section>

            {feedback && (
                <section
                    role={feedback.type === 'error' ? 'alert' : 'status'}
                    className={
                        feedback.type === 'error'
                            ? 'rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                            : 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    }
                >
                    <p className="text-sm font-medium">{feedback.text}</p>
                </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap gap-2">
                    {PROFILE_TABS.map((tab) => {
                        const selected = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                    selected
                                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {activeTab === 'health' && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">기본 건강 정보</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        닉네임과 기본 건강 정보를 관리할 수 있어요.
                    </p>

                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="nickname">
                            닉네임
                        </label>
                        <input
                            id="nickname"
                            value={nickname}
                            onChange={(event) => {
                                setNickname(event.target.value);
                                setIsAvailable(null);
                                setFeedback(null);
                            }}
                            placeholder="닉네임을 입력해 주세요"
                            className="mt-2 w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            한글, 영문, 숫자, 밑줄(_)을 포함해 2자 이상 20자 이하로 입력해 주세요.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={checkAvailability}
                                disabled={checking || saving}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                {checking ? '확인 중…' : '중복 확인'}
                            </button>
                            <button
                                type="button"
                                onClick={saveNickname}
                                disabled={checking || saving}
                                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                            >
                                {saving ? '저장 중…' : '저장'}
                            </button>
                        </div>
                        {isAvailable !== null && (
                            <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                                확인 결과: {isAvailable ? '사용할 수 있어요.' : '사용할 수 없어요.'}
                            </p>
                        )}
                    </div>

                    <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                출생연도
                                <input
                                    value={birthYear}
                                    onChange={(event) => setBirthYear(event.target.value)}
                                    placeholder="예: 1988"
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                성별
                                <select
                                    value={sex}
                                    onChange={(event) => setSex(event.target.value as ProfileRow['sex'])}
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    <option value="unknown">미입력</option>
                                    <option value="female">여성</option>
                                    <option value="male">남성</option>
                                    <option value="other">기타</option>
                                </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                키(cm)
                                <input
                                    value={heightCm}
                                    onChange={(event) => setHeightCm(event.target.value)}
                                    placeholder="예: 165"
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                몸무게(kg)
                                <input
                                    value={weightKg}
                                    onChange={(event) => setWeightKg(event.target.value)}
                                    placeholder="예: 58"
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </label>
                        </div>
                        <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
                            인종/배경(선택)
                            <select
                                value={ethnicity}
                                onChange={(event) => setEthnicity(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            >
                                <option value="">선택 안함</option>
                                {BACKGROUND_COUNTRY_OPTIONS.map((country) => (
                                    <option key={country} value={country}>
                                        {country}
                                    </option>
                                ))}
                                {hasCustomEthnicityValue && (
                                    <option value={ethnicity}>
                                        {ethnicity} (기존 저장값)
                                    </option>
                                )}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={saveHealthInfo}
                            disabled={isAnyProfileActionBusy}
                            className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            {saving ? '저장 중…' : '기본 정보 저장'}
                        </button>
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            현재 닉네임: {profile?.nickname?.trim() ? profile.nickname : '아직 없음'}
                        </p>
                    </div>
                </section>
            )}

            {activeTab === 'medication' && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">약 복용 정보</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        복용 약을 이름/분류/복용 시기로 관리할 수 있어요.
                    </p>

                    <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
                        복용 약(선택)
                        <div className="mt-1 grid gap-2 sm:grid-cols-4">
                            <input
                                value={medicationNameDraft}
                                onChange={(event) => setMedicationNameDraft(event.target.value)}
                                onCompositionStart={() => setIsMedicationComposing(true)}
                                onCompositionEnd={() => setIsMedicationComposing(false)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        if (isMedicationComposing || event.nativeEvent.isComposing) {
                                            return;
                                        }
                                        event.preventDefault();
                                        addMedicationScheduleDraft();
                                    }
                                }}
                                placeholder="약 이름"
                                className="sm:col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                            <select
                                value={medicationCategoryDraft}
                                onChange={(event) =>
                                    setMedicationCategoryDraft(event.target.value as (typeof MEDICATION_CATEGORY_OPTIONS)[number])
                                }
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            >
                                {MEDICATION_CATEGORY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={medicationTimingDraft}
                                onChange={(event) => setMedicationTimingDraft(event.target.value as MedicationTiming)}
                                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            >
                                {MEDICATION_TIMING_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={addMedicationScheduleDraft}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                약 추가
                            </button>
                        </div>
                        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                            이름/분류/복용 시기로 등록하면 식단 제안과 오늘 기록에서 복용 확인이 가능해요.
                        </span>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {medicationSchedules.length === 0 ? (
                                <p className="text-sm text-gray-600 dark:text-gray-300">추가된 약이 없어요.</p>
                            ) : (
                                medicationSchedules.map((medication) => (
                                    <span
                                        key={medication.id}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                                    >
                                        [{MEDICATION_TIMING_OPTIONS.find((option) => option.value === medication.timing)?.label}] {medication.category} ·{' '}
                                        {medication.name}
                                        <button
                                            type="button"
                                            onClick={() => removeMedicationScheduleDraft(medication.id)}
                                            className="text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200"
                                        >
                                            삭제
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>
                    </label>

                    <button
                        type="button"
                        onClick={saveMedicationInfo}
                        disabled={isAnyProfileActionBusy}
                        className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                    >
                        {savingMedicationInfo ? '저장 중…' : '약 복용 정보 저장'}
                    </button>
                </section>
            )}

            {activeTab === 'treatment' && (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">치료 정보</h2>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        암 종류/기수와 치료 단계를 함께 관리할 수 있어요.
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            암 종류(필수)
                            <input
                                value={cancerType}
                                onChange={(event) => setCancerType(event.target.value)}
                                placeholder="예: 유방암"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                        </label>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            기수(선택)
                            <input
                                value={cancerStage}
                                onChange={(event) => setCancerStage(event.target.value)}
                                placeholder="예: 2기"
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        onClick={saveTreatmentInfo}
                        disabled={isAnyProfileActionBusy}
                        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        {savingTreatmentInfo ? '저장 중…' : '치료 정보 저장'}
                    </button>

                    <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">등록된 치료 단계</h3>
                        {treatmentStagesForDisplay.length === 0 ? (
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                아직 등록된 단계가 없어요. 아래에서 치료 단계를 추가해 주세요.
                            </p>
                        ) : (
                            <div className="mt-3 space-y-2">
                                {treatmentStagesForDisplay.map((stage) => (
                                    <article
                                        key={stage.id}
                                        className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {STAGE_TYPE_LABELS[stage.stage_type]} · {stage.stage_label?.trim() || '이름 없음'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                                        stage.status === 'active'
                                                            ? 'border-blue-600 bg-blue-600 text-white'
                                                            : stage.status === 'completed'
                                                              ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                                              : 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
                                                    }`}
                                                >
                                                    {STAGE_STATUS_LABELS[stage.status]}
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">순서 {stage.stage_order}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteTreatmentStage(stage.id)}
                                                    disabled={addingTreatmentStage || deletingTreatmentStageId === stage.id}
                                                    className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50"
                                                >
                                                    {deletingTreatmentStageId === stage.id ? '삭제 중…' : '삭제'}
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-800">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">치료 단계 추가</h3>
                        <form onSubmit={addTreatmentStage} className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                단계 유형
                                <select
                                    value={addStageType}
                                    onChange={(event) => setAddStageType(event.target.value as StageType)}
                                    disabled={addingTreatmentStage}
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    {STAGE_TYPE_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {STAGE_TYPE_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                단계 이름
                                <input
                                    value={addStageLabel}
                                    onChange={(event) => setAddStageLabel(event.target.value)}
                                    placeholder="예: 항암 1차"
                                    disabled={addingTreatmentStage}
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                순서
                                <input
                                    type="number"
                                    step={1}
                                    min={1}
                                    value={addStageOrder}
                                    onChange={(event) => setAddStageOrder(event.target.value)}
                                    disabled={addingTreatmentStage}
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">추천 순서: {nextTreatmentStageOrder}</p>
                            </label>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                상태
                                <select
                                    value={addStageStatus}
                                    onChange={(event) => setAddStageStatus(event.target.value as StageStatus)}
                                    disabled={addingTreatmentStage}
                                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                >
                                    {STAGE_STATUS_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {STAGE_STATUS_LABELS[option]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="sm:col-span-2">
                                <button
                                    type="submit"
                                    disabled={addingTreatmentStage || deletingTreatmentStageId !== null}
                                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                                >
                                    {addingTreatmentStage ? '추가 중…' : '단계 추가'}
                                </button>
                            </div>
                        </form>
                    </div>
                </section>
            )}
        </main>
    );
}
