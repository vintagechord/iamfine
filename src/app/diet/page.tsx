'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Leaf, Minus, Plus, Search } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
    type DayPlan,
    type MealSlot,
    type PreferenceType,
    type StageType,
    type UserDietContext,
    type UserMedicationSchedule,
} from '@/lib/dietEngine';
import { searchFoods, normalizeFoodQuery, type FoodSearchResult } from '@/lib/foodSearch';
import { applyFoodPersonalization, describeFoodPersonalization, hasRenalDietRestrictions, matchesAvoidedIngredient, parseFoodPersonalization, readFoodPersonalization, type AvoidedIngredient } from '@/lib/personalization';
import { parseAdditionalConditionsFromUnknown, type AdditionalCondition } from '@/lib/additionalConditions';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { applyMealRecordGuidance, buildDietRecordContext } from '@/lib/dietRecordContext';
import HealthNewsFeed from '@/components/HealthNewsFeed';
import NextVisitSummary from '@/components/NextVisitSummary';
import DailyVerse from '@/components/DailyVerse';
import RecommendedMeals from '@/components/RecommendedMeals';

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

type DailyLogsStorageMode = 'unknown' | 'table' | 'local';

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
const RECORD_SAVE_SUCCESS_MESSAGE_LOCAL = '저장하였습니다. 현재 기기에서 확인할 수 있어요.';

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
    '흑미밥',
    '보리밥',
    '귀리밥',
    '기장밥',
    '퀴노아밥',
    '곤드레밥',
    '콩나물밥',
    '영양밥',
    '주먹밥',
    '삼각김밥',
    '볶음밥',
    '김치볶음밥',
    '새우볶음밥',
    '덮밥',
    '불고기덮밥',
    '연어덮밥',
    '카레라이스',
    '오므라이스',
    '리조또',
    '죽',
    '닭죽',
    '전복죽',
    '야채죽',
    '흰죽',
    '호박죽',
    '오트밀',
    '그래놀라',
    '시리얼',
    '닭가슴살',
    '닭안심찜',
    '닭다리살구이',
    '닭갈비',
    '찜닭',
    '닭볶음탕',
    '삼계탕',
    '연어구이',
    '고등어구이',
    '갈치구이',
    '조기구이',
    '대구탕',
    '아귀찜',
    '고등어조림',
    '흰살생선찜',
    '두부조림',
    '두부부침',
    '두부스테이크',
    '순두부찌개',
    '연두부',
    '된장찌개',
    '청국장',
    '달걀찜',
    '계란말이',
    '계란프라이',
    '오믈렛',
    '스크램블에그',
    '브로콜리찜',
    '당근볶음',
    '양배추볶음',
    '버섯볶음',
    '시금치나물',
    '오이무침',
    '콩나물무침',
    '숙주나물',
    '애호박볶음',
    '가지볶음',
    '감자조림',
    '연근조림',
    '우엉조림',
    '깻잎무침',
    '샐러드',
    '그린샐러드',
    '닭가슴살샐러드',
    '연어샐러드',
    '참치샐러드',
    '과일샐러드',
    '채소수프',
    '된장국',
    '미역국',
    '콩나물국',
    '북엇국',
    '무국',
    '소고기무국',
    '떡국',
    '만둣국',
    '갈비탕',
    '설렁탕',
    '곰탕',
    '육개장',
    '감자수프',
    '단호박수프',
    '양송이스프',
    '토마토수프',
    '그릭요거트',
    '무가당 요거트',
    '두유',
    '저지방우유',
    '아몬드밀크',
    '치즈',
    '리코타치즈',
    '바나나',
    '사과',
    '배',
    '키위',
    '오렌지',
    '귤',
    '포도',
    '딸기',
    '블루베리',
    '망고',
    '파인애플',
    '수박',
    '참외',
    '복숭아',
    '오렌지주스',
    '사과주스',
    '토마토주스',
    '토마토',
    '고구마',
    '감자',
    '단호박',
    '옥수수',
    '찐고구마',
    '찐감자',
    '견과류',
    '아몬드',
    '호두',
    '캐슈넛',
    '피스타치오',
    '병아리콩',
    '렌틸콩',
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
    '샌드위치',
    '클럽샌드위치',
    '에그샌드위치',
    '참치샌드위치',
    '베이글',
    '랩샌드위치',
    '타코',
    '브리또',
    '퀘사디아',
    '떡볶이',
    '라볶이',
    '순대',
    '튀김',
    '김밥',
    '참치김밥',
    '치즈김밥',
    '불고기김밥',
    '비빔밥',
    '돌솥비빔밥',
    '산채비빔밥',
    '라면',
    '비빔면',
    '칼국수',
    '잔치국수',
    '비빔국수',
    '메밀국수',
    '물냉면',
    '비빔냉면',
    '쫄면',
    '짜장면',
    '짬뽕',
    '우동',
    '마라탕',
    '마라샹궈',
    '탕수육',
    '깐풍기',
    '파스타',
    '스파게티',
    '알리오올리오',
    '토마토파스타',
    '크림파스타',
    '봉골레파스타',
    '라자냐',
    '돈가스',
    '치즈돈가스',
    '제육볶음',
    '불고기',
    '삼겹살',
    '목살구이',
    '갈비찜',
    '오리고기',
    '훈제오리',
    '족발',
    '보쌈',
    '순대국',
    '돼지국밥',
    '해장국',
    '김치찌개',
    '부대찌개',
    '동태찌개',
    '불고기전골',
    '샤브샤브',
    '김치전',
    '해물파전',
    '아이스크림',
    '초콜릿',
    '쿠키',
    '케이크',
    '티라미수',
    '마카롱',
    '도넛',
    '빵',
    '식빵',
    '호밀빵',
    '바게트',
    '크로와상',
    '와플',
    '팬케이크',
    '붕어빵',
    '호떡',
    '과자',
    '젤리',
    '팝콘',
    '콜라',
    '사이다',
    '탄산음료',
    '레몬에이드',
    '자몽에이드',
    '밀크티',
    '버블티',
    '커피',
    '라떼',
    '카페라떼',
    '아메리카노',
    '디카페인 아메리카노',
    '콜드브루',
    '카푸치노',
    '바닐라라떼',
    '녹차라떼',
    '코코아',
    '핫초코',
    '보리차',
    '카모마일차',
    '루이보스차',
    '페퍼민트차',
    '생강차',
    '레몬밤차',
    '홍차',
    '녹차',
    '우롱차',
    '유자차',
    '대추차',
    '주스',
    '스무디',
    '요거트스무디',
    '맥주',
    '소주',
    '와인',
    '막걸리',
    '하이볼',
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

