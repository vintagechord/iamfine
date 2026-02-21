'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

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

type StageDraft = {
    stage_label: string;
    stage_order: string;
    status: StageStatus;
    started_at: string;
    ended_at: string;
    notes: string;
};

type TreatmentMeta = {
    cancerType: string;
    cancerStage: string;
    updatedAt: string;
};

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

const STATUS_OPTIONS: StageStatus[] = ['planned', 'active', 'completed'];

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

const STATUS_LABELS: Record<StageStatus, string> = {
    planned: '예정',
    active: '진행중',
    completed: '완료',
};

const DISCLAIMER_TEXT =
    '이 서비스는 참고용 식단/기록 도구이며, 치료·약물 관련 결정은 의료진과 상의하세요.';
const TREATMENT_META_PREFIX = 'treatment-meta-v1';
const USER_METADATA_NAMESPACE = 'iamfine';

const ORDER_INVALID_MESSAGE = '순서는 1 이상의 숫자로 입력해 주세요.';
const ORDER_DUPLICATE_MESSAGE = '이미 같은 순서의 단계가 있어요. 다른 숫자를 입력해 주세요.';
const EMPTY_NAME_MESSAGE = '단계 이름을 입력해 주세요.';
const LOGIN_REQUIRED_MESSAGE = '로그인이 필요해요.';
const ENV_REQUIRED_MESSAGE = '설정이 필요해요. .env.local 파일을 확인해 주세요.';
const PERMISSION_MESSAGE = '권한이 없어요. 다시 로그인해 주세요.';
const MOVE_FAILED_MESSAGE = '이동에 실패했어요. 잠시 후 다시 시도해 주세요.';
const MOVE_LIMIT_MESSAGE = '더 이동할 단계가 없어요.';

const EMPTY_DRAFT: StageDraft = {
    stage_label: '',
    stage_order: '1',
    status: 'planned',
    started_at: '',
    ended_at: '',
    notes: '',
};

function toDraft(stage: TreatmentStageRow): StageDraft {
    return {
        stage_label: stage.stage_label ?? '',
        stage_order: String(stage.stage_order),
        status: stage.status,
        started_at: stage.started_at ?? '',
        ended_at: stage.ended_at ?? '',
        notes: stage.notes ?? '',
    };
}

function isOrderUniqueError(message: string | undefined, code: string | undefined) {
    return code === '23505' || message?.includes('treatment_stages_user_order_uniq') === true;
}

function isPermissionError(message: string | undefined, code: string | undefined) {
    return (
        code === '42501' ||
        message?.includes('row-level security') === true ||
        message?.includes('permission denied') === true
    );
}

function getTreatmentMetaKey(userId: string) {
    return `${TREATMENT_META_PREFIX}:${userId}`;
}

function parseTreatmentMeta(raw: string | null) {
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<TreatmentMeta>;
        if (!parsed.cancerType) {
            return null;
        }

        return {
            cancerType: parsed.cancerType,
            cancerStage: parsed.cancerStage,
            updatedAt: parsed.updatedAt ?? '',
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

function readIamfineMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            root: {} as Record<string, unknown>,
            treatmentMeta: null as TreatmentMeta | null,
        };
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return {
            root,
            treatmentMeta: null as TreatmentMeta | null,
        };
    }

    const scoped = namespaced as Record<string, unknown>;
    return {
        root,
        treatmentMeta: parseTreatmentMetaFromUnknown(scoped.treatmentMeta),
    };
}

function buildUpdatedUserMetadata(raw: unknown, treatmentMeta: TreatmentMeta) {
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
            treatmentMeta,
        },
    };
}

