'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
    formatDateKey,
    formatDateLabel,
    generatePlanForDate,
    optimizePlanByPreference,
    STAGE_TYPE_LABELS,
    type DayPlan,
    type PreferenceType,
    type StageType,
} from '@/lib/dietEngine';
import { hasSupabaseEnv, supabase } from '@/lib/supabaseClient';

type StageStatus = 'planned' | 'active' | 'completed';

type TreatmentStageRow = {
    id: string;
    stage_type: StageType;
    stage_order: number;
    status: StageStatus;
    created_at: string;
};

type DietStore = {
    preferences?: PreferenceType[];
    dailyPreferences?: Record<string, PreferenceType[]>;
    carryPreferences?: PreferenceType[];
    logs?: Record<string, DayLog>;
};

type TrackItem = {
    name: string;
    eaten: boolean;
};

type DayLog = {
    meals: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', TrackItem[]>>;
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
    items: Array<{ name: string; count: number }>;
};

const STORAGE_PREFIX = 'diet-store-v2';
const SHOPPING_MEMO_PREFIX = 'shopping-memo-v1';
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

function getStoreKey(userId: string) {
    return `${STORAGE_PREFIX}:${userId}`;
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

        return {
            dailyPreferences,
            carryPreferences: carryPreferences.length > 0 ? carryPreferences : legacyPreferences,
            logs: parsed.logs && typeof parsed.logs === 'object' ? (parsed.logs as Record<string, DayLog>) : {},
        };
    } catch {
        return {
            dailyPreferences: {} as Record<string, PreferenceType[]>,
            carryPreferences: [] as PreferenceType[],
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

function eatenNames(log: DayLog) {
    const slots: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = ['breakfast', 'lunch', 'dinner', 'snack'];
    return slots.flatMap((slot) => (log.meals[slot] ?? []).filter((item) => item.eaten).map((item) => item.name));
}

function normalizeText(input: string) {
    return input.trim().toLowerCase();
}

function countKeywords(text: string, keywords: string[]) {
    const normalized = normalizeText(text);
    return keywords.reduce((count, keyword) => count + (normalized.includes(keyword) ? 1 : 0), 0);
}

function mergePreferences(...lists: Array<PreferenceType[]>) {
    const merged = new Set<PreferenceType>();
    lists.forEach((list) => {
        list.forEach((item) => merged.add(item));
    });
    return Array.from(merged);
}

function recommendAdaptivePreferencesByRecentLogs(logs: Record<string, DayLog>, referenceDateKey: string) {
    const lookbackText = Array.from({ length: 14 }, (_, index) => {
        const dateKey = offsetDateKey(referenceDateKey, -(index + 1));
        const log = logs[dateKey];
        if (!log) {
            return '';
        }
        return eatenNames(log).join(' ');
    })
        .join(' ')
        .trim();

    if (!lookbackText) {
        return [] as PreferenceType[];
    }

    const suggestions: PreferenceType[] = [];
    const add = (value: PreferenceType) => {
        if (!suggestions.includes(value)) {
            suggestions.push(value);
        }
    };

    const flourSugarCount =
        countKeywords(lookbackText, ['빵', '라면', '면', '파스타', '피자', '도넛']) +
        countKeywords(lookbackText, ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
    const proteinCount = countKeywords(lookbackText, ['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유']);
    const vegetableCount = countKeywords(lookbackText, ['브로콜리', '양배추', '시금치', '오이', '당근', '버섯', '샐러드', '채소']);

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

    const yesterdayLog = logs[offsetDateKey(referenceDateKey, -1)];
    if (yesterdayLog) {
        const yesterdayText = eatenNames(yesterdayLog).join(' ');
        const heavyCount =
            countKeywords(yesterdayText, ['튀김', '치킨', '야식', '술', '맥주', '소주', '족발', '보쌈']) +
            countKeywords(yesterdayText, ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
        if (heavyCount >= 3) {
            add('healthy');
            add('digestive');
            add('low_salt');
        }
    }

    return suggestions.slice(0, 4);
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
            .map(([name, count]) => ({ name, count })),
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
    const [stageType, setStageType] = useState<StageType>('other');
    const [dailyPreferences, setDailyPreferences] = useState<Record<string, PreferenceType[]>>({});
    const [logs, setLogs] = useState<Record<string, DayLog>>({});

    const [startDateKey, setStartDateKey] = useState(todayKey);
    const [rangeDays, setRangeDays] = useState(3);
    const [memo, setMemo] = useState('');
    const [memoSavedAt, setMemoSavedAt] = useState('');
    const [showPlanSummary, setShowPlanSummary] = useState(false);

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
                setStageType('other');
                setDailyPreferences({});
                setMemo(localStorage.getItem(getShoppingMemoKey(null)) ?? '');
                setLoading(false);
                return;
            }

            const uid = authData.user.id;
            setUserId(uid);

            const { data: stageData } = await supabase
                .from('treatment_stages')
                .select('id, stage_type, stage_order, status, created_at')
                .eq('user_id', uid)
                .order('stage_order', { ascending: true })
                .order('created_at', { ascending: true });

            const rows = (stageData ?? []) as TreatmentStageRow[];
            const activeStage = rows.find((row) => row.status === 'active') ?? rows[0];
            if (activeStage) {
                setStageType(activeStage.stage_type);
            }

            const parsed = parseDietStore(localStorage.getItem(getStoreKey(uid)));
            setDailyPreferences(parsed.dailyPreferences);
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
        return dateKeys.map((dateKey) => {
            const basePlan = generatePlanForDate(dateKey, stageType, 70);
            const byDatePreferences = dailyPreferences[dateKey];
            const adaptivePreferences = recommendAdaptivePreferencesByRecentLogs(logs, dateKey);
            const appliedPreferences = mergePreferences(adaptivePreferences, byDatePreferences ?? []);

            if (appliedPreferences.length === 0) {
                return {
                    dateKey,
                    plan: basePlan,
                };
            }

            return {
                dateKey,
                plan: optimizePlanByPreference(basePlan, appliedPreferences).plan,
            };
        });
    }, [dateKeys, stageType, dailyPreferences, logs]);

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
                    식단 메뉴를 실제 구입 재료 기준으로 환산했어요. 괄호 숫자는 사용되는 횟수예요.
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
                                        - {item.name} ({item.count}회)
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">장보기 메모</h2>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            날짜를 정하면 해당 기간 식단표를 기준으로 장볼 목록을 분야별로 추천해 드려요.
                        </p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            현재 치료 단계: {STAGE_TYPE_LABELS[stageType]}
                        </p>
                    </div>
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