function isSelectableRecordDate(dateKey: string | null, todayKey: string): dateKey is string {
    if (!dateKey || !DATE_KEY_PATTERN.test(dateKey) || dateKey > todayKey) return false;
    return formatDateKey(parseDateKey(dateKey)) === dateKey;
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

    if (
        normalized.includes('현미밥') ||
        normalized.includes('잡곡밥') ||
        normalized.includes('귀리밥') ||
        normalized.includes('보리밥') ||
        normalized.includes('흑미밥') ||
        normalized.includes('기장밥') ||
        normalized.includes('수수밥') ||
        normalized.includes('렌틸콩밥') ||
        normalized.includes('퀴노아잡곡밥') ||
        normalized.includes('곤드레밥')
    ) {
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
    if (normalized.includes('대구살')) {
        return '한 토막(80~90g)';
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
    if (normalized.includes('리코타치즈')) {
        return '작은 스푼 3~4큰술(50~60g)';
    }
    if (normalized.includes('오트밀')) {
        return '1/3컵(35~40g)';
    }
    if (normalized.includes('병아리콩')) {
        return '1/3컵(50~60g)';
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
    if (normalized.includes('토마토')) {
        return '중간 크기 1/2개 또는 방울토마토 5~6개(70g)';
    }
    if (normalized.includes('파프리카')) {
        return '1/3개(50~60g)';
    }
    if (normalized.includes('청경채')) {
        return '작은 포기 1개(60~70g)';
    }
    if (normalized.includes('숙주') || normalized.includes('콩나물')) {
        return '작은 접시 1개(60~70g)';
    }
    if (normalized.includes('연근') || normalized.includes('우엉')) {
        return '2~3큰술(40~50g)';
    }
    if (normalized.includes('무나물') || normalized.includes('배추찜') || normalized.includes('양배추찜')) {
        return '작은 접시 1개(60g)';
    }
    if (normalized.includes('단호박')) {
        return '작은 조각 2~3개(70~90g)';
    }
    if (normalized.includes('당근볶음')) {
        return '2~3큰술(40~50g)';
    }
    if (normalized.includes('버섯볶음') || normalized.includes('새송이버섯') || normalized.includes('구운버섯')) {
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

    if (meal.nutritionUnavailable) {
        return {
            items: uniqueNames.map((name) => ({ name, amount: '개인 섭취량 확인 필요' })),
            notes: ['상세 영양량과 섭취량은 아직 계산하지 않아요. 의료진과 정한 식사량을 따라 주세요.'],
        };
    }
    const items: PortionGuideItem[] = uniqueNames.map((name) => ({
        name,
        amount: baseAmountByFoodName(name, slot),
    }));

    const notes: string[] = ['일반적인 1인분 참고량이에요. 치료 중 식사량은 의료진의 안내를 먼저 따라 주세요.'];
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
        notes.push('먹기 편한 속도로 천천히 드세요.');
    }

    return { items, notes };
}

function mealTrackNamesWithPortion(meal: MealPlanItem, slot: MealSlot) {
    const guide = mealPortionGuideFromPlan(meal, slot);
    return guide.items.map((item) => meal.nutritionUnavailable ? item.name : `${item.name} · ${item.amount}`);
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

function hasVolatileDietMetadata(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return false;
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return false;
    }

    const scoped = namespaced as Record<string, unknown>;
    return 'recentDietSignals' in scoped || 'dailyPreferences' in scoped || 'dailyLogs' in scoped;
}

function buildTrimmedDietMetadata(
    raw: unknown,
    patch: Partial<{
        treatmentMeta: TreatmentMeta;
        medications: string[];
        medicationSchedules: MedicationSchedule[];
        additionalConditions: AdditionalCondition[];
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
    const stableNamespaced = { ...existingNamespaced };
    delete stableNamespaced.recentDietSignals;
    delete stableNamespaced.dailyPreferences;
    delete stableNamespaced.dailyLogs;

    return {
        ...root,
        [USER_METADATA_NAMESPACE]: {
            ...stableNamespaced,
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
    return normalizeFoodQuery(input.replace(/\s+/g, ' '));
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

function searchManualFoodCandidates(query: string, candidates: string[], maxResults = 20) {
    return searchFoods(query, candidates, maxResults).map((result) => result.name);
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

function buildSubstituteCandidates(foodName: string, slot: MealSlot, fallbackCandidates: string[], avoidedIngredients: AvoidedIngredient[] = []) {
    const normalizedCurrent = normalizeManualMealName(stripPortionLabel(foodName));
    const matchedGroup = findSubstituteGroup(normalizedCurrent, slot);
    const groupCandidates = (matchedGroup?.options ?? [])
        .map((name) => normalizeManualMealName(name))
        .filter(Boolean)
        .filter((name) => name !== normalizedCurrent);

    const similarCandidates = searchManualFoodCandidates(normalizedCurrent, fallbackCandidates, 8)
        .map((name) => normalizeManualMealName(name))
        .filter((name) => name && name !== normalizedCurrent);

    const merged = Array.from(new Set([...groupCandidates, ...similarCandidates]))
        .filter((name) => !matchesAvoidedIngredient(name, avoidedIngredients)).slice(0, 8);

    return {
        hint: matchedGroup?.nutritionHint ?? '비슷한 종류 · 영양량은 달라요',
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
    const router = useRouter();

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
    const [foodPersonalization, setFoodPersonalization] = useState(() => parseFoodPersonalization(null));

    const requestedRecordDate = searchParams.get('date');
    const selectedDate = isSelectableRecordDate(requestedRecordDate, todayKey) ? requestedRecordDate : todayKey;
    const requestedRecordSlot = searchParams.get('meal') as MealSlot | null;
    const activeRecordSlot: MealSlot = requestedRecordSlot && SLOT_ORDER.includes(requestedRecordSlot) ? requestedRecordSlot : 'breakfast';
    const [todayPlanOffset, setTodayPlanOffset] = useState(0);
    const [openRecipeSlot, setOpenRecipeSlot] = useState<RecipeTarget | null>(null);
    const [showDietModeInfoModal, setShowDietModeInfoModal] = useState(false);
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

    const openRecordView = searchParams.get('view') === 'record';
    const hasOpenDialog = Boolean(openRecipeSlot || showDietModeInfoModal || showRecordPlanModal);
    useEffect(() => {
        if (!hasOpenDialog) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
        if (!dialog) return;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex="0"]')).filter((element) => element.getClientRects().length > 0);
        (focusable()[0] ?? dialog).focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpenRecipeSlot(null);
                setShowDietModeInfoModal(false);
                setShowRecordPlanModal(false);
            }
            if (event.key !== 'Tab') return;
            const elements = focusable();
            const first = elements[0] ?? dialog;
            const last = elements[elements.length - 1] ?? dialog;
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = oldOverflow;
            document.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus();
        };
    }, [hasOpenDialog]);

    const closeSaveSuccessPopup = useCallback(() => {
        if (saveSuccessPopupTimerRef.current !== null) {
            window.clearTimeout(saveSuccessPopupTimerRef.current);
            saveSuccessPopupTimerRef.current = null;
        }
        setSaveSuccessPopupOpen(false);
    }, []);

    const showSaveSuccessPopup = useCallback((text: string) => {
        setMessage('');
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
    const userDietContext = useMemo<UserDietContext>(() => {
        const nowYear = new Date().getFullYear();
        const age = profile?.birth_year ? Math.max(0, nowYear - profile.birth_year) : undefined;
        const recordContext = buildDietRecordContext(logs, todayKey);
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
            ...recordContext,
        };
    }, [profile, treatmentMeta, activeStage, medicationSchedules, additionalConditions, logs, todayKey]);

    const applyRecommendationAdjustments = useCallback(
        (basePlan: DayPlan, targetPreferences: PreferenceType[], dateKey: string) => {
            if (hasRenalDietRestrictions(userDietContext)) {
                const userContextAdjusted = optimizePlanByUserContext(basePlan, userDietContext);
                const reviewed = applyFoodPersonalization(userContextAdjusted.plan, foodPersonalization, userDietContext);
                return {
                    plan: reviewed.plan,
                    notes: Array.from(new Set([
                        ...userContextAdjusted.notes,
                        ...reviewed.notes,
                        '신장 관련 정보가 있어 선호·복용 약에 따른 자동 메뉴 변경을 보류했어요. 식사와 약 복용 지침은 의료진과 확인해 주세요.',
                    ])),
                };
            }
            const medicationAdjusted = optimizePlanByMedications(basePlan, medications);
            const validHeight = userDietContext.heightCm && userDietContext.heightCm > 0 ? userDietContext.heightCm : null;
            const validWeight = userDietContext.weightKg && userDietContext.weightKg > 0 ? userDietContext.weightKg : null;
            const bmi =
                validHeight && validWeight
                    ? Number((validWeight / Math.pow(validHeight / 100, 2)).toFixed(1))
                    : null;
            const yesterdayLog = logs[offsetDateKey(dateKey, -1)];
            const yesterdayEatenCount = yesterdayLog ? eatenTrackItems(yesterdayLog).length : 0;
            const lowAppetiteRisk =
                foodPersonalization.symptoms.length > 0 ||
                targetPreferences.includes('appetite_boost') ||
                (yesterdayLog ? yesterdayEatenCount <= 2 : false);
            const effectivePreferences = lowAppetiteRisk
                ? targetPreferences.filter((preference) => preference !== 'weight_loss')
                : targetPreferences;
            const weightLossPreference = effectivePreferences.includes('weight_loss');
            const preferenceAdjusted =
                effectivePreferences.length === 0
                    ? { plan: medicationAdjusted.plan, notes: [] as string[] }
                    : optimizePlanByPreference(medicationAdjusted.plan, effectivePreferences);
            const dinnerCarbSafetyAdjusted = applyDinnerCarbSafety(preferenceAdjusted.plan, {
                bmi,
                lowAppetiteRisk,
                weightLossPreference,
            });
            const yesterdayAdjusted = lowAppetiteRisk
                ? { plan: dinnerCarbSafetyAdjusted.plan, notes: [] as string[] }
                : applyMealRecordGuidance(dinnerCarbSafetyAdjusted.plan, logs[offsetDateKey(dateKey, -1)]);
            const userContextAdjusted = optimizePlanByUserContext(yesterdayAdjusted.plan, userDietContext);
            const personalized = applyFoodPersonalization(userContextAdjusted.plan, foodPersonalization, userDietContext);
            return {
                plan: personalized.plan,
                notes: [
                    ...userContextAdjusted.notes,
                    ...medicationAdjusted.notes,
                    ...preferenceAdjusted.notes,
                    ...personalized.notes,
                    ...(lowAppetiteRisk && targetPreferences.includes('weight_loss')
                        ? ['식사가 불편한 동안은 체중감량 선택을 적용하지 않아요.'] : []),
                    ...dinnerCarbSafetyAdjusted.notes,
                    ...yesterdayAdjusted.notes,
                ],
            };
        },
        [userDietContext, medications, logs, foodPersonalization]
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
            `식사 맞춤 설정: ${describeFoodPersonalization(foodPersonalization).join(', ') || '아직 선택하지 않았어요'}`,
        ];
    }, [userDietContext, activeStage, medicationSchedules, additionalConditions, foodPersonalization]);

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
        () => mergePreferences(adaptiveTodayPreferences, userSelectedTodayPreferences),
        [adaptiveTodayPreferences, userSelectedTodayPreferences]
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
            return mergePreferences(adaptive, byDate);
        },
        [dailyPreferences, logs]
    );

    // The monthly schedule is generated before clinical adjustments. Do not
    // reshuffle afterwards: that would overwrite symptoms and excluded foods.
    const getRecommendedPlan = useCallback((dateKey: string) => {
        if (dateKey === todayKey) return optimizedToday;
        const basePlan = generatePlanForDate(dateKey, stageType, previousMonthScore);
        return applyRecommendationAdjustments(basePlan, resolveAppliedPreferences(dateKey), dateKey);
    }, [todayKey, optimizedToday, stageType, previousMonthScore, resolveAppliedPreferences, applyRecommendationAdjustments]);

    const todayPlan = optimizedToday.plan;
    const getPlanForDate = useCallback((dateKey: string) => getRecommendedPlan(dateKey).plan, [getRecommendedPlan]);
    const getPlanNotesForDate = useCallback(
        (dateKey: string) => Array.from(new Set(getRecommendedPlan(dateKey).notes)),
        [getRecommendedPlan]
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

        const planDateKeys = Array.from(new Set([todayKey, selectedDate]));
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
    }, [todayKey, selectedDate, getPlanForDate, logs]);
    const manualMatchCandidatesBySlot = useMemo<Record<MealSlot, FoodSearchResult[]>>(
        () =>
            SLOT_ORDER.reduce<Record<MealSlot, FoodSearchResult[]>>(
                (acc, slot) => {
                    acc[slot] = searchFoods(newItemBySlot[slot], manualFoodCandidates, 20)
                        .filter((candidate) => candidate.matchType !== 'related' || !matchesAvoidedIngredient(candidate.name, foodPersonalization.avoidedIngredients))
                        .slice(0, 12);
                    return acc;
                },
                {
                    breakfast: [],
                    lunch: [],
                    dinner: [],
                    snack: [],
                }
            ),
        [newItemBySlot, manualFoodCandidates, foodPersonalization.avoidedIngredients]
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
    const selectedAnalysis = useMemo(
        () => analyzeDay(selectedPlan, selectedLog, stageType),
        [selectedPlan, selectedLog, stageType]
    );
    const todayScore = useMemo(() => {
        const todayLog = logs[todayKey] ?? buildDefaultLog(todayKey, todayPlan);
        return analyzeDay(todayPlan, todayLog, stageType).dailyScore;
    }, [logs, todayKey, todayPlan, stageType]);

    const timingGuide = useMemo(() => getSnackCoffeeTimingGuide(stageType), [stageType]);
    const beverageCaution = useMemo(() => coffeeGuidanceByStage(stageType), [stageType]);
    const dailyTeaRecommendations = useMemo(
        () => hasRenalDietRestrictions(userDietContext) ? [] : buildDailyTeaRecommendations(stageType, viewedTodayPlan)
            .filter((item) => !matchesAvoidedIngredient(item.name, foodPersonalization.avoidedIngredients)),
        [stageType, viewedTodayPlan, userDietContext, foodPersonalization.avoidedIngredients]
    );
    const dailyCoffeeRecommendations = useMemo(
        () => hasRenalDietRestrictions(userDietContext) ? [] : buildDailyCoffeeRecommendations(stageType, viewedTodayPlan)
            .filter((item) => !matchesAvoidedIngredient(item.name, foodPersonalization.avoidedIngredients)),
        [stageType, viewedTodayPlan, userDietContext, foodPersonalization.avoidedIngredients]
    );
    const snackCoffeeRecommendedTime = useMemo(() => {
        if (stageType === 'chemo' || stageType === 'chemo_2nd') {
            return {
                snack: '14시~16시',
                coffee: '10시~11시',
                tea: '9시~18시(무카페인)',
            };
        }

        if (stageType === 'radiation') {
            return {
                snack: '14시~15시',
                coffee: '10시~11시',
                tea: '9시~18시(무카페인)',
            };
        }

        return {
            snack: '14시~16시',
            coffee: '9시~11시',
            tea: '9시~18시(무카페인)',
        };
    }, [stageType]);
    const foodGuides = useMemo(() => getStageFoodGuides(stageType), [stageType]);
    const openRecipeContent = useMemo<RecipeModalContent | null>(() => {
        if (!openRecipeSlot) {
            return null;
        }

        if (openRecipeSlot === 'coffee') {
            if (hasRenalDietRestrictions(userDietContext)) {
                return {
                    title: '음료 섭취 안내',
                    recipeName: '의료진과 정한 수분 섭취량을 따라 주세요.',
                    recipeSteps: ['신장 상태에 따라 음료 종류와 양이 달라질 수 있어 자동 추천을 보류했어요.'],
                };
            }
            return {
                title: '커피/차 가이드',
                recipeName: '치료 중 음료(커피·차) 섭취 방법',
                recipeSteps: uniqueRecipeSteps([
                    timingGuide.coffee,
                    timingGuide.tea,
                    beverageCaution,
                    dailyCoffeeRecommendations.length > 0
                        ? `오늘 커피: ${dailyCoffeeRecommendations.map((item) => item.name).join(', ')}`
                        : '커피는 필수가 아니며, 원할 때만 소량으로 드셔 주세요.',
                    dailyTeaRecommendations.length > 0
                        ? `오늘 차: ${dailyTeaRecommendations.map((item) => item.name).join(', ')}`
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
        userDietContext,
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

    const recordDateKeys = useMemo(() => {
        const yesterdayKey = offsetDateKey(todayKey, -1);
        const keySet = new Set<string>();
        keySet.add(todayKey);
        if (yesterdayKey >= accountStartDateKey) {
            keySet.add(yesterdayKey);
        }

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
    }, [accountStartDateKey, selectedDate, todayKey]);

    const syncDailyLogsToLocalFallback = useCallback(async (nextLogs: Record<string, DayLog>) => {
        if (!userId) {
            return false;
        }

        try {
            const storeKey = getStoreKey(userId);
            const latestStored = parseStore(localStorage.getItem(storeKey));
            localStorage.setItem(
                storeKey,
                JSON.stringify({
                    ...latestStored,
                    logs: nextLogs,
                } satisfies DietStore)
            );
            return true;
        } catch (syncError) {
            console.error('식단 로그 로컬 저장 실패', syncError);
            return false;
        }
    }, [userId]);

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
        setFoodPersonalization(readFoodPersonalization(user.user_metadata));
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
                tableMode = 'local';
                setDailyLogsStorageMode('local');
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
                    tableMode = 'local';
                    setDailyLogsStorageMode('local');
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
            Object.keys(store.dailyPreferences).length > 0
                ? store.dailyPreferences
                : metadata.dailyPreferences;
        const resolvedMedications = metadata.medications.length > 0 ? metadata.medications : store.medications;
        const resolvedMedicationSchedules =
            metadata.medicationSchedules.length > 0 ? metadata.medicationSchedules : store.medicationSchedules;
        const resolvedAdditionalConditions = metadata.additionalConditions;
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
        if (Object.keys(syncPatch).length > 0 || hasVolatileDietMetadata(user.user_metadata)) {
            const updatedMetadata = buildTrimmedDietMetadata(user.user_metadata, syncPatch);
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
                if (dailyLogsStorageMode === 'local') {
                    const localSyncOk = await syncDailyLogsToLocalFallback(logs);
                    if (!localSyncOk) {
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
                        setDailyLogsStorageMode('local');
                        const localSyncOk = await syncDailyLogsToLocalFallback(logs);
                        if (!localSyncOk) {
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
    }, [storeReady, userId, logs, dailyLogsStorageMode, syncDailyLogsToLocalFallback]);

    const changeRecordSelection = (dateKey: string, slot: MealSlot) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', 'record');
        params.set('date', dateKey);
        params.set('meal', slot);
        router.replace(`/diet?${params.toString()}`, { scroll: false });
        setError('');
        setOpenSubstituteTarget(null);
    };

    const selectRecordDate = (nextDateKey: string) => {
        const normalizedDateKey = nextDateKey.trim();
        if (!isSelectableRecordDate(normalizedDateKey, todayKey)) {
            if (normalizedDateKey) setError('오늘까지의 올바른 날짜를 선택해 주세요.');
            return;
        }
        changeRecordSelection(normalizedDateKey, activeRecordSlot);
    };

    const updateCurrentLog = useCallback((updater: (current: DayLog) => DayLog) => {
        setLogs((prev) => {
            const current = prev[selectedDate] ?? buildDefaultLog(selectedDate, selectedPlan);
            const updated = updater(current);
            return {
                ...prev,
                [selectedDate]: updated,
            };
        });
    }, [selectedDate, selectedPlan]);

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

        const confirmedPreferences = draftTodayPreferences;
        setDailyPreferences((prev) => ({
            ...prev,
            [todayKey]: confirmedPreferences,
        }));
        setCarryPreferences([]);
        setProposalRequested(false);
        setShowTodayPreferencePanel(false);
        setMessage('오늘 식단을 바꿨어요. 내일은 기본 설정으로 돌아가요.');
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
                              name: normalizedSubstitute,
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

    const addMealItem = useCallback((
        slot: MealSlot,
        matchedFoodName?: string
    ) => {
        // Only an explicit suggestion tap may change the food the user typed.
        const input = (matchedFoodName ?? newItemBySlot[slot]).trim();
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

        setMessage(`"${normalizedName}"을 추가했어요. 아래 저장 버튼을 눌러 주세요.`);

        setNewItemBySlot((prev) => ({
            ...prev,
            [slot]: '',
        }));
    }, [newItemBySlot, selectedDate, updateCurrentLog]);

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

        if (dailyLogsStorageMode === 'local') {
            const localSyncOk = await syncDailyLogsToLocalFallback(nextLogs);
            setSaving(false);
            if (!localSyncOk) {
                setError('로컬 저장에 실패했어요. 브라우저 저장공간을 확인해 주세요.');
                return;
            }

            syncedLogSignaturesRef.current[selectedDate] = JSON.stringify(currentLog);
            showSaveSuccessPopup(RECORD_SAVE_SUCCESS_MESSAGE_LOCAL);
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
                setDailyLogsStorageMode('local');
                const localSyncOk = await syncDailyLogsToLocalFallback(nextLogs);
                setSaving(false);
                if (!localSyncOk) {
                    setError('로컬 저장에 실패했어요. 브라우저 저장공간을 확인해 주세요.');
                    return;
                }

                syncedLogSignaturesRef.current[selectedDate] = JSON.stringify(currentLog);
                showSaveSuccessPopup(RECORD_SAVE_SUCCESS_MESSAGE_LOCAL);
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

    const renderRecommendedPortions = (slot: MealSlot) => {
        const guide = mealPortionGuideFromPlan(viewedTodayPlan[slot], slot);
        return (
            <div className="recommendedPortions">
                <dl>
                    {guide.items.map((item) => (
                        <div key={item.name}><dt>{item.name}</dt><dd>{item.amount}</dd></div>
                    ))}
                </dl>
                {guide.notes.map((note) => <p key={note}>{note}</p>)}
                <details className="mealDialogDetail">
                    <summary>대체할 수 있는 음식</summary>
                    {guide.items.map((item) => {
                        const substitute = buildSubstituteCandidates(item.name, slot, manualFoodCandidates, foodPersonalization.avoidedIngredients);
                        return substitute.options.length > 0 ? (
                            <div key={item.name} className="mt-3">
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-[var(--ui-muted)]">{substitute.options.slice(0, 5).join(' · ')}</p>
                            </div>
                        ) : null;
                    })}
                </details>
            </div>
        );
    };

    if (loading) {
        return (
            <main className="dietWorkspace space-y-6" aria-busy="true">
                <header className="uiPageHeader">
                    <p>매일의 식사를 가볍게</p>
                    <h1>{openRecordView ? '식단 관리' : '식단 제안'}</h1>
                </header>
                <section className="uiCard p-6" role="status">
                    <p className="text-sm text-gray-600">식단을 준비하고 있어요.</p>
                    <div className="mt-5 h-24 animate-pulse rounded-2xl bg-[#eff2ed]" aria-hidden="true" />
                </section>
            </main>
        );
    }

    if (!hasSupabaseEnv || !supabase) {
        return (
            <main className="dietWorkspace space-y-6">
                <header className="uiPageHeader"><h1>식단을 잠시 불러올 수 없어요</h1></header>
                <section className="uiCard p-6" role="alert">
                    <p className="text-gray-600">잠시 후 다시 방문해 주세요.</p>
                    <button type="button" onClick={() => window.location.reload()} className="uiButton uiButton--primary mt-5">다시 불러오기</button>
                </section>
            </main>
        );
    }

    if (!userId) {
        return (
            <main className="dietWorkspace space-y-6 pb-6">
                <section className="welcomePanel">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ui-surface)] text-[var(--ui-accent)]" aria-hidden="true">
                            {openRecordView ? <ClipboardList size={25} /> : <Leaf size={25} />}
                        </span>
                        {!openRecordView && <NextVisitSummary />}
                    </div>
                    <p className="mt-7 text-sm font-medium text-[var(--ui-accent)]">{openRecordView ? '나를 돌보는 식단 관리' : '나를 위한 식단 제안'}</p>
                    <h1 className="mt-3 max-w-lg text-[2rem] font-semibold leading-[1.35] tracking-tight text-[var(--ui-ink)] sm:text-[2.75rem]">
                        {openRecordView ? <>오늘 먹은 음식을<br />편하게 기록해요.</> : <>오늘은 무엇을<br />먹으면 좋을까요?</>}
                    </h1>
                    <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--ui-muted)]">
                        {openRecordView ? '한 끼씩 기록하고, 나의 식사 흐름을 살펴보세요.' : '내 몸에 맞는 한 끼를 간편하게 확인하세요.'}
                    </p>
                    <Link href="/auth" className="uiButton uiButton--primary mt-7 w-full sm:w-auto">
                        로그인하고 시작하기 <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                </section>
                {!openRecordView && (
                    <details className="recommendationDisclosure">
                        <summary>건강 소식</summary>
                        <HealthNewsFeed />
                    </details>
                )}
                <p className="px-1 text-xs leading-relaxed text-[var(--ui-muted)]">{DISCLAIMER_TEXT}</p>
            </main>
        );
    }

    return (
        <main className={`dietWorkspace space-y-5 pb-8 ${openRecordView ? 'recordWorkspace' : 'recommendationWorkspace'}`}>
            <div className={openRecordView ? undefined : 'recommendationOverview'}>
                <header className="uiPageHeader min-w-0">
                    <p>{profile?.nickname ? `${profile.nickname} 님의 하루 한 끼` : '나를 돌보는 한 끼'}</p>
                    {openRecordView ? <h1>오늘의 식사를 기록해요.</h1> : <h1>나를 위한 식단</h1>}
                    {openRecordView && <p>먹은 음식을 한 끼씩 남겨 보세요.</p>}
                </header>
            {!openRecordView && (
            <section className="recommendationPlan" aria-label="식단 추천">
                <div className="recommendationPlanHeader">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold">{viewedTodayLabel} 식단</h2>
                        <p className="mt-0.5 text-xs text-[var(--ui-muted)]">{viewedTodayDateLabel}</p>
                    </div>
                    <div className="recommendationDateControls">
                        <button type="button" onClick={() => setTodayPlanOffset((prev) => Math.max(-1, prev - 1))} disabled={todayPlanOffset <= -1} className="uiIconButton" aria-label="이전 날짜 식단 보기"><ChevronLeft size={19} /></button>
                        <button type="button" onClick={() => setTodayPlanOffset((prev) => Math.min(1, prev + 1))} disabled={todayPlanOffset >= 1} className="uiIconButton" aria-label="다음 날짜 식단 보기"><ChevronRight size={19} /></button>
                    </div>
                </div>
                <p className="recommendationPlanHint">끼니를 선택하면 식단이 열려요.</p>
                <RecommendedMeals
                    plan={viewedTodayPlan}
                    dateLabel={viewedTodayDateLabel}
                    medicationsBySlot={{
                        breakfast: medicationSchedulesByTiming.breakfast.map((item) => item.name),
                        lunch: medicationSchedulesByTiming.lunch.map((item) => item.name),
                        dinner: medicationSchedulesByTiming.dinner.map((item) => item.name),
                    }}
                    renderPortions={renderRecommendedPortions}
                />
            </section>
            )}
                {!openRecordView && <NextVisitSummary />}
            </div>
            {!openRecordView && (
                <details className="recommendationDisclosure">
                    <summary className="cursor-pointer py-4 text-sm font-semibold">식단 설정 · 추천 이유</summary>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm leading-relaxed text-[var(--ui-muted)]">{describeFoodPersonalization(foodPersonalization).join(' · ') || '먹기 편한 음식과 피할 재료를 알려 주세요.'}</p>
                        <Link href="/profile#food-personalization" className="uiButton uiButton--secondary uiButton--small">맞춤 설정</Link>
                    </div>
                <details className="mt-3 rounded-xl border border-gray-200 px-3 dark:border-gray-700">
                    <summary className="cursor-pointer py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">체중 관리 설정</summary>
                    <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">의료진과 체중감량을 정한 경우에만 선택해 주세요. 식사가 불편할 때는 적용하지 않아요.</p>
                    <div className="flex items-center justify-between gap-3 pb-3">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <p className="truncate text-sm font-semibold text-blue-900 dark:text-blue-100">다이어트 체크</p>
                            <button
                                type="button"
                                onClick={() => setShowDietModeInfoModal(true)}
                                className="uiIconButton"
                                aria-label="다이어트 체크 안내 열기"
                            >
                                <CircleHelp className="h-4 w-4" />
                            </button>
                        </div>
                        <input
                            type="checkbox"
                            checked={todayDietModeChecked}
                            onChange={(event) => setTodayDietMode(event.target.checked)}
                            className="h-5 w-5 accent-blue-600"
                            aria-label="다이어트 체크"
                            disabled={!isViewingToday || foodPersonalization.symptoms.length > 0}
                        />
                    </div>
                    {!isViewingToday && (
                        <p className="mt-1.5 text-xs text-blue-800 dark:text-blue-200">
                            다이어트 체크 변경은 오늘 식단에서만 가능해요.
                        </p>
                    )}
                </details>

                <details className="mt-3 rounded-xl border border-gray-200 px-3 pb-3 dark:border-gray-700">
                    <summary className="cursor-pointer py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">간식과 음료 안내</summary>
                    <div className="snackSuggestion">
                        <p className="font-semibold">{viewedTodayPlan.snack.main || '간식 구성 확인 필요'}</p>
                        <p className="text-sm text-[var(--ui-muted)]">{[...viewedTodayPlan.snack.sides, viewedTodayPlan.snack.soup].filter(Boolean).join(' · ')}</p>
                        <details className="mealDialogDetail">
                            <summary>간식 준비 방법과 양</summary>
                            <ol className="list-decimal space-y-2 pl-5 text-sm">
                                {uniqueRecipeSteps(viewedTodayPlan.snack.recipeSteps).map((step) => <li key={step}>{step}</li>)}
                            </ol>
                            {renderRecommendedPortions('snack')}
                        </details>
                    </div>
                    {hasRenalDietRestrictions(userDietContext) ? <p className="text-sm leading-relaxed text-[var(--ui-muted)]">간식과 음료 종류·양은 의료진과 정한 식사·수분 지침을 따라 주세요.</p> : <>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- 간식 권장 시간: {snackCoffeeRecommendedTime.snack}</p>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">- {timingGuide.snack}</p>
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        {dailyCoffeeRecommendations.length > 0 && (
                            <div>
                                <p className="font-semibold text-gray-900 dark:text-gray-100">오늘 커피(원할 때만)</p>
                                {dailyCoffeeRecommendations.map((item) => (
                                    <p key={`coffee-${item.name}`} className="mt-1">
                                        - <span className="font-semibold">{item.name}</span>: {item.reason}
                                    </p>
                                ))}
                            </div>
                        )}
                        {dailyTeaRecommendations.length > 0 && (
                            <div className="mt-2">
                                <p className="font-semibold text-gray-900 dark:text-gray-100">오늘 차(원할 때만)</p>
                                {dailyTeaRecommendations.map((item) => (
                                    <p key={`tea-${item.name}`} className="mt-1">
                                        - <span className="font-semibold">{item.name}</span>: {item.reason}
                                    </p>
                                ))}
                            </div>
                        )}
                        <p className="mt-2 font-semibold text-gray-900 dark:text-gray-100">음료 가이드(필수 아님)</p>
                        <p className="mt-1">- 커피(원할 때만) 권장 시간: {snackCoffeeRecommendedTime.coffee}</p>
                        <p className="mt-1">- 차(원할 때만) 권장 시간: {snackCoffeeRecommendedTime.tea}</p>
                        <p className="mt-1">- {timingGuide.coffee}</p>
                        <p className="mt-1">- {timingGuide.tea}</p>
                        <p className="mt-1">- {beverageCaution}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setOpenRecipeSlot('coffee')}
                            className="uiButton uiButton--secondary uiButton--small"
                        >
                            커피/차 가이드 보기
                        </button>
                    </div>
                    </>}
                </details>

                <details className="mt-3 rounded-xl border border-gray-200 px-3 pb-3 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
                    <summary className="cursor-pointer py-3 font-semibold">이 식단을 추천한 이유</summary>
                    <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                        암 종류/치료 단계/복용 정보를 기준으로 실제 반영된 항목이에요.
                    </p>
                    <div className="mt-2 space-y-1">
                        {viewedTodayNotes.length > 0 ? (
                            viewedTodayNotes.map((note) => <p key={note}>- {note}</p>)
                        ) : (
                            <p>- 개인 조건이 없거나 매칭되지 않아 월간 재료와 조리법의 다양성을 고려해 구성했어요.</p>
                        )}
                    </div>
                </details>
                </details>
            )}

            {showDietModeInfoModal && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-3 sm:p-4"
                    onClick={() => setShowDietModeInfoModal(false)}
                >
                    <section
                        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl max-h-[70dvh] overflow-y-auto overscroll-contain dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog" aria-modal="true" aria-label="식단 상세 안내" tabIndex={-1}
                    >
                        <div className="galaxySafeHeader">
                            <h2 className="galaxySafeHeader__main text-lg font-semibold text-gray-900 dark:text-gray-100">
                                다이어트 체크 안내
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowDietModeInfoModal(false)}
                                className="uiButton uiButton--secondary uiButton--small"
                            >
                                닫기
                            </button>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-200">
                            <p>체크 시 식단을 체중감량형(단백질 유지·탄수화물 조절)으로 바꿔요.</p>
                            <p>
                                최근 기록 자동 반영:{' '}
                                {adaptiveTodayPreferences.length > 0
                                    ? adaptiveTodayPreferences.map((item) => preferenceLabel(item)).join(', ')
                                    : '단백질 강화, 채소 듬뿍'}
                            </p>
                        </div>
                    </section>
                </div>
            )}

            {openRecipeContent && openRecipeSlot && (
                <div
                    className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-3 sm:p-4"
                    onClick={() => setOpenRecipeSlot(null)}
                >
                    <section
                        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl max-h-[70dvh] overflow-y-auto overscroll-contain dark:border-gray-800 dark:bg-gray-900"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog" aria-modal="true" aria-label="식단 상세 안내" tabIndex={-1}
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
                                className="uiButton uiButton--secondary uiButton--small"
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
                    className={openRecordView ? 'sr-only' : 'uiCard p-4 text-[var(--ui-accent)]'}
                >
                    <p className="text-sm font-semibold">{message}</p>
                </section>
            )}

            {saveSuccessPopupOpen && (
                <div className="fixed inset-x-0 bottom-24 z-[60] px-4" role="status">
                    <section className="mx-auto w-full max-w-lg rounded-2xl bg-[#232d29] p-4 text-white shadow-xl">
                        <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 text-sm font-semibold">{saveSuccessPopupMessage}</p>
                            <button type="button" onClick={closeSaveSuccessPopup} className="uiButton uiButton--secondary uiButton--small">
                                닫기
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {!openRecordView && (
                <section className="recommendationDisclosure recommendationAdjustment">
                    <div className="galaxySafeHeader">
                        <h2 className="galaxySafeHeader__main galaxySafeText text-base font-semibold text-[var(--ui-ink)]">
                            오늘 식단 바꾸기
                        </h2>
                        <button
                            type="button"
                            aria-expanded={showTodayPreferencePanel}
                            onClick={() => setShowTodayPreferencePanel((prev) => !prev)}
                            className="uiButton uiButton--ghost uiButton--small"
                        >
                            {showTodayPreferencePanel ? '접기' : '변경'}
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
                                            aria-pressed={selected}
                                            onClick={() => toggleDraftTodayPreference(option.key)}
                                            className={`uiButton uiButton--small ${selected ? 'uiButton--primary' : recommended ? 'uiButton--secondary' : 'uiButton--ghost'}`}
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
                                    className="uiButton uiButton--secondary"
                                >
                                    추천 적용
                                </button>
                                <button
                                    type="button"
                                    onClick={requestTodayProposal}
                                    className="uiButton uiButton--secondary"
                                >
                                    변경 내용 보기
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmTodayPlanChange}
                                    className="uiButton uiButton--primary"
                                >
                                    이대로 식단 바꾸기
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
                    <section id="today-record-section" className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {recordDateKeys.map((key) => <button key={key} type="button" aria-pressed={key === selectedDate} onClick={() => selectRecordDate(key)} className={`uiButton uiButton--small ${key === selectedDate ? 'uiButton--primary' : 'uiButton--ghost'}`}>{key === todayKey ? '오늘' : key === offsetDateKey(todayKey, -1) ? '어제' : formatDateLabel(key)}</button>)}
                                <input id="record-date" type="date" value={selectedDate} max={todayKey} onChange={(event) => selectRecordDate(event.target.value)} aria-label="기록 날짜 선택" className="min-h-11 min-w-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 text-sm text-[var(--ui-ink)]" />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <Link href="/diet/calendar" className="uiButton uiButton--ghost uiButton--small">달력</Link>
                                <Link href="/diet/report" className="uiButton uiButton--ghost uiButton--small">리포트</Link>
                            </div>
                        </div>
                    </section>

                    {showRecordPlanModal && (
                        <div
                            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-3 sm:p-4"
                            onClick={() => {
                                setShowRecordPlanModal(false);
                                setOpenRecordPortionSlot(null);
                            }}
                        >
                            <section
                                className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white p-5 shadow-xl max-h-[70dvh] overflow-y-auto overscroll-contain dark:border-gray-800 dark:bg-gray-900"
                                onClick={(event) => event.stopPropagation()}
                                role="dialog" aria-modal="true" aria-label="기록일 식단 보기" tabIndex={-1}
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
                                        className="uiButton uiButton--secondary uiButton--small"
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
                                                <p className="mt-1 text-sm text-gray-800 dark:text-gray-100">{meal.summary || '식사 구성 확인 필요'}</p>
                                                {slot !== 'snack' && (
                                                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">반찬: {meal.sides.join(', ')}</p>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenRecordPortionSlot((prev) => (prev === slot ? null : slot))}
                                                    className="uiButton uiButton--secondary mt-3 w-full"
                                                >
                                                    식사량 참고
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
                                                    {meal.nutritionUnavailable ? '상세 영양량은 계산 전이에요.' : `기본 구성 참고: 탄수화물 ${meal.nutrient.carb}% · 단백질 ${meal.nutrient.protein}% · 지방 ${meal.nutrient.fat}%`}
                                                </p>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        </div>
                    )}

                    <section className="uiCard p-5 sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div><h2 className="text-xl font-semibold">무엇을 드셨나요?</h2><p className="mt-1 text-sm text-[var(--ui-muted)]">{selectedDateLabel} · 식사 시간을 고르고 음식을 추가해요.</p></div>
                            <button type="button" onClick={() => { setOpenRecordPortionSlot(null); setShowRecordPlanModal(true); }} className="uiButton uiButton--ghost uiButton--small">추천 식단 보기</button>
                        </div>
                        <div className="uiSegmented uiMealTabs mt-5" role="group" aria-label="기록할 식사 선택">
                            {SLOT_ORDER.map((slot) => <button key={slot} type="button" aria-pressed={activeRecordSlot === slot} onClick={() => changeRecordSelection(selectedDate, slot)}><span>{mealTypeLabel(slot)}</span>{selectedLog.meals[slot].some((item) => item.eaten) && <><Check size={13} className="hidden sm:block" aria-hidden="true" /><span className="sr-only">기록 있음</span></>}</button>)}
                        </div>

                        <form onSubmit={saveRecord} className="mt-4 space-y-4">
                            <div>
                                {[activeRecordSlot].map((slot) => {
                                    const items = selectedLog.meals[slot];
                                    const recordedCount = items.filter((item) => item.eaten).length;

                                    return (
                                        <article
                                            key={slot}
                                            className="space-y-3"
                                        >
                                            <div className="flex items-stretch gap-2">
                                                <input
                                                    type="search"
                                                    aria-label={`${mealTypeLabel(slot)} 먹은 음식 검색`}
                                                    aria-describedby={`food-entry-help-${slot}`}
                                                    aria-controls={newItemBySlot[slot].trim() ? `food-results-${slot}` : undefined}
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
                                                        addMealItem(slot);
                                                    }}
                                                    placeholder="먹은 음식 검색"
                                                    className="min-h-13 min-w-0 flex-1 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-4 py-3 text-base text-[var(--ui-ink)] outline-none focus:border-[var(--ui-accent)] focus:ring-2 focus:ring-[var(--ui-accent-soft)]"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => addMealItem(slot)}
                                                    disabled={!newItemBySlot[slot].trim()}
                                                    className="uiButton uiButton--primary shrink-0"
                                                >
                                                    <Plus size={17} aria-hidden="true" /> 추가
                                                </button>
                                            </div>
                                            {newItemBySlot[slot].trim().length > 0 && (
                                                <div id={`food-results-${slot}`} className="mt-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100" aria-live="polite">
                                                        {manualMatchCandidatesBySlot[slot].some((candidate) => candidate.matchType === 'exact' || candidate.matchType === 'alias')
                                                            ? '찾은 음식과 비슷한 메뉴'
                                                            : '찾는 음식이 없으면 비슷한 메뉴를 골라 보세요'}
                                                    </p>
                                                    {manualMatchCandidatesBySlot[slot].length > 0 ? (
                                                        <div className="mt-2 grid max-h-72 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
                                                            {manualMatchCandidatesBySlot[slot].map((candidate) => (
                                                                <button
                                                                    key={`${slot}-${candidate.name}`}
                                                                    type="button"
                                                                    onClick={() => addMealItem(slot, candidate.name)}
                                                                    className="flex min-h-14 w-full flex-col justify-center gap-1 rounded-xl border border-[var(--ui-border)] px-3 py-3 text-left transition hover:bg-[var(--ui-accent-soft)]"
                                                                >
                                                                    <span className="block break-words text-sm font-semibold text-gray-900 dark:text-gray-100">{candidate.name}</span>
                                                                    <span className="block text-xs text-gray-600 dark:text-gray-300">
                                                                        {candidate.reason}
                                                                        {matchesAvoidedIngredient(candidate.name, foodPersonalization.avoidedIngredients) ? ' · 피할 재료 확인' : ''}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                                            음식 이름이나 재료로 다시 찾아 보세요. 입력한 이름 그대로 추가할 수도 있어요.
                                                        </p>
                                                    )}
                                                    <p className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)] dark:text-gray-400">비슷한 메뉴는 영양성분이 같다는 뜻이 아니에요. 실제 먹은 음식을 골라 주세요.</p>
                                                </div>
                                            )}
                                            <p id={`food-entry-help-${slot}`} className="mt-2 text-xs leading-relaxed text-[var(--ui-muted)] dark:text-gray-400">
                                                예: 버섯죽, 두부조림 · 검색에 없어도 입력한 이름으로 추가할 수 있어요.
                                            </p>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                    {mealTypeLabel(slot)}
                                                </p>
                                                <span className="uiBadge">
                                                    {recordedCount}개 먹었어요
                                                </span>
                                            </div>
                                            <p className="text-sm leading-relaxed text-[var(--ui-muted)]">추천 메뉴가 미리 준비되어 있어요. 먹은 음식에 표시해 주세요.</p>
                                            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`${mealTypeLabel(slot)} 전체 메뉴 선택`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'eaten')}
                                                    className="uiButton uiButton--secondary uiButton--small"
                                                >
                                                    모두 먹음
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'not_eaten')}
                                                    className="uiButton uiButton--ghost uiButton--small"
                                                >
                                                    모두 안 먹음
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMealSlotStatus(slot, 'reset')}
                                                    className="uiButton uiButton--ghost uiButton--small"
                                                >
                                                    초기화
                                                </button>
                                            </div>

                                            {items.length === 0 && <div className="uiEmptyState py-7"><Search size={24} className="mx-auto mb-3 text-[var(--ui-accent)]" aria-hidden="true" /><p className="text-sm text-[var(--ui-muted)]">먹은 음식을 검색해서 추가해 주세요.</p></div>}
                                            <div className="mt-3 space-y-2">
                                                {items.map((item) => {
                                                    const isSubstitutePanelOpen =
                                                        openSubstituteTarget?.slot === slot &&
                                                        openSubstituteTarget.itemId === item.id;
                                                    const substituteCandidates = isSubstitutePanelOpen
                                                        ? buildSubstituteCandidates(item.name, slot, manualFoodCandidates, foodPersonalization.avoidedIngredients)
                                                        : null;
                                                    const [displayFoodNameRaw, ...displayAmountParts] = item.name.split(' · ');
                                                    const displayFoodName = displayFoodNameRaw.trim();
                                                    const displayAmount = displayAmountParts.join(' · ').trim();

                                                    return (
                                                        <div key={item.id} className="space-y-1.5">
                                                            <div className="space-y-3 rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:space-y-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleMealSubstitutePanel(slot, item.id)}
                                                                    aria-expanded={isSubstitutePanelOpen}
                                                                    aria-label={`${displayFoodName} 대신 먹은 음식 고르기`}
                                                                    className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 text-left leading-snug text-[var(--ui-ink)]"
                                                                >
                                                                    <span className="block break-words text-base font-semibold">{displayFoodName}</span>
                                                                    {displayAmount && <span className="block break-words text-sm text-[var(--ui-muted)]">{displayAmount}</span>}
                                                                </button>
                                                                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0" role="group" aria-label={`${displayFoodName} 식사 여부`}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleMealItem(slot, item.id)}
                                                                        aria-pressed={item.eaten}
                                                                        aria-label={`${displayFoodName} 먹었어요`}
                                                                        className="mealStatusButton mealStatusButton--eaten"
                                                                    >
                                                                        <Check size={17} aria-hidden="true" className={item.eaten ? undefined : 'invisible'} />
                                                                        먹었어요
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => markMealAsNotEaten(slot, item.id)}
                                                                        aria-pressed={Boolean(item.notEaten)}
                                                                        aria-label={`${displayFoodName} 안 먹음`}
                                                                        className="mealStatusButton mealStatusButton--skipped"
                                                                    >
                                                                        <Minus size={17} aria-hidden="true" className={item.notEaten ? undefined : 'invisible'} />
                                                                        안 먹음
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {isSubstitutePanelOpen && (
                                                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 dark:border-gray-700 dark:bg-gray-950/40">
                                                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                                            대체 가능한 음식
                                                                        </p>
                                                                        <span className="text-xs text-[var(--ui-muted)] dark:text-gray-400">
                                                                            {substituteCandidates?.hint}
                                                                        </span>
                                                                    </div>

                                                                    {substituteCandidates && substituteCandidates.options.length > 0 ? (
                                                                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
                                                                                    className="uiButton uiButton--secondary uiButton--small w-full whitespace-normal"
                                                                                >
                                                                                    {candidate}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="mt-1 text-xs text-[var(--ui-muted)] dark:text-gray-400">
                                                                            대체 후보를 찾지 못했어요.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                        </article>
                                    );
                                })}
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="uiButton uiButton--primary w-full"
                            >
                                {saving ? '저장 중...' : '식사 기록 저장하기'}
                            </button>
                            <p className="text-center text-xs text-[var(--ui-muted)]">{selectedDateLabel}의 모든 식사 기록을 함께 저장해요.</p>
                        </form>

                        <details className="mt-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                            <summary className="cursor-pointer py-2 text-sm font-semibold">식사 기록 살펴보기</summary>
                            <button type="button" aria-expanded={showNutrients} onClick={() => setShowNutrients((prev) => !prev)} className="uiButton uiButton--ghost uiButton--small">{showNutrients ? '영양 참고 닫기' : '영양 참고 정보'}</button>
                        {showNutrients && (
                            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-950/40 dark:text-gray-300">
                                <p>아래 비율은 추천 식단의 기본 구성 비율이에요. 실제 먹은 음식의 영양 분석값은 아니에요.</p>
                                {SLOT_ORDER.map((slot) => (
                                    <p key={slot} className="mt-2">{mealTypeLabel(slot)}: {selectedPlan[slot].nutritionUnavailable
                                        ? '상세 영양량은 계산 전이에요.'
                                        : `탄수화물 ${selectedPlan[slot].nutrient.carb}% · 단백질 ${selectedPlan[slot].nutrient.protein}% · 지방 ${selectedPlan[slot].nutrient.fat}%`}</p>
                                ))}
                            </div>
                        )}


                            <p className="mt-2 text-xs text-[var(--ui-muted)]">메뉴 이름으로 살펴본 참고 정보예요.</p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                        </details>
                    </section>

                    <details className="uiCard px-5 pb-4">
                        <summary className="cursor-pointer py-4 text-sm font-semibold">복용 약 체크</summary>
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
                                                aria-pressed={taken}
                                                className={`uiButton uiButton--small ${taken ? 'uiButton--primary' : 'uiButton--secondary'}`}
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
                                className="uiButton uiButton--secondary w-full"
                            >
                                {saving ? '저장 중...' : '저장하기'}
                            </button>
                        </div>
                    </details>
                </>
            )}

            <details className="recommendationDisclosure">
                <summary className="cursor-pointer py-4 text-sm font-semibold">식사 도움말</summary>
            <details className="rounded-xl border border-gray-200 bg-white px-5 pb-4 dark:border-gray-800 dark:bg-gray-900">
                <summary className="cursor-pointer py-4 text-base font-semibold text-gray-900 dark:text-gray-100">치료 중 음식 선택 도움말</summary>
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
            </details>

            {openRecordView && (
                <details className="rounded-xl border border-gray-200 bg-white px-5 pb-4 dark:border-gray-800 dark:bg-gray-900">
                    <summary className="cursor-pointer py-4 text-base font-semibold text-gray-900 dark:text-gray-100">식사 기록 돌아보기</summary>
                    <p className="text-sm text-gray-600 dark:text-gray-300">추천 메뉴와 기록의 유사도를 참고하는 점수예요. 건강 상태를 판단하는 점수는 아니에요.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-[var(--ui-muted)] dark:text-gray-400">오늘</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{todayScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-[var(--ui-muted)] dark:text-gray-400">최근 7일</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{weeklyScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-[var(--ui-muted)] dark:text-gray-400">이번 달</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{monthlyScore}점</p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                            <p className="text-xs text-[var(--ui-muted)] dark:text-gray-400">전체 평균</p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{totalScore}점</p>
                        </div>
                        {/* 예상 순위 카드는 현재 비활성화 상태입니다.
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
                            <p className="text-xs text-blue-700 dark:text-blue-300">예상 순위</p>
                            <p className="mt-1 text-xl font-bold text-blue-800 dark:text-blue-200">약 {expectedRank}등 (상위 {expectedPercentile}%)</p>
                        </div>
                        */}
                    </div>
                </details>
            )}

            <details className="rounded-xl border border-gray-200 bg-white px-5 pb-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
                <summary className="cursor-pointer py-4 text-base font-semibold">내 정보가 어떻게 반영됐나요?</summary>
                <div className="mt-2 space-y-1">
                    {personalizationSummary.map((item) => (
                        <p key={item}>- {item}</p>
                    ))}
                </div>
            </details>

            </details>
            {!openRecordView && (
                <details className="recommendationDisclosure">
                    <summary>오늘의 말씀</summary>
                    <DailyVerse />
                </details>
            )}
            {!openRecordView && (
                <details className="recommendationDisclosure">
                    <summary>건강 소식</summary>
                    <HealthNewsFeed />
                </details>
            )}
            <p className="dietDisclaimer">{DISCLAIMER_TEXT}</p>
        </main>
    );
}