export default function TreatmentPage() {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<{ id: string } | null>(null);
    const [stages, setStages] = useState<TreatmentStageRow[]>([]);
    const [drafts, setDrafts] = useState<Record<string, StageDraft>>({});

    const [addStageType, setAddStageType] = useState<StageType>('diagnosis');
    const [addStageLabel, setAddStageLabel] = useState('');
    const [addStageOrder, setAddStageOrder] = useState('');
    const [addStatus, setAddStatus] = useState<StageStatus>('planned');

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [movingId, setMovingId] = useState<string | null>(null);
    const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
    const [showPastStages, setShowPastStages] = useState(false);
    const [cancerType, setCancerType] = useState('');
    const [cancerStage, setCancerStage] = useState('');
    const [metaUpdatedAt, setMetaUpdatedAt] = useState('');

    const maxOrder = useMemo(
        () => stages.reduce((max, stage) => Math.max(max, Number(stage.stage_order ?? 0)), 0),
        [stages]
    );
    const nextOrder = maxOrder + 1;
    const primaryStage = useMemo(
        () => stages.find((stage) => stage.status === 'active') ?? stages[0] ?? null,
        [stages]
    );
    const pastStagesCount = useMemo(
        () => stages.filter((stage) => stage.id !== primaryStage?.id).length,
        [stages, primaryStage]
    );

    const loadStages = useCallback(async (uid: string) => {
        if (!supabase) {
            setStages([]);
            setDrafts({});
            setError(ENV_REQUIRED_MESSAGE);
            return false;
        }

        const { data, error: loadError } = await supabase
            .from('treatment_stages')
            .select(
                'id, user_id, stage_type, stage_label, stage_order, status, started_at, ended_at, notes, created_at, updated_at'
            )
            .eq('user_id', uid)
            .order('stage_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (loadError) {
            console.error('단계 목록 조회 실패', loadError);
            setStages([]);
            setDrafts({});
            setError('단계 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return false;
        }

        const rows = (data ?? []) as TreatmentStageRow[];
        setStages(rows);
        setDrafts(Object.fromEntries(rows.map((row) => [row.id, toDraft(row)])));
        setExpandedById((prev) =>
            Object.fromEntries(rows.map((row) => [row.id, prev[row.id] ?? false]))
        );
        return true;
    }, []);

    const loadUserAndStages = useCallback(async () => {
        setLoading(true);
        setError('');
        setMessage('');

        if (!hasSupabaseEnv || !supabase) {
            setUser(null);
            setStages([]);
            setDrafts({});
            setError(ENV_REQUIRED_MESSAGE);
            setLoading(false);
            return;
        }

        const { user: authUser, error: authError } = await getAuthSessionUser();

        if (authError || !authUser) {
            setUser(null);
            setStages([]);
            setDrafts({});
            setLoading(false);
            return;
        }

        setUser({ id: authUser.id });
        await loadStages(authUser.id);

        const metadata = readIamfineMetadata(authUser.user_metadata);
        const meta = metadata.treatmentMeta ?? parseTreatmentMeta(localStorage.getItem(getTreatmentMetaKey(authUser.id)));
        setCancerType(meta?.cancerType ?? '');
        setCancerStage(meta?.cancerStage ?? '');
        setMetaUpdatedAt(meta?.updatedAt ?? '');
        setLoading(false);
    }, [loadStages]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void loadUserAndStages();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [loadUserAndStages]);

    useEffect(() => {
        const current = addStageOrder.trim();
        if (current === '' || Number(current) === 0) {
            const timer = window.setTimeout(() => {
                setAddStageOrder(String(nextOrder));
            }, 0);

            return () => window.clearTimeout(timer);
        }

        return undefined;
    }, [addStageOrder, nextOrder]);

    const duplicateOrderMessage = `${ORDER_DUPLICATE_MESSAGE} 추천 순서: ${nextOrder}`;

    const updateDraft = (stageId: string, patch: Partial<StageDraft>) => {
        setDrafts((prev) => ({
            ...prev,
            [stageId]: {
                ...(prev[stageId] ?? EMPTY_DRAFT),
                ...patch,
            },
        }));
    };

    const toggleDetails = (stageId: string) => {
        setExpandedById((prev) => ({
            ...prev,
            [stageId]: !prev[stageId],
        }));
    };

    const handleMoveStage = async (stageId: string, direction: 'up' | 'down') => {
        setMessage('');
        setError('');

        if (!hasSupabaseEnv || !supabase) {
            setError(ENV_REQUIRED_MESSAGE);
            return;
        }

        if (!user) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        const client = supabase;

        const sortedStages = [...stages].sort((a, b) => {
            const orderDiff = Number(a.stage_order) - Number(b.stage_order);
            if (orderDiff !== 0) {
                return orderDiff;
            }
            return a.created_at.localeCompare(b.created_at);
        });

        const currentIndex = sortedStages.findIndex((stage) => stage.id === stageId);
        if (currentIndex < 0) {
            return;
        }

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= sortedStages.length) {
            setMessage(MOVE_LIMIT_MESSAGE);
            return;
        }

        const currentStage = sortedStages[currentIndex];
        const targetStage = sortedStages[targetIndex];
        const currentOrder = Number(currentStage.stage_order);
        const targetOrder = Number(targetStage.stage_order);

        if (!Number.isInteger(currentOrder) || !Number.isInteger(targetOrder)) {
            setError(MOVE_FAILED_MESSAGE);
            return;
        }

        const usedOrders = new Set(sortedStages.map((stage) => Number(stage.stage_order)));
        const maxCurrentOrder = sortedStages.reduce(
            (max, stage) => Math.max(max, Number(stage.stage_order)),
            0
        );
        let tempOrder = Math.max(maxCurrentOrder + 1, 1);
        while (usedOrders.has(tempOrder)) {
            tempOrder += 1;
        }

        setMovingId(stageId);
        let tempApplied = false;

        const failMove = async (logMessage: string, moveError: { message?: string; code?: string }) => {
            console.error(logMessage, moveError);

            if (tempApplied) {
                const { error: rollbackError } = await client
                    .from('treatment_stages')
                    .update({ stage_order: currentOrder })
                    .eq('id', currentStage.id)
                    .eq('user_id', user.id);

                if (rollbackError) {
                    console.error('순서 변경 롤백 실패', rollbackError);
                }
            }

            await loadStages(user.id);
            setError(MOVE_FAILED_MESSAGE);
            setMovingId(null);
        };

        const { error: tempError } = await client
            .from('treatment_stages')
            .update({ stage_order: tempOrder })
            .eq('id', currentStage.id)
            .eq('user_id', user.id);

        if (tempError) {
            await failMove('순서 변경 실패(임시 순서 적용)', tempError);
            return;
        }
        tempApplied = true;

        const { error: targetError } = await client
            .from('treatment_stages')
            .update({ stage_order: currentOrder })
            .eq('id', targetStage.id)
            .eq('user_id', user.id);

        if (targetError) {
            await failMove('순서 변경 실패(대상 순서 적용)', targetError);
            return;
        }

        const { error: currentError } = await client
            .from('treatment_stages')
            .update({ stage_order: targetOrder })
            .eq('id', currentStage.id)
            .eq('user_id', user.id);

        if (currentError) {
            await failMove('순서 변경 실패(현재 항목 순서 적용)', currentError);
            return;
        }

        await loadStages(user.id);
        setMessage('순서를 변경했어요.');
        setMovingId(null);
    };

    const handleAddStage = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage('');
        setError('');

        if (!hasSupabaseEnv || !supabase) {
            setError(ENV_REQUIRED_MESSAGE);
            return;
        }

        if (!user) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        if (!addStageLabel.trim()) {
            setError(EMPTY_NAME_MESSAGE);
            return;
        }

        const parsedOrder = Number(addStageOrder);
        if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
            setError(ORDER_INVALID_MESSAGE);
            return;
        }

        const hasDuplicateOrder = stages.some((stage) => Number(stage.stage_order) === parsedOrder);
        if (hasDuplicateOrder) {
            setError(duplicateOrderMessage);
            return;
        }

        setAdding(true);

        if (addStatus === 'active') {
            const { error: clearActiveError } = await supabase
                .from('treatment_stages')
                .update({ status: 'planned' })
                .eq('user_id', user.id)
                .eq('status', 'active');

            if (clearActiveError) {
                console.error('진행중 단계 초기화 실패', clearActiveError);
                setError(
                    isPermissionError(clearActiveError.message, clearActiveError.code)
                        ? PERMISSION_MESSAGE
                        : '진행중 단계 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'
                );
                setAdding(false);
                return;
            }
        }

        const { error: insertError } = await supabase.from('treatment_stages').insert({
            user_id: user.id,
            stage_type: addStageType,
            stage_label: addStageLabel.trim(),
            stage_order: parsedOrder,
            status: addStatus,
        });

        if (insertError) {
            console.error('단계 추가 실패', insertError);

            if (isOrderUniqueError(insertError.message, insertError.code)) {
                setError(duplicateOrderMessage);
            } else if (isPermissionError(insertError.message, insertError.code)) {
                setError(PERMISSION_MESSAGE);
            } else if (addStatus === 'active') {
                setError('진행중 단계 추가에 실패했어요. 잠시 후 다시 시도해 주세요.');
            } else {
                setError('단계 추가에 실패했어요. 잠시 후 다시 시도해 주세요.');
            }
            setAdding(false);
            return;
        }

        await loadStages(user.id);
        setAddStageLabel('');
        setAddStageOrder('');
        setAddStatus('planned');
        setMessage('단계를 추가했습니다.');
        setAdding(false);
    };

    const handleSaveStage = async (stageId: string) => {
        setMessage('');
        setError('');

        if (!hasSupabaseEnv || !supabase) {
            setError(ENV_REQUIRED_MESSAGE);
            return;
        }

        if (!user) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        const draft = drafts[stageId];
        if (!draft) {
            setError('수정할 단계 정보를 찾을 수 없습니다.');
            return;
        }

        const parsedOrder = Number(draft.stage_order);
        if (!Number.isInteger(parsedOrder) || parsedOrder < 1) {
            setError(ORDER_INVALID_MESSAGE);
            return;
        }

        setSavingId(stageId);

        if (draft.status === 'active') {
            const { error: clearActiveError } = await supabase
                .from('treatment_stages')
                .update({ status: 'planned' })
                .eq('user_id', user.id)
                .eq('status', 'active');

            if (clearActiveError) {
                console.error('진행중 단계 초기화 실패', clearActiveError);
                setError(
                    isPermissionError(clearActiveError.message, clearActiveError.code)
                        ? PERMISSION_MESSAGE
                        : '진행중 단계 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'
                );
                setSavingId(null);
                return;
            }
        }

        const payload = {
            stage_label: draft.stage_label.trim() || null,
            stage_order: parsedOrder,
            status: draft.status,
            started_at: draft.started_at || null,
            ended_at: draft.ended_at || null,
            notes: draft.notes.trim() || null,
        };

        const { error: updateError } = await supabase
            .from('treatment_stages')
            .update(payload)
            .eq('id', stageId)
            .eq('user_id', user.id);

        if (updateError) {
            console.error('단계 수정 실패', updateError);
            if (isOrderUniqueError(updateError.message, updateError.code)) {
                setError(duplicateOrderMessage);
            } else if (isPermissionError(updateError.message, updateError.code)) {
                setError(PERMISSION_MESSAGE);
            } else if (draft.status === 'active') {
                setError('진행중 단계로 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
            } else {
                setError('단계 수정에 실패했어요. 잠시 후 다시 시도해 주세요.');
            }
            setSavingId(null);
            return;
        }

        await loadStages(user.id);
        setMessage('단계를 수정했습니다.');
        setSavingId(null);
    };

    const handleDeleteStage = async (stageId: string) => {
        setMessage('');
        setError('');

        if (!hasSupabaseEnv || !supabase) {
            setError(ENV_REQUIRED_MESSAGE);
            return;
        }

        if (!user) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        setDeletingId(stageId);

        const { error: deleteError } = await supabase
            .from('treatment_stages')
            .delete()
            .eq('id', stageId)
            .eq('user_id', user.id);

        if (deleteError) {
            console.error('단계 삭제 실패', deleteError);
            setError(
                isPermissionError(deleteError.message, deleteError.code)
                    ? PERMISSION_MESSAGE
                    : '단계 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.'
            );
            setDeletingId(null);
            return;
        }

        await loadStages(user.id);
        setMessage('단계를 삭제했습니다.');
        setDeletingId(null);
    };

    const saveTreatmentMeta = async () => {
        setMessage('');
        setError('');

        if (!supabase) {
            setError(ENV_REQUIRED_MESSAGE);
            return;
        }

        if (!user) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        if (!cancerType.trim()) {
            setError('암 종류를 입력해 주세요.');
            return;
        }

        const payload: TreatmentMeta = {
            cancerType: cancerType.trim(),
            cancerStage: cancerStage.trim(),
            updatedAt: new Date().toISOString(),
        };

        const { user: authUser, error: authError } = await getAuthSessionUser();
        if (authError || !authUser) {
            setError(LOGIN_REQUIRED_MESSAGE);
            return;
        }

        const updatedMetadata = buildUpdatedUserMetadata(authUser.user_metadata, payload);
        const { error: updateError } = await supabase.auth.updateUser({
            data: updatedMetadata,
        });
        if (updateError) {
            setError('암 정보를 서버에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
            return;
        }

        localStorage.setItem(getTreatmentMetaKey(user.id), JSON.stringify(payload));
        setMetaUpdatedAt(payload.updatedAt);
        setMessage('암 정보 저장을 완료했어요.');
    };

    if (loading) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">치료 단계 관리</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">불러오는 중이에요…</p>
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">치료 단계 관리</h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>

                <section
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                    <h2 className="text-lg font-semibold">설정이 필요해요</h2>
                    <p className="mt-2 text-sm">{ENV_REQUIRED_MESSAGE}</p>
                </section>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">치료 단계 관리</h1>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
                </section>

                <section
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                    <h2 className="text-lg font-semibold">로그인이 필요해요</h2>
                    <p className="mt-2 text-sm">
                        <Link href="/auth" className="font-bold underline">
                            로그인 페이지
                        </Link>
                        로 이동해 로그인해 주세요.
                    </p>
                </section>
            </main>
        );
    }

    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">치료 단계 관리</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{DISCLAIMER_TEXT}</p>
            </section>

            {error && (
                <section
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                >
                    <p className="text-sm font-semibold">오류</p>
                    <p className="mt-1 text-sm">{error}</p>
                </section>
            )}

            {message && (
                <section
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                >
                    <p className="text-sm font-semibold">완료</p>
                    <p className="mt-1 text-sm">{message}</p>
                </section>
            )}

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">암 정보 입력</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    맞춤 식단 알림 정확도를 높이기 위해 암 종류를 입력해 주세요. 기수 입력/수정은 내 정보에서만 할 수 있어요.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                        암 종류
                        <input
                            aria-label="암 종류 입력"
                            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                            value={cancerType}
                            onChange={(event) => setCancerType(event.target.value)}
                            placeholder="예: 유방암"
                        />
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        aria-label="암 정보 저장"
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        onClick={saveTreatmentMeta}
                    >
                        저장
                    </button>
                    {metaUpdatedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            최근 저장: {new Date(metaUpdatedAt).toLocaleString('ko-KR')}
                        </p>
                    )}
                </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">등록된 단계</h2>

                {stages.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        아직 등록된 단계가 없어요. 아래에서 단계를 추가해 보세요.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {primaryStage && (
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                                    {primaryStage.status === 'active' ? '현재 진행중 치료' : '현재 기준 치료'}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-100">
                                    {STAGE_TYPE_LABELS[primaryStage.stage_type]} ·{' '}
                                    {primaryStage.stage_label?.trim() || '이름 없음'}
                                </p>
                            </div>
                        )}

                        {pastStagesCount > 0 && (
                            <button
                                type="button"
                                aria-label="지난 또는 예정 단계 보기 전환"
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                onClick={() => setShowPastStages((prev) => !prev)}
                            >
                                {showPastStages
                                    ? '지난/예정 치료 단계 접기'
                                    : `지난/예정 치료 단계 보기 (${pastStagesCount}개)`}
                            </button>
                        )}

                        {stages
                            .filter((stage) => stage.id === primaryStage?.id || showPastStages)
                            .map((stage) => {
                            const draft = drafts[stage.id] ?? toDraft(stage);
                            const isSaving = savingId === stage.id;
                            const isDeleting = deletingId === stage.id;
                            const isMoving = movingId === stage.id;
                            const isExpanded = !!expandedById[stage.id];
                            const currentIndex = stages.findIndex((item) => item.id === stage.id);
                            const canMoveUp = currentIndex > 0;
                            const canMoveDown = currentIndex < stages.length - 1;
                            const disableMove = adding || isSaving || isDeleting || movingId !== null;
                            const disableAction = adding || isSaving || isDeleting || movingId !== null;

                            const statusBadgeClass =
                                draft.status === 'active'
                                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white'
                                    : draft.status === 'completed'
                                      ? 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                                      : 'border-gray-300 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';

                            const stageName = stage.stage_label?.trim() || '이름 없음';

                            return (
                                <article
                                    key={stage.id}
                                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                                >
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">단계 유형</p>
                                            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {STAGE_TYPE_LABELS[stage.stage_type]}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">단계 이름</p>
                                            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {stageName}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">상태</p>
                                            <p className="mt-1">
                                                <span
                                                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass}`}
                                                >
                                                    {STATUS_LABELS[draft.status]}
                                                </span>
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">순서</p>
                                            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {stage.stage_order}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            aria-label={`${stageName} 위로 이동`}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            onClick={() => void handleMoveStage(stage.id, 'up')}
                                            disabled={!canMoveUp || disableMove}
                                        >
                                            {isMoving ? '이동 중...' : '위로'}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`${stageName} 아래로 이동`}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            onClick={() => void handleMoveStage(stage.id, 'down')}
                                            disabled={!canMoveDown || disableMove}
                                        >
                                            {isMoving ? '이동 중...' : '아래로'}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`${stageName} 상세 보기 전환`}
                                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                            onClick={() => toggleDetails(stage.id)}
                                            disabled={disableAction}
                                        >
                                            {isExpanded ? '접기' : '자세히'}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`${stageName} 삭제`}
                                            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50"
                                            onClick={() => void handleDeleteStage(stage.id)}
                                            disabled={disableAction}
                                        >
                                            {isDeleting ? '삭제 중...' : '삭제'}
                                        </button>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-gray-800">
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                    단계 이름
                                                    <input
                                                        aria-label="수정할 단계 이름"
                                                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                                        value={draft.stage_label}
                                                        onChange={(event) =>
                                                            updateDraft(stage.id, {
                                                                stage_label: event.target.value,
                                                            })
                                                        }
                                                        disabled={disableAction}
                                                    />
                                                </label>

                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                    상태
                                                    <select
                                                        aria-label="수정할 상태"
                                                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                        value={draft.status}
                                                        onChange={(event) =>
                                                            updateDraft(stage.id, {
                                                                status: event.target.value as StageStatus,
                                                            })
                                                        }
                                                        disabled={disableAction}
                                                    >
                                                        {STATUS_OPTIONS.map((option) => (
                                                            <option key={option} value={option}>
                                                                {STATUS_LABELS[option]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                    순서
                                                    <input
                                                        aria-label="수정할 순서"
                                                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                                        type="number"
                                                        step={1}
                                                        min={1}
                                                        value={draft.stage_order}
                                                        onChange={(event) =>
                                                            updateDraft(stage.id, {
                                                                stage_order: event.target.value,
                                                            })
                                                        }
                                                        disabled={disableAction}
                                                    />
                                                </label>

                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                    시작일
                                                    <input
                                                        aria-label="수정할 시작일"
                                                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                        type="date"
                                                        value={draft.started_at}
                                                        onChange={(event) =>
                                                            updateDraft(stage.id, {
                                                                started_at: event.target.value,
                                                            })
                                                        }
                                                        disabled={disableAction}
                                                    />
                                                </label>

                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                    종료일
                                                    <input
                                                        aria-label="수정할 종료일"
                                                        className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                                        type="date"
                                                        value={draft.ended_at}
                                                        onChange={(event) =>
                                                            updateDraft(stage.id, {
                                                                ended_at: event.target.value,
                                                            })
                                                        }
                                                        disabled={disableAction}
                                                    />
                                                </label>
                                            </div>

                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                                메모
                                                <textarea
                                                    aria-label="수정할 메모"
                                                    className="mt-2 min-h-24 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                                    value={draft.notes}
                                                    onChange={(event) =>
                                                        updateDraft(stage.id, {
                                                            notes: event.target.value,
                                                        })
                                                    }
                                                    disabled={disableAction}
                                                />
                                            </label>

                                            <button
                                                type="button"
                                                aria-label={`${stageName} 저장`}
                                                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                                                onClick={() => void handleSaveStage(stage.id)}
                                                disabled={disableAction}
                                            >
                                                {isSaving ? '저장 중...' : '저장'}
                                            </button>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">단계 추가</h2>

                <form onSubmit={handleAddStage} className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            단계 유형
                            <select
                                aria-label="단계 유형 선택"
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                value={addStageType}
                                onChange={(event) => setAddStageType(event.target.value as StageType)}
                                disabled={adding}
                            >
                                {STAGE_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {STAGE_TYPE_LABELS[option]}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            단계 이름
                            <input
                                aria-label="단계 이름 입력"
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                value={addStageLabel}
                                onChange={(event) => setAddStageLabel(event.target.value)}
                                placeholder="예: 첫 치료"
                                disabled={adding}
                            />
                        </label>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            순서
                            <input
                                aria-label="순서 입력"
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                                type="number"
                                step={1}
                                min={1}
                                value={addStageOrder}
                                onChange={(event) => setAddStageOrder(event.target.value)}
                                disabled={adding}
                            />
                            <p className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                                이미 등록된 단계와 순서가 겹치면 추가할 수 없어요.
                            </p>
                        </label>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                            상태
                            <select
                                aria-label="상태 선택"
                                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                                value={addStatus}
                                onChange={(event) => setAddStatus(event.target.value as StageStatus)}
                                disabled={adding}
                            >
                                {STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {STATUS_LABELS[option]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <button
                        type="submit"
                        aria-label="단계 추가"
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                        disabled={adding}
                    >
                        {adding ? '추가 중...' : '단계 추가'}
                    </button>
                </form>
            </section>
        </main>
    );
}
