export type StageType =
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

export type PreferenceType =
    | 'spicy'
    | 'sweet'
    | 'meat'
    | 'beef'
    | 'pork'
    | 'chicken'
    | 'duck'
    | 'pizza'
    | 'fried_chicken'
    | 'sandwich'
    | 'healthy'
    | 'fish'
    | 'sashimi'
    | 'sushi'
    | 'cool_food'
    | 'warm_food'
    | 'soft_food'
    | 'soupy'
    | 'high_protein'
    | 'vegetable'
    | 'bland'
    | 'appetite_boost'
    | 'digestive'
    | 'low_salt'
    | 'noodle'
    | 'weight_loss';

export const PREFERENCE_OPTIONS: Array<{ key: PreferenceType; label: string; guide: string }> = [
    { key: 'spicy', label: '매운맛', guide: '자극은 낮추고 매콤한 느낌은 살려서 조정해요.' },
    { key: 'sweet', label: '단맛', guide: '당 부담이 적은 간식으로 바꿔 제안해요.' },
    { key: 'meat', label: '고기', guide: '기름이 적은 고기 메뉴 위주로 반영해요.' },
    { key: 'beef', label: '소고기', guide: '소고기 중심으로 1끼를 반영하고 나머지 끼니를 가볍게 조정해요.' },
    { key: 'pork', label: '돼지고기', guide: '돼지고기(안심 등 저지방 부위) 중심으로 1끼를 반영해요.' },
    { key: 'chicken', label: '닭고기', guide: '닭고기 중심 한 끼를 반영하고 채소·수분을 함께 맞춰요.' },
    { key: 'duck', label: '오리고기', guide: '오리고기 메뉴를 반영하되 지방·염분 부담을 낮춰요.' },
    { key: 'pizza', label: '피자', guide: '채소 중심의 가벼운 피자형 메뉴로 반영해요.' },
    { key: 'fried_chicken', label: '치킨', guide: '치킨 1~2조각을 한 끼에 반영하고 다른 끼니 영양을 재분배해요.' },
    { key: 'sandwich', label: '샌드위치', guide: '샌드위치 1끼를 반영하고 다른 끼니를 단백질·채소 중심으로 맞춰요.' },
    { key: 'healthy', label: '건강식', guide: '잡곡밥, 채소, 저염 반찬 중심으로 맞춰요.' },
    { key: 'fish', label: '생선', guide: '구이·찜 같은 익힌 생선 메뉴를 늘려요.' },
    { key: 'sashimi', label: '회 느낌', guide: '생식 대신 안전한 숙회/익힘 메뉴로 대체해요.' },
    { key: 'sushi', label: '초밥 느낌', guide: '저염·익힘 재료 중심의 초밥형 메뉴를 반영해요.' },
    { key: 'cool_food', label: '시원한 음식', guide: '속을 자극하지 않는 시원한 메뉴를 더해요.' },
    { key: 'warm_food', label: '따뜻한 음식', guide: '몸을 편하게 하는 따뜻한 식사로 맞춰요.' },
    { key: 'soft_food', label: '부드러운 음식', guide: '씹기 편한 부드러운 메뉴 중심으로 조정해요.' },
    { key: 'soupy', label: '국물 음식', guide: '저염 국·수프를 더 자주 반영해요.' },
    { key: 'high_protein', label: '단백질 강화', guide: '닭·생선·두부·달걀 반찬 비중을 높여요.' },
    { key: 'vegetable', label: '채소 듬뿍', guide: '채소 반찬 종류를 더 다양하게 넣어요.' },
    { key: 'bland', label: '담백한 맛', guide: '강한 양념을 줄이고 담백한 조리로 맞춰요.' },
    { key: 'appetite_boost', label: '입맛 살리기', guide: '과하지 않은 새콤한 반찬을 소량 반영해요.' },
    { key: 'digestive', label: '소화 편한 음식', guide: '속이 편한 메뉴 위주로 조정해요.' },
    { key: 'low_salt', label: '저염식', guide: '염분이 높은 반찬을 줄이고 싱겁게 맞춰요.' },
    { key: 'noodle', label: '면 요리', guide: '자극이 적은 면 요리를 가끔 반영해요.' },
    { key: 'weight_loss', label: '체중감량(다이어트)', guide: '치료 중 영양 상태와 의료진의 체중 조절 목표를 먼저 확인해요.' },
];

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealNutrient = {
    carb: number;
    protein: number;
    fat: number;
};

export type MealSuggestion = {
    summary: string;
    riceType: string;
    main: string;
    soup: string;
    sides: string[];
    cautionFlour: string;
    nutrient: MealNutrient;
    nutritionUnavailable?: boolean;
    recipeName: string;
    recipeSteps: string[];
};

export type DayPlan = {
    date: string;
    breakfast: MealSuggestion;
    lunch: MealSuggestion;
    dinner: MealSuggestion;
    snack: MealSuggestion;
};

export type UserMedicationSchedule = {
    name: string;
    category?: string;
    timing: 'breakfast' | 'lunch' | 'dinner';
};

export type UserAdditionalCondition = {
    name: string;
    code?: string;
    category?: string;
};

export type RecentDietPattern = {
    analyzedDays: number;
    skippedMealDays: number;
    lowProteinDays: number;
    lowVegetableDays: number;
    highFlourSugarDays: number;
    highSodiumDays: number;
    spicyHeavyDays: number;
};

export type UserDietContext = {
    age?: number;
    sex?: 'unknown' | 'female' | 'male' | 'other';
    heightCm?: number;
    weightKg?: number;
    ethnicity?: string;
    cancerType?: string;
    cancerStage?: string;
    activeStageType?: StageType;
    activeStageLabel?: string;
    activeStageOrder?: number;
    activeStageStatus?: 'planned' | 'active' | 'completed';
    medicationSchedules?: UserMedicationSchedule[];
    additionalConditions?: UserAdditionalCondition[];
    recentDietSignals?: string[];
    recentDietPattern?: RecentDietPattern;
};

export type DinnerCarbSafetyContext = {
    bmi: number | null;
    lowAppetiteRisk: boolean;
    weightLossPreference: boolean;
};

export type CancerProfileMatch = {
    profileLabel: string;
    matchedKeyword: string;
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
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

const RICE_TYPES = [
    '현미밥',
    '잡곡밥',
    '귀리밥',
    '보리밥',
    '흑미밥',
    '기장밥',
    '수수밥',
    '렌틸콩밥',
    '퀴노아잡곡밥',
    '곤드레밥',
];
const PROTEIN_MAINS = [
    '닭가슴살구이',
    '연어구이',
    '두부조림',
    '달걀찜',
    '흰살생선찜',
    '콩불고기',
    '닭안심버섯찜',
    '두부달걀오믈렛',
    '고등어찜(저염)',
    '연두부덮밥',
];
const MEAT_MAINS = ['닭안심구이', '저지방 소고기볶음', '돼지안심수육', '닭안심버섯찜', '소고기채소찜'];
const SOUPS = [
    '맑은채소국',
    '저염 된장국',
    '단호박수프',
    '들깨버섯수프',
    '두부맑은국',
    '미역국(저염)',
    '양배추수프',
    '브로콜리수프',
    '당근수프',
    '애호박맑은국',
    '연두부국',
    '저염 채소수프',
    '토마토채소수프',
    '감자양파수프',
    '양송이버섯수프',
    '무맑은국',
    '콩나물맑은국',
    '닭안심채소수프',
    '배추맑은국',
    '버섯맑은국',
];
const SIDES = [
    '브로콜리찜',
    '버섯볶음',
    '시금치나물',
    '오이무침',
    '당근볶음',
    '애호박볶음',
    '양배추볶음',
    '구운채소',
    '저염 나물',
    '저염 버섯볶음',
    '담백한 두부무침',
    '저염 채소무침',
    '데친브로콜리',
    '해초무침',
    '나물모둠',
    '당근나물',
    '오이채무침',
    '애호박무침',
    '가지구이',
    '가지나물',
    '숙주나물',
    '콩나물무침',
    '무나물',
    '배추찜',
    '양배추찜',
    '토마토샐러드',
    '그린샐러드',
    '연근조림(저염)',
    '우엉조림(저염)',
    '단호박찜',
    '파프리카구이',
    '청경채볶음',
    '미나리무침',
    '새송이버섯구이',
];
const SNACK_FRUITS = ['사과 조각', '바나나 반 개', '배 조각', '키위', '딸기', '베리류', '귤', '복숭아 조각'];
const BREAKFAST_MAIN_VARIANTS = [
    '달걀두부찜',
    '달걀찜',
    '두부조림',
    '닭안심찜',
    '닭가슴살구이',
    '연두부덮밥',
    '흰살생선찜',
    '부드러운 죽',
    '닭가슴살채소찜',
    '두부버섯조림',
    '달걀채소찜',
    '연어구이(저염)',
    '고등어찜(저염)',
    '귀리닭죽',
    '두부달걀오믈렛',
    '흰살생선두부찜',
    '닭안심버섯찜',
    '연두부달걀찜',
    '두부채소볶음(저염)',
    '달걀두부덮밥',
    '두부채소죽',
    '단호박달걀찜',
    '닭안심채소죽',
    '연두부버섯찜',
    '고구마두부죽',
    '흰살생선죽',
    '콩나물두부국밥(저염)',
    '채소달걀죽',
    '버섯달걀찜',
    '단호박두부찜',
];
const LUNCH_MAIN_VARIANTS = [
    '연어구이',
    '닭가슴살구이',
    '두부조림',
    '닭안심찜',
    '흰살생선찜',
    '연두부덮밥',
    '고등어구이',
    '두부스테이크',
    '닭가슴살채소볶음(저염)',
    '두부버섯덮밥(저염)',
    '연어채소찜',
    '흰살생선구이(저염)',
    '닭안심버섯찜',
    '두부달걀덮밥',
    '고등어찜(저염)',
    '귀리닭죽',
    '채소두부볶음(저염)',
    '연두부달걀찜',
    '닭가슴살오븐구이',
    '버섯두부스테이크',
    '두부덮밥',
    '대구살채소찜',
    '닭안심수육',
    '소고기채소찜',
    '콩불고기덮밥(저염)',
    '달걀채소덮밥',
    '연어두부샐러드',
    '병아리콩두부볼',
    '닭안심채소죽',
    '버섯달걀찜',
];
const DINNER_MAIN_VARIANTS = [
    '닭가슴살구이',
    '흰살생선찜',
    '두부조림',
    '연어구이',
    '닭안심찜',
    '부드러운 죽',
    '달걀두부찜',
    '고등어구이',
    '두부버섯조림',
    '닭가슴살채소찜',
    '연어채소찜',
    '흰살생선구이(저염)',
    '연두부덮밥',
    '두부달걀오믈렛',
    '고등어찜(저염)',
    '닭안심버섯찜',
    '귀리닭죽',
    '채소두부볶음(저염)',
    '연두부달걀찜',
    '버섯두부스테이크',
    '대구살채소찜',
    '닭안심수육',
    '두부채소죽',
    '단호박두부찜',
    '연어두부찜',
    '버섯달걀찜',
    '콩불고기(저염)',
    '닭안심채소죽',
    '흰살생선죽',
    '소고기채소찜',
];
const SNACK_MAIN_VARIANTS = [
    '무가당 요거트',
    '그릭요거트',
    '무가당 두유',
    '찐고구마',
    '사과 조각',
    '바나나 반 개',
    '아몬드 소량',
    '베리류',
    '키위',
    '배 조각',
    '딸기',
    '호두 소량',
    '제철 과일',
    '무가당 요거트(저당)',
    '찐단호박',
    '리코타치즈 소량',
    '오트밀요거트',
    '삶은 달걀 1개',
    '병아리콩 소량',
    '토마토 조각',
];
const SNACK_SIDE_VARIANTS = [
    '사과 조각',
    '바나나 반 개',
    '베리류',
    '키위',
    '딸기',
    '배 조각',
    '아몬드 소량',
    '호두 소량',
    '제철 과일',
    '고구마 소량',
    '귤',
    '복숭아 조각',
    '토마토 조각',
    '찐단호박 소량',
    '오이 스틱',
    '리코타치즈 소량',
    '블루베리',
];
const SNACK_HYDRATION_VARIANTS = ['물', '따뜻한 물', '보리차', '루이보스차', '연한 생강차'];
const MEAL_SIMILARITY_THRESHOLD = 0.72;
const MEAL_REGEN_MAX_ATTEMPTS = 5;

type MealTemplate = {
    main: string;
    soup: string;
    sides: [string, string, string];
};

type SnackTemplate = {
    main: string;
    side: string;
    hydration: string;
};

const MEAL_TEMPLATES: Record<Exclude<MealSlot, 'snack'>, MealTemplate[]> = {
    breakfast: [
        { main: '달걀두부찜', soup: '두부맑은국', sides: ['브로콜리찜', '새송이버섯구이', '당근볶음'] },
        { main: '두부채소죽', soup: '단호박수프', sides: ['애호박볶음', '숙주나물', '토마토샐러드'] },
        { main: '흰살생선죽', soup: '무맑은국', sides: ['배추찜', '버섯볶음', '오이채무침'] },
        { main: '연두부버섯찜', soup: '들깨버섯수프', sides: ['시금치나물', '파프리카구이', '양배추찜'] },
        { main: '닭안심채소죽', soup: '닭안심채소수프', sides: ['가지나물', '콩나물무침', '구운채소'] },
        { main: '단호박달걀찜', soup: '감자양파수프', sides: ['청경채볶음', '브로콜리찜', '오이무침'] },
        { main: '고구마두부죽', soup: '저염 채소수프', sides: ['무나물', '버섯볶음', '당근나물'] },
        { main: '두부달걀오믈렛', soup: '토마토채소수프', sides: ['그린샐러드', '애호박무침', '연근조림(저염)'] },
        { main: '콩나물두부국밥(저염)', soup: '콩나물맑은국', sides: ['저염 나물', '새송이버섯구이', '양배추찜'] },
        { main: '버섯달걀찜', soup: '양송이버섯수프', sides: ['미나리무침', '당근볶음', '데친브로콜리'] },
    ],
    lunch: [
        { main: '연어구이', soup: '토마토채소수프', sides: ['가지구이', '그린샐러드', '연근조림(저염)'] },
        { main: '대구살채소찜', soup: '무맑은국', sides: ['청경채볶음', '오이채무침', '새송이버섯구이'] },
        { main: '콩불고기덮밥(저염)', soup: '배추맑은국', sides: ['양배추찜', '토마토샐러드', '우엉조림(저염)'] },
        { main: '닭안심수육', soup: '감자양파수프', sides: ['브로콜리찜', '파프리카구이', '숙주나물'] },
        { main: '두부버섯덮밥(저염)', soup: '들깨버섯수프', sides: ['미나리무침', '당근나물', '구운채소'] },
        { main: '고등어찜(저염)', soup: '콩나물맑은국', sides: ['무나물', '배추찜', '저염 버섯볶음'] },
        { main: '달걀채소덮밥', soup: '연두부국', sides: ['애호박볶음', '오이무침', '시금치나물'] },
        { main: '연어두부샐러드', soup: '저염 채소수프', sides: ['토마토샐러드', '단호박찜', '저염 나물'] },
        { main: '병아리콩두부볼', soup: '양배추수프', sides: ['그린샐러드', '가지나물', '버섯볶음'] },
        { main: '소고기채소찜', soup: '맑은채소국', sides: ['브로콜리찜', '청경채볶음', '오이채무침'] },
    ],
    dinner: [
        { main: '연어두부찜', soup: '두부맑은국', sides: ['양배추찜', '새송이버섯구이', '오이무침'] },
        { main: '단호박두부찜', soup: '단호박수프', sides: ['브로콜리찜', '무나물', '토마토샐러드'] },
        { main: '대구살채소찜', soup: '무맑은국', sides: ['청경채볶음', '구운채소', '저염 나물'] },
        { main: '콩불고기(저염)', soup: '배추맑은국', sides: ['가지구이', '오이채무침', '연근조림(저염)'] },
        { main: '두부채소죽', soup: '감자양파수프', sides: ['숙주나물', '애호박볶음', '당근나물'] },
        { main: '흰살생선죽', soup: '저염 채소수프', sides: ['배추찜', '버섯볶음', '미나리무침'] },
        { main: '버섯달걀찜', soup: '양송이버섯수프', sides: ['시금치나물', '파프리카구이', '양배추찜'] },
        { main: '닭안심수육', soup: '닭안심채소수프', sides: ['브로콜리찜', '오이무침', '구운버섯'] },
        { main: '고등어찜(저염)', soup: '미역국(저염)', sides: ['무나물', '청경채볶음', '저염 채소무침'] },
        { main: '버섯두부스테이크', soup: '맑은채소국', sides: ['그린샐러드', '단호박찜', '우엉조림(저염)'] },
    ],
};

const SNACK_TEMPLATES: SnackTemplate[] = [
    { main: '그릭요거트', side: '블루베리', hydration: '물' },
    { main: '찐단호박', side: '리코타치즈 소량', hydration: '보리차' },
    { main: '무가당 두유', side: '고구마 소량', hydration: '따뜻한 물' },
    { main: '삶은 달걀 1개', side: '토마토 조각', hydration: '루이보스차' },
    { main: '오트밀요거트', side: '키위', hydration: '물' },
    { main: '병아리콩 소량', side: '오이 스틱', hydration: '보리차' },
    { main: '무가당 요거트', side: '복숭아 조각', hydration: '물' },
    { main: '찐고구마', side: '호두 소량', hydration: '따뜻한 물' },
    { main: '배 조각', side: '아몬드 소량', hydration: '루이보스차' },
    { main: '베리류', side: '리코타치즈 소량', hydration: '물' },
    { main: '바나나 반 개', side: '무가당 두유', hydration: '보리차' },
    { main: '키위', side: '그릭요거트', hydration: '따뜻한 물' },
    { main: '사과 조각', side: '아몬드 소량', hydration: '물' },
    { main: '토마토 조각', side: '삶은 달걀 1개', hydration: '루이보스차' },
];

// A calendar-wide rotation is sliced into months. It does not restart on the
// first day of a month, or depend on which date the user opens first.
const MAIN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
type MainSlot = typeof MAIN_SLOTS[number];
type ScheduledProtein = 'egg' | 'fish' | 'tofu_bean' | 'chicken' | 'beef';
const WEEKLY_PROTEIN_ROTATION: ScheduledProtein[][] = [
    ['egg', 'fish', 'tofu_bean'],
    ['chicken', 'tofu_bean', 'fish'],
    ['tofu_bean', 'egg', 'chicken'],
    ['fish', 'chicken', 'tofu_bean'],
    ['egg', 'tofu_bean', 'fish'],
    ['tofu_bean', 'beef', 'egg'],
    ['chicken', 'fish', 'tofu_bean'],
];

const MONTHLY_MEAL_CATALOG: MealTemplate[] = Array.from(new Map([
    ...MEAL_TEMPLATES.breakfast,
    ...MEAL_TEMPLATES.lunch,
    ...MEAL_TEMPLATES.dinner,
    { main: '달걀찜', soup: '애호박맑은국', sides: ['당근나물', '배추찜', '가지나물'] },
    { main: '달걀채소찜', soup: '버섯맑은국', sides: ['브로콜리찜', '무나물', '숙주나물'] },
    { main: '채소달걀죽', soup: '맑은채소국', sides: ['애호박볶음', '배추찜', '당근나물'] },
    { main: '계란말이', soup: '두부맑은국', sides: ['시금치나물', '구운채소', '오이무침'] },
    { main: '스크램블에그', soup: '양배추수프', sides: ['토마토샐러드', '버섯볶음', '단호박찜'] },
    { main: '닭안심찜', soup: '당근수프', sides: ['가지나물', '청경채볶음', '배추찜'] },
    { main: '닭가슴살구이', soup: '브로콜리수프', sides: ['시금치나물', '오이무침', '새송이버섯구이'] },
    { main: '닭가슴살채소찜', soup: '무맑은국', sides: ['숙주나물', '당근나물', '양배추찜'] },
    { main: '닭가슴살채소볶음(저염)', soup: '배추맑은국', sides: ['브로콜리찜', '무나물', '오이채무침'] },
    { main: '닭안심버섯찜', soup: '애호박맑은국', sides: ['청경채볶음', '구운채소', '콩나물무침'] },
    { main: '귀리닭죽', soup: '맑은채소국', sides: ['당근나물', '배추찜', '애호박볶음'] },
    { main: '흰살생선찜', soup: '연두부국', sides: ['브로콜리찜', '무나물', '배추찜'] },
    { main: '흰살생선구이(저염)', soup: '양송이버섯수프', sides: ['애호박볶음', '시금치나물', '오이무침'] },
    { main: '연어채소찜', soup: '감자양파수프', sides: ['청경채볶음', '가지나물', '무나물'] },
    { main: '고등어구이', soup: '버섯맑은국', sides: ['배추찜', '당근나물', '숙주나물'] },
    { main: '흰살생선두부찜', soup: '애호박맑은국', sides: ['양배추찜', '버섯볶음', '당근나물'] },
    { main: '두부조림', soup: '브로콜리수프', sides: ['무나물', '시금치나물', '파프리카구이'] },
    { main: '두부버섯조림', soup: '배추맑은국', sides: ['애호박볶음', '당근나물', '오이채무침'] },
    { main: '연두부덮밥', soup: '무맑은국', sides: ['가지나물', '청경채볶음', '배추찜'] },
    { main: '연두부달걀찜', soup: '맑은채소국', sides: ['당근나물', '애호박볶음', '무나물'] },
    { main: '두부채소볶음(저염)', soup: '감자양파수프', sides: ['브로콜리찜', '숙주나물', '파프리카구이'] },
    { main: '저지방 소고기볶음', soup: '버섯맑은국', sides: ['양배추찜', '당근나물', '오이무침'] },
].filter((template) => template.main !== '연어두부샐러드').map((template) => [template.main, template as MealTemplate])).values());

function cookingMethod(main: string) {
    if (/죽|국밥/.test(main)) return 'porridge';
    if (/구이|스테이크/.test(main)) return 'grill';
    if (/조림/.test(main)) return 'braise';
    if (/볶음|오믈렛|계란말이|스크램블/.test(main)) return 'saute';
    if (/수육/.test(main)) return 'boil';
    if (/덮밥/.test(main)) return 'rice_bowl';
    return 'steam';
}

// Interleave cooking methods inside each protein family, without synthesizing
// dish names. The count of entries exceeds that family's weekly occurrences.
function interleaveCookingMethods(templates: MealTemplate[]) {
    const groups = new Map<string, MealTemplate[]>();
    templates.forEach((template) => {
        const method = cookingMethod(template.main);
        groups.set(method, [...(groups.get(method) ?? []), template]);
    });
    const ordered: MealTemplate[] = [];
    for (let index = 0; ordered.length < templates.length; index += 1) {
        groups.forEach((group) => { if (group[index]) ordered.push(group[index]); });
    }
    return ordered;
}

const MONTHLY_PROTEIN_POOLS = Object.fromEntries(
    ['egg', 'fish', 'tofu_bean', 'chicken', 'beef'].map((family) => [
        family,
        interleaveCookingMethods(MONTHLY_MEAL_CATALOG.filter((template) => proteinFamilyForMain(template.main) === family)),
    ])
) as Record<ScheduledProtein, MealTemplate[]>;

function calendarDayIndex(dateKey: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) throw new RangeError('식단 날짜는 YYYY-MM-DD 형식이어야 합니다.');
    const parsed = new Date(`${dateKey}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
        throw new RangeError('유효하지 않은 식단 날짜입니다.');
    }
    return Math.floor(parsed.getTime() / 86400000);
}

function scheduledTemplate(dayIndex: number, slotIndex: number) {
    const dayOfWeek = positiveModulo(dayIndex, WEEKLY_PROTEIN_ROTATION.length);
    const weekIndex = Math.floor(dayIndex / 7);
    // Also rotate meal positions weekly. Otherwise a pool length divisible by
    // its weekly frequency can pin the same dishes to breakfast indefinitely.
    const dayFamilies = WEEKLY_PROTEIN_ROTATION[dayOfWeek];
    const family = dayFamilies[positiveModulo(slotIndex + weekIndex, dayFamilies.length)];
    const weeklyCount = WEEKLY_PROTEIN_ROTATION.flat().filter((item) => item === family).length;
    const earlierOccurrences = WEEKLY_PROTEIN_ROTATION.slice(0, dayOfWeek).flat()
        .filter((item) => item === family).length;
    const occurrenceIndex = weekIndex * weeklyCount + earlierOccurrences;
    const pool = MONTHLY_PROTEIN_POOLS[family];
    return pool[positiveModulo(occurrenceIndex, pool.length)];
}

function hasIntegratedGrain(main: string) {
    return /죽|덮밥|국밥|초밥|국수|우동|피자|샌드위치/.test(main);
}

function syncMealDetails(meal: MealSuggestion, slot: MealSlot) {
    meal.summary = (slot === 'snack' ? [meal.main, ...meal.sides, meal.soup] : [meal.riceType, meal.main, meal.soup]).filter(Boolean).join(' + ');
    meal.nutritionUnavailable = true;
    if (slot === 'snack') {
        const recipe = buildSnackRecipe(meal.main, meal.sides.join(' · '), meal.soup);
        meal.recipeName = recipe.recipeName;
        meal.recipeSteps = recipe.recipeSteps;
        return;
    }
    const method = cookingMethod(meal.main);
    const cookingGuide: Record<string, string> = {
        porridge: '곡물과 잘게 썬 재료를 충분히 익혀 부드럽게 준비해요.',
        grill: '속까지 충분히 익히고 표면이 타지 않게 구워요.',
        braise: '양념을 조금씩 넣어 간을 맞추고 속까지 익혀 조려요.',
        saute: '기름을 적게 두르고 재료가 충분히 익도록 조리해요.',
        boil: '고기 속까지 충분히 익도록 삶고 먹기 좋은 크기로 썰어요.',
        rice_bowl: '속재료를 충분히 익혀 준비한 밥 위에 올려요.',
        steam: '재료의 속까지 충분히 익도록 쪄서 준비해요.',
    };
    meal.recipeName = `${meal.main} 한 끼`;
    meal.recipeSteps = [
        '손과 조리도구를 씻고 재료를 먹기 좋은 크기로 준비해요.',
        cookingGuide[method],
        `${meal.soup}과 채소 반찬을 곁들이고, 양념은 드실 때 조절해요.`,
        '먹는 양과 식감은 현재 컨디션과 의료진의 식사 지침에 맞춰요.',
    ];
}

function buildScheduledMeal(dayIndex: number, slotIndex: number, stageType: StageType): MealSuggestion {
    const template = scheduledTemplate(dayIndex, slotIndex);
    const riceType = hasIntegratedGrain(template.main) ? '' : RICE_TYPES[positiveModulo(dayIndex * 3 + slotIndex, RICE_TYPES.length)];
    const meal: MealSuggestion = {
        main: template.main, soup: template.soup, sides: [...template.sides], riceType,
        summary: '', recipeName: '', recipeSteps: [],
        // The catalog has no weighed portions or nutrient database calculation.
        nutrient: { carb: 0, protein: 0, fat: 0 }, nutritionUnavailable: true,
        cautionFlour: stageType === 'surgery'
            ? '수술 후 식사 단계와 허용 식감은 의료진의 안내를 우선해 주세요.'
            : '먹는 양과 조리법은 현재 컨디션과 안내받은 식사 지침에 맞춰 주세요.',
    };
    syncMealDetails(meal, MAIN_SLOTS[slotIndex]);
    return meal;
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function positiveModulo(value: number, length: number) {
    if (length <= 0) {
        return 0;
    }
    return ((Math.round(value) % length) + length) % length;
}

function hashStringToSeed(input: string) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mixSeed(seed: number, salt: number) {
    let mixed = (seed + Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x85ebca6b) >>> 0;
    mixed ^= mixed >>> 13;
    mixed = Math.imul(mixed, 0xc2b2ae35) >>> 0;
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

function pickFromPool(pool: string[], seed: number, fallback = '') {
    const candidates = pool.map((item) => item.trim()).filter(Boolean);
    if (candidates.length === 0) {
        return fallback;
    }
    return candidates[positiveModulo(seed, candidates.length)] ?? fallback;
}

function mainPoolForSlot(slot: MealSlot) {
    if (slot === 'breakfast') {
        return BREAKFAST_MAIN_VARIANTS;
    }
    if (slot === 'lunch') {
        return LUNCH_MAIN_VARIANTS;
    }
    if (slot === 'dinner') {
        return DINNER_MAIN_VARIANTS;
    }
    return SNACK_MAIN_VARIANTS;
}

function slotSalt(slot: MealSlot) {
    if (slot === 'breakfast') {
        return 101;
    }
    if (slot === 'lunch') {
        return 211;
    }
    if (slot === 'dinner') {
        return 307;
    }
    return 419;
}

function isRiceEligibleForDiversity(riceType: string) {
    const normalized = riceType.trim();
    if (!normalized || normalized.includes('생략') || normalized.includes('소량') || normalized.includes('1/3')) {
        return false;
    }
    return RICE_TYPES.includes(normalized);
}

function isSoupEligibleForDiversity(soup: string) {
    return SOUPS.includes(soup.trim());
}

function isMainEligibleForDiversity(main: string, pool: string[]) {
    const normalized = main.trim();
    if (!normalized) {
        return false;
    }

    const protectedKeywords = ['피자', '치킨 2조각', '샌드위치', '초밥', '숙회'];
    if (protectedKeywords.some((keyword) => normalized.includes(keyword))) {
        return false;
    }

    return pool.includes(normalized) || PROTEIN_MAINS.includes(normalized) || MEAT_MAINS.includes(normalized);
}

function proteinFamilyForMain(main: string) {
    const normalized = normalizeMealTokenForSimilarity(main);
    if (!normalized) {
        return 'unknown';
    }
    if (normalized.includes('닭') || normalized.includes('치킨')) {
        return 'chicken';
    }
    if (normalized.includes('연어') || normalized.includes('고등어') || normalized.includes('대구') || normalized.includes('흰살') || normalized.includes('생선')) {
        return 'fish';
    }
    if (/새우|오징어|조개|전복|홍합|게살/.test(normalized)) {
        return 'seafood';
    }
    if (normalized.includes('두부') || normalized.includes('콩')) {
        return 'tofu_bean';
    }
    if (normalized.includes('달걀') || normalized.includes('계란') || normalized.includes('에그')) {
        return 'egg';
    }
    if (normalized.includes('소고기')) {
        return 'beef';
    }
    if (normalized.includes('돼지')) {
        return 'pork';
    }
    if (normalized.includes('오리')) {
        return 'duck';
    }
    return normalized;
}

function isCoreProteinFamily(family: string) {
    return ['chicken', 'fish', 'seafood', 'tofu_bean', 'egg', 'beef', 'pork', 'duck'].includes(family);
}

function pickMealTemplate(slot: Exclude<MealSlot, 'snack'>, seed: number) {
    const templates = MEAL_TEMPLATES[slot];
    return templates[positiveModulo(seed, templates.length)];
}

function applyMealTemplate(meal: MealSuggestion, slot: Exclude<MealSlot, 'snack'>, template: MealTemplate) {
    meal.main = template.main;
    meal.soup = template.soup;
    meal.sides = [...template.sides];
    refreshMealRecipe(meal, slot);
}

function pickSnackTemplate(seed: number) {
    return SNACK_TEMPLATES[positiveModulo(seed, SNACK_TEMPLATES.length)];
}

function applySnackTemplate(meal: MealSuggestion, template: SnackTemplate) {
    meal.main = template.main;
    meal.sides = [template.side];
    meal.soup = template.hydration;
    refreshMealRecipe(meal, 'snack');
}

function pickMainByRecentFamily(
    current: string,
    pool: string[],
    recentPlans: DayPlan[],
    slot: MealSlot,
    seed: number
) {
    const candidates = pool.map((item) => item.trim()).filter(Boolean);
    if (candidates.length === 0) {
        return current;
    }

    const recentExactValues = new Set(recentPlans.map((item) => mealBySlot(item, slot).main));
    const recentFamilyCounts = recentPlans.reduce((acc, item) => {
        const family = proteinFamilyForMain(mealBySlot(item, slot).main);
        if (isCoreProteinFamily(family)) {
            acc.set(family, (acc.get(family) ?? 0) + 1);
        }
        return acc;
    }, new Map<string, number>());

    const currentFamily = proteinFamilyForMain(current);
    const ranked = candidates
        .map((candidate, index) => {
            const family = proteinFamilyForMain(candidate);
            const exactPenalty = recentExactValues.has(candidate) ? 10_000 : 0;
            const familyPenalty = isCoreProteinFamily(family) ? (recentFamilyCounts.get(family) ?? 0) * 120 : 0;
            const currentPenalty = candidate === current ? 80 : 0;
            const sameFamilyPenalty = family === currentFamily && isCoreProteinFamily(family) ? 35 : 0;
            const fatiguePenalty =
                candidate === '닭안심찜' || candidate === '무가당 요거트' || candidate === '바나나 반 개'
                    ? 240
                    : 0;
            return {
                candidate,
                score:
                    exactPenalty +
                    familyPenalty +
                    currentPenalty +
                    sameFamilyPenalty +
                    fatiguePenalty +
                    positiveModulo(mixSeed(seed, index + 41), 31),
            };
        })
        .sort((a, b) => a.score - b.score);

    return ranked[0]?.candidate ?? current;
}

function balanceDailyProteinFamilies(plan: DayPlan, seed: number) {
    const changedSlots: MealSlot[] = [];
    const usedFamilies = new Set<string>();

    (['breakfast', 'lunch', 'dinner'] as Exclude<MealSlot, 'snack'>[]).forEach((slot) => {
        const meal = mealBySlot(plan, slot);
        const family = proteinFamilyForMain(meal.main);
        if (!isCoreProteinFamily(family)) {
            return;
        }

        if (!usedFamilies.has(family)) {
            usedFamilies.add(family);
            return;
        }

        const pool = mainPoolForSlot(slot);
        const alternative = pool
            .map((candidate, index) => ({
                candidate,
                family: proteinFamilyForMain(candidate),
                score: mixSeed(seed, slotSalt(slot) + index),
            }))
            .filter((item) => isCoreProteinFamily(item.family) && !usedFamilies.has(item.family))
            .sort((a, b) => a.score - b.score)[0];

        if (!alternative) {
            return;
        }

        meal.main = alternative.candidate;
        refreshMealRecipe(meal, slot);
        usedFamilies.add(alternative.family);
        changedSlots.push(slot);
    });

    return changedSlots;
}

export function formatDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDateLabel(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    return `${month}/${day}(${weekdays[date.getDay()]})`;
}

export function monthDateKeys(year: number, monthZeroBased: number) {
    const lastDay = new Date(year, monthZeroBased + 1, 0).getDate();
    const keys: string[] = [];

    for (let day = 1; day <= lastDay; day += 1) {
        keys.push(formatDateKey(new Date(year, monthZeroBased, day)));
    }

    return keys;
}

function buildRecipe(main: string, soup: string, side: string, seasonal: string) {
    return {
        recipeName: `${main} 한 끼`,
        recipeSteps: [
            `재료 손질: ${seasonal}, ${side}를 깨끗하게 씻어 한입 크기로 준비해요.`,
            `${main}은 기름을 많이 쓰지 않고 굽거나 찌는 방식으로 익혀요.`,
            `${soup}은 저염으로 끓이고 자극적인 양념은 줄여요.`,
            '밥-단백질-채소 반찬 순서로 천천히 드세요.',
        ],
    };
}

function buildSnackRecipe(main: string, side: string, hydration: string, recipeName?: string) {
    return {
        recipeName: recipeName ?? `${main} 간식`,
        recipeSteps: [
            `${main}을(를) 1회 분량으로 준비해요.`,
            `${side}을(를) 소량 곁들여요.`,
            `${hydration}을 함께 마셔 수분을 보충해요.`,
            '시럽·설탕 추가는 피하고 담백하게 드세요.',
        ],
    };
}

function clonePlan(plan: DayPlan): DayPlan {
    return {
        date: plan.date,
        breakfast: { ...plan.breakfast, nutrient: { ...plan.breakfast.nutrient }, sides: [...plan.breakfast.sides], recipeSteps: [...plan.breakfast.recipeSteps] },
        lunch: { ...plan.lunch, nutrient: { ...plan.lunch.nutrient }, sides: [...plan.lunch.sides], recipeSteps: [...plan.lunch.recipeSteps] },
        dinner: { ...plan.dinner, nutrient: { ...plan.dinner.nutrient }, sides: [...plan.dinner.sides], recipeSteps: [...plan.dinner.recipeSteps] },
        snack: { ...plan.snack, nutrient: { ...plan.snack.nutrient }, sides: [...plan.snack.sides], recipeSteps: [...plan.snack.recipeSteps] },
    };
}

function mealBySlot(plan: DayPlan, slot: MealSlot) {
    if (slot === 'breakfast') {
        return plan.breakfast;
    }
    if (slot === 'lunch') {
        return plan.lunch;
    }
    if (slot === 'dinner') {
        return plan.dinner;
    }
    return plan.snack;
}

function relaxDinnerCarbBySafety(nutrient: MealNutrient, carbFloor: number) {
    const originalCarb = nutrient.carb;
    let carb = Math.max(originalCarb, carbFloor);
    const fat = nutrient.fat;
    let protein = 100 - carb - fat;

    // 단백질 최소치를 지키면서 저녁 탄수 하향 강도를 완화한다.
    if (protein < 20) {
        const lack = 20 - protein;
        carb = Math.max(originalCarb, carb - lack);
        protein = 100 - carb - fat;
    }

    return {
        carb,
        protein: clamp(protein, 20, 60),
        fat,
    };
}

export function applyDinnerCarbSafety(plan: DayPlan, context: DinnerCarbSafetyContext) {
    const underweight = context.bmi !== null && context.bmi < 18.5;
    const appetiteRisk = context.lowAppetiteRisk;

    if (!underweight && !appetiteRisk) {
        return {
            plan,
            notes: [] as string[],
        };
    }

    if (plan.dinner.nutritionUnavailable || plan.lunch.nutritionUnavailable) {
        return {
            plan,
            notes: ['체중이나 식사량이 줄고 있다면 저녁 식사량을 임의로 줄이지 말고 의료진과 확인해 주세요.'],
        };
    }

    const optimized = clonePlan(plan);
    const notes: string[] = [];
    const combinedRisk = underweight && appetiteRisk;
    const carbFloor = context.weightLossPreference
        ? combinedRisk
            ? 32
            : 30
        : combinedRisk
          ? 36
          : 34;
    const relativeFloor = Math.max(carbFloor, optimized.lunch.nutrient.carb - 4);
    const nextDinnerNutrient = relaxDinnerCarbBySafety(optimized.dinner.nutrient, relativeFloor);

    if (nextDinnerNutrient.carb > optimized.dinner.nutrient.carb) {
        optimized.dinner.nutrient = nextDinnerNutrient;
        notes.push('체중저하/식욕저하 위험을 반영해 저녁 탄수화물 감량 강도를 완화했어요.');
    }

    return {
        plan: optimized,
        notes,
    };
}

function pickNextNonRepeating(current: string, pool: string[], recentValues: Set<string>) {
    const normalizedCurrent = current.trim();
    const basePool = pool.filter((item) => item.trim().length > 0);
    const workingPool = normalizedCurrent && !basePool.includes(normalizedCurrent) ? [normalizedCurrent, ...basePool] : basePool;
    const startIndex = Math.max(0, workingPool.indexOf(normalizedCurrent));

    for (let offset = 0; offset < workingPool.length; offset += 1) {
        const candidate = workingPool[(startIndex + offset) % workingPool.length];
        if (!recentValues.has(candidate)) {
            return candidate;
        }
    }

    return normalizedCurrent || workingPool[0] || current;
}

function pickNextNonRepeatingWithOffset(current: string, pool: string[], recentValues: Set<string>, startOffset: number) {
    const normalizedCurrent = current.trim();
    const basePool = pool.filter((item) => item.trim().length > 0);
    const workingPool = normalizedCurrent && !basePool.includes(normalizedCurrent) ? [normalizedCurrent, ...basePool] : basePool;

    if (workingPool.length === 0) {
        return current;
    }

    const startIndex = Math.max(0, workingPool.indexOf(normalizedCurrent));
    const safeOffset = ((Math.round(startOffset) % workingPool.length) + workingPool.length) % workingPool.length;

    for (let offset = 0; offset < workingPool.length; offset += 1) {
        const candidate = workingPool[(startIndex + safeOffset + offset) % workingPool.length];
        if (!recentValues.has(candidate)) {
            return candidate;
        }
    }

    const fallback = workingPool[(startIndex + safeOffset) % workingPool.length];
    return fallback ?? normalizedCurrent ?? current;
}

function normalizeMealTokenForSimilarity(input: string) {
    return input
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/저염|담백한|무가당|저지방|따뜻한|차가운|부드러운|소량/g, '')
        .replace(/\s+/g, '')
        .trim();
}

function extractSimilarityTokens(name: string) {
    const normalized = normalizeMealTokenForSimilarity(name);
    if (!normalized) {
        return [] as string[];
    }

    const tokens = [`menu:${normalized}`];

    if (normalized.includes('닭')) {
        tokens.push('protein:chicken');
    }
    if (normalized.includes('생선') || normalized.includes('연어') || normalized.includes('고등어') || normalized.includes('흰살')) {
        tokens.push('protein:fish');
    }
    if (normalized.includes('두부') || normalized.includes('콩')) {
        tokens.push('protein:tofu_bean');
    }
    if (normalized.includes('달걀') || normalized.includes('계란')) {
        tokens.push('protein:egg');
    }
    if (normalized.includes('요거트') || normalized.includes('두유')) {
        tokens.push('protein:dairy_soy');
    }

    if (normalized.includes('밥') || normalized.includes('죽') || normalized.includes('덮밥') || normalized.includes('국수') || normalized.includes('면')) {
        tokens.push('carb:grain');
    }
    if (normalized.includes('고구마') || normalized.includes('바나나') || normalized.includes('사과') || normalized.includes('배') || normalized.includes('키위') || normalized.includes('딸기') || normalized.includes('베리')) {
        tokens.push('carb:fruit_starch');
    }

    if (normalized.includes('구이') || normalized.includes('구운')) {
        tokens.push('method:grill');
    }
    if (normalized.includes('찜')) {
        tokens.push('method:steam');
    }
    if (normalized.includes('볶음')) {
        tokens.push('method:stir_fry');
    }
    if (normalized.includes('무침')) {
        tokens.push('method:season');
    }
    if (normalized.includes('국') || normalized.includes('수프')) {
        tokens.push('dish:soup');
    }
    if (normalized.includes('샐러드')) {
        tokens.push('dish:salad');
    }

    return Array.from(new Set(tokens));
}

function mealSimilarityTokenSet(meal: MealSuggestion, slot: MealSlot) {
    const names =
        slot === 'snack'
            ? [meal.main, ...meal.sides.slice(0, 2), meal.soup]
            : [meal.riceType, meal.main, meal.soup, ...meal.sides.slice(0, 2)];

    return new Set(names.flatMap((name) => extractSimilarityTokens(name)));
}

function jaccardSimilarityScore(base: Set<string>, target: Set<string>) {
    if (base.size === 0 && target.size === 0) {
        return 0;
    }

    let intersection = 0;
    base.forEach((token) => {
        if (target.has(token)) {
            intersection += 1;
        }
    });

    const union = new Set<string>([...base, ...target]).size;
    return union === 0 ? 0 : intersection / union;
}

function maxMealSimilarityAgainstRecent(meal: MealSuggestion, slot: MealSlot, recentPlans: DayPlan[]) {
    if (recentPlans.length === 0) {
        return 0;
    }

    const currentTokens = mealSimilarityTokenSet(meal, slot);
    return recentPlans.reduce((maxScore, recentPlan) => {
        const recentTokens = mealSimilarityTokenSet(mealBySlot(recentPlan, slot), slot);
        const score = jaccardSimilarityScore(currentTokens, recentTokens);
        return Math.max(maxScore, score);
    }, 0);
}

function seasonalFromSide(side: string) {
    const cleaned = side
        .replace(/\([^)]*\)/g, '')
        .replace(/저염|담백한|구운|데친|따뜻한|차가운/g, '')
        .trim();
    const token = cleaned.split(/\s+/).find(Boolean);
    return token ?? '채소';
}

function normalizeDaySignatureToken(input: string) {
    return input
        .toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/\s+/g, '')
        .trim();
}

function dayPlanSignature(plan: DayPlan) {
    const breakfast = [
        plan.breakfast.riceType,
        plan.breakfast.main,
        plan.breakfast.soup,
        plan.breakfast.sides[0] ?? '',
    ];
    const lunch = [
        plan.lunch.riceType,
        plan.lunch.main,
        plan.lunch.soup,
        plan.lunch.sides[0] ?? '',
    ];
    const dinner = [
        plan.dinner.riceType,
        plan.dinner.main,
        plan.dinner.soup,
        plan.dinner.sides[0] ?? '',
    ];
    const snack = [
        plan.snack.main,
        plan.snack.soup,
        plan.snack.sides[0] ?? '',
    ];

    return [breakfast, lunch, dinner, snack]
        .map((part) => part.map((token) => normalizeDaySignatureToken(token)).join('|'))
        .join('||');
}

function refreshMealRecipe(meal: MealSuggestion, slot: MealSlot) {
    if (slot === 'snack') {
        const snackSide = meal.sides[0] ?? SNACK_SIDE_VARIANTS[0];
        meal.summary = `${meal.main} + ${snackSide} + ${meal.soup}`;
        const snackRecipe = buildSnackRecipe(meal.main, snackSide, meal.soup);
        meal.recipeName = snackRecipe.recipeName;
        meal.recipeSteps = snackRecipe.recipeSteps;
        return;
    }

    const firstSide = meal.sides[0] ?? SIDES[0];
    meal.summary = [meal.riceType, meal.main, meal.soup].filter(Boolean).join(' + ');
    const recipe = buildRecipe(meal.main, meal.soup, firstSide, seasonalFromSide(firstSide));
    meal.recipeName = recipe.recipeName;
    meal.recipeSteps = recipe.recipeSteps;
}

function applyDateBasedDiversity(plan: DayPlan) {
    const optimized = clonePlan(plan);
    const seed = hashStringToSeed(`${plan.date}:daily-variety`);
    const changedSlots: MealSlot[] = [];

    (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).forEach((slot) => {
        const meal = mealBySlot(optimized, slot);
        const originalSignature = [
            meal.riceType,
            meal.main,
            meal.soup,
            ...meal.sides,
        ].join('|');
        const slotSeed = mixSeed(seed, slotSalt(slot));
        const mainPool = mainPoolForSlot(slot);
        const mainEligible = isMainEligibleForDiversity(meal.main, mainPool);

        if (mainEligible) {
            meal.main = pickFromPool(mainPool, mixSeed(slotSeed, 7), meal.main);
        }

        if (slot === 'snack') {
            if (mainEligible) {
                applySnackTemplate(meal, pickSnackTemplate(mixSeed(slotSeed, 13)));
            }
            if (isSoupEligibleForDiversity(meal.soup) || SNACK_HYDRATION_VARIANTS.includes(meal.soup.trim())) {
                meal.soup = pickFromPool(SNACK_HYDRATION_VARIANTS, mixSeed(slotSeed, 17), meal.soup);
                refreshMealRecipe(meal, slot);
            }
        } else if (mainEligible) {
            const template = pickMealTemplate(slot, mixSeed(slotSeed, 11));
            applyMealTemplate(meal, slot, template);

            if (isRiceEligibleForDiversity(meal.riceType)) {
                meal.riceType = pickFromPool(RICE_TYPES, mixSeed(slotSeed, 19), meal.riceType);
            }
            refreshMealRecipe(meal, slot);
        }

        const nextSignature = [
            meal.riceType,
            meal.main,
            meal.soup,
            ...meal.sides,
        ].join('|');
        if (nextSignature !== originalSignature) {
            changedSlots.push(slot);
        }
    });

    changedSlots.push(...balanceDailyProteinFamilies(optimized, seed));

    return {
        plan: optimized,
        changedSlots,
    };
}

export function applySevenDayNoRepeatRule(plan: DayPlan, recentPlans: DayPlan[], windowDays = 7) {
    const recentWindow = clamp(Math.round(windowDays), 1, 30);
    const recent = recentPlans.slice(-recentWindow);
    const dateVaried = applyDateBasedDiversity(plan);
    const optimized = dateVaried.plan;

    if (recent.length === 0) {
        return {
            plan: optimized,
            notes:
                dateVaried.changedSlots.length > 0
                    ? [`날짜별 메뉴 다양화 규칙으로 ${dateVaried.changedSlots.map((slot) => mealTypeLabel(slot)).join(', ')} 구성을 분산했어요.`]
                    : ([] as string[]),
        };
    }

    const dateVariedSlots: MealSlot[] = [...dateVaried.changedSlots];
    const changedSlots: MealSlot[] = [];
    const similarityAdjustedSlots: MealSlot[] = [];
    const similarityUnresolvedSlots: MealSlot[] = [];
    let daySignatureAdjusted = false;
    let daySignatureUnresolved = false;
    const mainPools: Record<MealSlot, string[]> = {
        breakfast: mainPoolForSlot('breakfast'),
        lunch: mainPoolForSlot('lunch'),
        dinner: mainPoolForSlot('dinner'),
        snack: mainPoolForSlot('snack'),
    };

    (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).forEach((slot) => {
        const meal = mealBySlot(optimized, slot);
        const originalMain = meal.main;
        const originalSoup = meal.soup;
        const originalFirstSide = meal.sides[0] ?? '';
        const originalRiceType = meal.riceType;
        const nextMain = pickMainByRecentFamily(
            meal.main,
            mainPools[slot],
            recent,
            slot,
            hashStringToSeed(`${optimized.date}:${slot}:recent-main`)
        );
        meal.main = nextMain;

        if (slot === 'snack') {
            const fallbackSide = meal.sides[0] ?? SNACK_FRUITS[0];
            const recentSideValues = new Set(
                recent
                    .map((item) => item.snack.sides[0] ?? '')
                    .map((value) => value.trim())
                    .filter(Boolean)
            );
            const nextSide = pickNextNonRepeating(fallbackSide, SNACK_SIDE_VARIANTS, recentSideValues);
            const recentHydrationValues = new Set(recent.map((item) => item.snack.soup));
            const nextHydration = pickNextNonRepeating(meal.soup, SNACK_HYDRATION_VARIANTS, recentHydrationValues);

            meal.sides = [nextSide];
            meal.soup = nextHydration;
            meal.summary = `${meal.main} + ${nextSide} + ${meal.soup}`;
            const snackRecipe = buildSnackRecipe(meal.main, nextSide, meal.soup);
            meal.recipeName = snackRecipe.recipeName;
            meal.recipeSteps = snackRecipe.recipeSteps;

            let similarityScore = maxMealSimilarityAgainstRecent(meal, slot, recent);
            if (similarityScore >= MEAL_SIMILARITY_THRESHOLD) {
                for (let attempt = 1; attempt <= MEAL_REGEN_MAX_ATTEMPTS; attempt += 1) {
                    meal.main = pickMainByRecentFamily(
                        meal.main,
                        mainPools[slot],
                        recent.slice(-Math.max(7, recentWindow - attempt)),
                        slot,
                        hashStringToSeed(`${optimized.date}:${slot}:snack-attempt:${attempt}`)
                    );
                    const nextSnackSide = pickNextNonRepeatingWithOffset(
                        meal.sides[0] ?? fallbackSide,
                        SNACK_SIDE_VARIANTS,
                        recentSideValues,
                        attempt
                    );
                    const nextSnackHydration = pickNextNonRepeatingWithOffset(
                        meal.soup,
                        SNACK_HYDRATION_VARIANTS,
                        recentHydrationValues,
                        attempt
                    );
                    meal.sides = [nextSnackSide];
                    meal.soup = nextSnackHydration;
                    meal.summary = `${meal.main} + ${nextSnackSide} + ${meal.soup}`;
                    const refreshedSnackRecipe = buildSnackRecipe(meal.main, nextSnackSide, meal.soup);
                    meal.recipeName = refreshedSnackRecipe.recipeName;
                    meal.recipeSteps = refreshedSnackRecipe.recipeSteps;

                    similarityScore = maxMealSimilarityAgainstRecent(meal, slot, recent);
                    if (similarityScore < MEAL_SIMILARITY_THRESHOLD) {
                        similarityAdjustedSlots.push(slot);
                        break;
                    }
                }
            }

            if (similarityScore >= MEAL_SIMILARITY_THRESHOLD) {
                similarityUnresolvedSlots.push(slot);
            }

            if (meal.main !== originalMain || meal.soup !== originalSoup || (meal.sides[0] ?? '') !== originalFirstSide) {
                changedSlots.push(slot);
            }
            return;
        }

        const recentRiceValues = new Set(recent.map((item) => mealBySlot(item, slot).riceType));
        if (isRiceEligibleForDiversity(meal.riceType)) {
            meal.riceType = pickNextNonRepeating(meal.riceType, RICE_TYPES, recentRiceValues);
        }

        const recentSoupValues = new Set(recent.map((item) => mealBySlot(item, slot).soup));
        const nextSoup = pickNextNonRepeating(meal.soup, SOUPS, recentSoupValues);
        meal.soup = nextSoup;

        const firstSide = meal.sides[0] ?? SIDES[0];
        const recentSideValues = new Set(
            recent
                .map((item) => mealBySlot(item, slot).sides[0] ?? '')
                .map((value) => value.trim())
                .filter(Boolean)
        );
        meal.sides[0] = pickNextNonRepeating(firstSide, SIDES, recentSideValues);
        refreshMealRecipe(meal, slot);

        let similarityScore = maxMealSimilarityAgainstRecent(meal, slot, recent);
        if (similarityScore >= MEAL_SIMILARITY_THRESHOLD) {
            for (let attempt = 1; attempt <= MEAL_REGEN_MAX_ATTEMPTS; attempt += 1) {
                meal.main = pickMainByRecentFamily(
                    meal.main,
                    mainPools[slot],
                    recent.slice(-Math.max(7, recentWindow - attempt)),
                    slot,
                    hashStringToSeed(`${optimized.date}:${slot}:meal-attempt:${attempt}`)
                );
                if (isRiceEligibleForDiversity(meal.riceType)) {
                    meal.riceType = pickNextNonRepeatingWithOffset(meal.riceType, RICE_TYPES, recentRiceValues, attempt);
                }
                meal.soup = pickNextNonRepeatingWithOffset(meal.soup, SOUPS, recentSoupValues, attempt);
                meal.sides[0] = pickNextNonRepeatingWithOffset(
                    meal.sides[0] ?? SIDES[0],
                    SIDES,
                    recentSideValues,
                    attempt
                );

                refreshMealRecipe(meal, slot);

                similarityScore = maxMealSimilarityAgainstRecent(meal, slot, recent);
                if (similarityScore < MEAL_SIMILARITY_THRESHOLD) {
                    similarityAdjustedSlots.push(slot);
                    break;
                }
            }
        }

        if (similarityScore >= MEAL_SIMILARITY_THRESHOLD) {
            similarityUnresolvedSlots.push(slot);
        }

            if (
                meal.main !== originalMain ||
                meal.soup !== originalSoup ||
                meal.riceType !== originalRiceType ||
                (meal.sides[0] ?? '') !== originalFirstSide
            ) {
                changedSlots.push(slot);
            }
    });

    const recentDaySignatures = new Set(recent.map((item) => dayPlanSignature(item)));
    let currentSignature = dayPlanSignature(optimized);
    if (recentDaySignatures.has(currentSignature)) {
        const slotOrder: MealSlot[] = ['dinner', 'lunch', 'breakfast', 'snack'];
        const maxAttempts = MEAL_REGEN_MAX_ATTEMPTS * slotOrder.length;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const slot = slotOrder[(attempt - 1) % slotOrder.length];
            const meal = mealBySlot(optimized, slot);
            const originalMain = meal.main;
            const originalSoup = meal.soup;
            const originalFirstSide = meal.sides[0] ?? '';
            meal.main = pickMainByRecentFamily(
                meal.main,
                mainPools[slot],
                recent,
                slot,
                hashStringToSeed(`${optimized.date}:${slot}:signature:${attempt}`)
            );

            if (slot === 'snack') {
                const fallbackSide = meal.sides[0] ?? SNACK_SIDE_VARIANTS[0];
                const recentSideValues = new Set(
                    recent
                        .map((item) => item.snack.sides[0] ?? '')
                        .map((value) => value.trim())
                        .filter(Boolean)
                );
                const recentHydrationValues = new Set(recent.map((item) => item.snack.soup));
                const nextSide = pickNextNonRepeatingWithOffset(
                    fallbackSide,
                    SNACK_SIDE_VARIANTS,
                    recentSideValues,
                    attempt + recentWindow
                );
                const nextHydration = pickNextNonRepeatingWithOffset(
                    meal.soup,
                    SNACK_HYDRATION_VARIANTS,
                    recentHydrationValues,
                    attempt + recentWindow
                );
                meal.sides = [nextSide];
                meal.soup = nextHydration;
                meal.summary = `${meal.main} + ${nextSide} + ${meal.soup}`;
                const snackRecipe = buildSnackRecipe(meal.main, nextSide, meal.soup);
                meal.recipeName = snackRecipe.recipeName;
                meal.recipeSteps = snackRecipe.recipeSteps;
            } else {
                const recentSoupValues = new Set(recent.map((item) => mealBySlot(item, slot).soup));
                meal.soup = pickNextNonRepeatingWithOffset(meal.soup, SOUPS, recentSoupValues, attempt + recentWindow);
                const firstSide = meal.sides[0] ?? SIDES[0];
                meal.summary = [meal.riceType, meal.main, meal.soup].filter(Boolean).join(' + ');
                const recipe = buildRecipe(meal.main, meal.soup, firstSide, seasonalFromSide(firstSide));
                meal.recipeName = recipe.recipeName;
                meal.recipeSteps = recipe.recipeSteps;
            }

            if (
                meal.main !== originalMain ||
                meal.soup !== originalSoup ||
                (meal.sides[0] ?? '') !== originalFirstSide
            ) {
                changedSlots.push(slot);
            }

            currentSignature = dayPlanSignature(optimized);
            if (!recentDaySignatures.has(currentSignature)) {
                daySignatureAdjusted = true;
                break;
            }
        }
    }

    if (recentDaySignatures.has(currentSignature)) {
        daySignatureUnresolved = true;
    }

    if (
        changedSlots.length === 0 &&
        dateVariedSlots.length === 0 &&
        similarityAdjustedSlots.length === 0 &&
        similarityUnresolvedSlots.length === 0 &&
        !daySignatureAdjusted &&
        !daySignatureUnresolved
    ) {
        return {
            plan: optimized,
            notes: [] as string[],
        };
    }

    const notes: string[] = [];
    const uniqueDateVaried = Array.from(new Set(dateVariedSlots));
    if (uniqueDateVaried.length > 0) {
        const labels = uniqueDateVaried.map((slot) => mealTypeLabel(slot));
        notes.push(`날짜별 메뉴 다양화 규칙으로 ${labels.join(', ')} 구성을 분산했어요.`);
    }

    const uniqueChanged = Array.from(new Set(changedSlots));
    if (uniqueChanged.length > 0) {
        const labels = uniqueChanged.map((slot) => mealTypeLabel(slot));
        notes.push(`최근 ${recentWindow}일 중복 방지 규칙으로 ${labels.join(', ')} 메뉴를 자동 분산했어요.`);
    }

    const uniqueSimilarityAdjusted = Array.from(new Set(similarityAdjustedSlots));
    if (uniqueSimilarityAdjusted.length > 0) {
        const labels = uniqueSimilarityAdjusted.map((slot) => mealTypeLabel(slot));
        notes.push(`유사도 필터(72% 이상)로 ${labels.join(', ')} 메뉴를 재생성해 반복을 더 줄였어요.`);
    }

    const uniqueSimilarityUnresolved = Array.from(new Set(similarityUnresolvedSlots));
    if (uniqueSimilarityUnresolved.length > 0) {
        const labels = uniqueSimilarityUnresolved.map((slot) => mealTypeLabel(slot));
        notes.push(`메뉴 풀이 제한적이라 ${labels.join(', ')}은 일부 유사 패턴이 남았어요. 다음 추천에서 후보군을 더 늘려 개선할게요.`);
    }

    if (daySignatureAdjusted) {
        notes.push(`최근 ${recentWindow}일과 같은 하루 조합이 나오지 않도록 식단 조합을 추가 분산했어요.`);
    }
    if (daySignatureUnresolved) {
        notes.push(`최근 ${recentWindow}일 내 동일한 하루 조합이 일부 남았어요. 다음 업데이트에서 후보군을 더 확장할게요.`);
    }

    return {
        plan: optimized,
        notes,
    };
}

function normalizeForMatch(input: string) {
    return input.toLowerCase().replace(/\s+/g, '').trim();
}

function parseCancerStageLevel(stage?: string) {
    if (!stage) {
        return null;
    }
    const normalized = stage.trim();
    const digitMatch = normalized.match(/([1-4])/);
    if (!digitMatch) {
        return null;
    }
    const parsed = Number(digitMatch[1]);
    return Number.isInteger(parsed) ? parsed : null;
}

const BREAST_PROFILE_KEYWORDS = ['유방', 'breast'];
const DIGESTIVE_PROFILE_KEYWORDS = [
    '위암',
    '위장',
    '위식도',
    '대장',
    '결장',
    '직장',
    '소장',
    '췌장',
    '식도',
    'gastric',
    'colon',
    'colorectal',
    'pancreas',
    'pancreatic',
    'esophageal',
];
const LUNG_PROFILE_KEYWORDS = ['폐', 'lung'];
const HEPATOBILIARY_PROFILE_KEYWORDS = ['간암', '간세포', 'liver', 'hepat', '담도', '담낭', 'biliary', 'gallbladder', 'cholangio'];
const HEMATOLOGIC_PROFILE_KEYWORDS = ['백혈병', '림프종', '골수종', '혈액', 'leukemia', 'lymphoma', 'myeloma', 'hematologic', 'haematologic'];
const THYROID_PROFILE_KEYWORDS = ['갑상선', 'thyroid', 'papillary', 'follicular'];
const KIDNEY_PROFILE_KEYWORDS = ['신장', '신세포', '신우', 'kidney', 'renal'];
const CERVICAL_PROFILE_KEYWORDS = ['자궁경부', '경부암', 'cervical'];

function findMatchedKeyword(cancerTypeNormalized: string, keywords: string[]) {
    return keywords.find((keyword) => cancerTypeNormalized.includes(keyword)) ?? null;
}

export function detectCancerProfileMatch(cancerType?: string): CancerProfileMatch | null {
    const cancerTypeNormalized = normalizeForMatch(cancerType ?? '');
    if (!cancerTypeNormalized) {
        return null;
    }

    const profileChecks: Array<{ profileLabel: string; keywords: string[] }> = [
        { profileLabel: '유방암', keywords: BREAST_PROFILE_KEYWORDS },
        { profileLabel: '소화기계 암', keywords: DIGESTIVE_PROFILE_KEYWORDS },
        { profileLabel: '폐암', keywords: LUNG_PROFILE_KEYWORDS },
        { profileLabel: '간담도계 암', keywords: HEPATOBILIARY_PROFILE_KEYWORDS },
        { profileLabel: '혈액암', keywords: HEMATOLOGIC_PROFILE_KEYWORDS },
        { profileLabel: '갑상선암', keywords: THYROID_PROFILE_KEYWORDS },
        { profileLabel: '신장암', keywords: KIDNEY_PROFILE_KEYWORDS },
        { profileLabel: '자궁경부암', keywords: CERVICAL_PROFILE_KEYWORDS },
    ];

    for (const check of profileChecks) {
        const matchedKeyword = findMatchedKeyword(cancerTypeNormalized, check.keywords);
        if (matchedKeyword) {
            return {
                profileLabel: check.profileLabel,
                matchedKeyword,
            };
        }
    }

    return null;
}

function applyCancerTypeProfile(cancerType: string, addNote: (text: string) => void) {
    const matched = detectCancerProfileMatch(cancerType);
    if (!matched) return null;
    if (matched.profileLabel === '신장암') {
        addNote('신장암은 신기능 수치(eGFR/칼륨/인)에 따라 제한이 달라지므로, 검사 결과 기반 조정을 의료진과 확인해 주세요.');
    } else if (matched.profileLabel === '갑상선암') {
        addNote('갑상선암의 요오드 제한은 치료 방식에 따라 달라요. 별도 제한이 안내되었다면 그 지침을 우선해 주세요.');
    } else if (matched.profileLabel === '소화기계 암') {
        addNote('수술 범위와 현재 소화 상태에 따라 먹는 양과 식감을 조절해 주세요.');
    } else if (matched.profileLabel === '혈액암') {
        addNote('면역 상태에 따른 식품 위생·생식 제한은 담당 의료진의 안내를 우선해 주세요.');
    }
    return matched.profileLabel;
}

type MenuGuard = {
    lowSalt?: boolean;
    bland?: boolean;
    soft?: boolean;
    soreMouth?: boolean;
    diarrhea?: boolean;
    avoidRaw?: boolean;
    ensureProtein?: boolean;
    ensureVegetables?: boolean;
    lessSugar?: boolean;
};

const COOKED_VEGETABLES = ['애호박볶음', '당근나물', '무나물', '배추찜', '단호박찜', '양배추찜', '가지나물', '청경채볶음'];
const MILD_SOUPS = ['무맑은국', '두부맑은국', '맑은채소국', '애호박맑은국', '감자양파수프', '배추맑은국', '연두부국', '당근수프'];

function foodConflictsWithGuard(food: string, guard: MenuGuard) {
    const normalized = normalizeForMatch(food);
    if (guard.lowSalt && !normalized.includes('저염') && /김치|젓갈|장아찌|라면|찌개|햄|소시지|가공육/.test(normalized)) return true;
    if ((guard.bland || guard.soft || guard.diarrhea) && /매운|매콤|고추|불닭|마라|튀김|후라이드|프라이드|치킨|피자|삼겹살|베이컨/.test(normalized)) return true;
    if (guard.soreMouth && /레몬|새콤|식초|피클|토마토|키위|귤|오렌지|파인애플/.test(normalized)) return true;
    if ((guard.soft || guard.diarrhea) && /샐러드|스틱|견과|아몬드|호두|우엉|연근|해초/.test(normalized)) return true;
    if (guard.diarrhea && /요거트|우유|치즈|생크림|미역|콩나물|숙주/.test(normalized)) return true;
    if (guard.avoidRaw && !/익힌|숙회/.test(normalized) && /육회|날달걀|날계란|생굴|생연어|생선회|사시미|회덮밥|광어회|연어회|참치회|초밥/.test(normalized)) return true;
    if (guard.lessSugar && !/무가당|무당|저당/.test(normalized) && /가당|설탕|시럽|콜라|탄산음료|케이크|사탕|초콜릿/.test(normalized)) return true;
    return false;
}

function mainFitsGuard(main: string, guard: MenuGuard) {
    if (foodConflictsWithGuard(main, guard)) return false;
    if (guard.ensureProtein && !isCoreProteinFamily(proteinFamilyForMain(main))) return false;
    if (guard.soft && !/찜|죽|연두부|달걀|계란|스크램블|수육/.test(main)) return false;
    return true;
}

function chooseGuardedMain(plan: DayPlan, slot: MainSlot, guard: MenuGuard, candidates = MONTHLY_MEAL_CATALOG) {
    const slotIndex = MAIN_SLOTS.indexOf(slot);
    const used = new Set(MAIN_SLOTS.filter((key) => key !== slot).map((key) => plan[key].main));
    const suitable = candidates.filter((item) => mainFitsGuard(item.main, guard));
    const distinct = suitable.filter((item) => !used.has(item.main));
    const currentFamily = proteinFamilyForMain(plan[slot].main);
    const sameFamily = distinct.filter((item) => proteinFamilyForMain(item.main) === currentFamily);
    const usedFamilies = new Set(MAIN_SLOTS.filter((key) => key !== slot).map((key) => proteinFamilyForMain(plan[key].main)));
    const newFamily = distinct.filter((item) => !usedFamilies.has(proteinFamilyForMain(item.main)));
    // Preserve the day's protein groups when possible; safety takes priority
    // over variety when only a few dishes are suitable.
    const pool = sameFamily.length ? sameFamily : newFamily.length ? newFamily : distinct.length ? distinct : suitable;
    return pool[positiveModulo(calendarDayIndex(plan.date) * 3 + slotIndex, pool.length)]?.main;
}

function applyMenuGuard(plan: DayPlan, guard: MenuGuard) {
    const dayIndex = calendarDayIndex(plan.date);
    MAIN_SLOTS.forEach((slot, slotIndex) => {
        const meal = plan[slot];
        const before = JSON.stringify([meal.riceType, meal.main, meal.soup, meal.sides]);
        if (!mainFitsGuard(meal.main, guard)) {
            meal.main = chooseGuardedMain(plan, slot, guard) ?? meal.main;
        }
        if (hasIntegratedGrain(meal.main)) meal.riceType = '';
        else if (!meal.riceType || /생략/.test(meal.riceType)) meal.riceType = RICE_TYPES[positiveModulo(dayIndex * 3 + slotIndex, RICE_TYPES.length)];
        if ((guard.soft || guard.diarrhea) && meal.riceType) meal.riceType = guard.soft ? '진밥' : '흰쌀밥';
        if (foodConflictsWithGuard(meal.soup, guard)) {
            meal.soup = MILD_SOUPS[positiveModulo(dayIndex + slotIndex, MILD_SOUPS.length)];
        }
        const usedSides = new Set(meal.sides.filter((side) => !foodConflictsWithGuard(side, guard)));
        meal.sides = meal.sides.map((side, index) => {
            if (!foodConflictsWithGuard(side, guard)) return side;
            const pool = COOKED_VEGETABLES.filter((item) => !usedSides.has(item) && !foodConflictsWithGuard(item, guard));
            const replacement = pool[positiveModulo(dayIndex + slotIndex + index, pool.length)] ?? '';
            usedSides.add(replacement);
            return replacement;
        }).filter(Boolean);
        if (guard.ensureVegetables && !meal.sides.some((side) => /채소|샐러드|나물|브로콜리|배추|버섯|오이|당근|호박|가지|청경채|파프리카|연근|우엉/.test(side))) {
            meal.sides.push(COOKED_VEGETABLES[positiveModulo(dayIndex + slotIndex, COOKED_VEGETABLES.length)]);
        }
        if (JSON.stringify([meal.riceType, meal.main, meal.soup, meal.sides]) !== before) syncMealDetails(meal, slot);
    });
    const snack = plan.snack;
    const beforeSnack = JSON.stringify([snack.main, snack.soup, snack.sides]);
    const snackPool = SNACK_TEMPLATES.filter((item) => !foodConflictsWithGuard(item.main, guard) && !foodConflictsWithGuard(item.side, guard));
    const snackAlternative = snackPool[positiveModulo(dayIndex, snackPool.length)];
    if (foodConflictsWithGuard(snack.main, guard) && snackAlternative) snack.main = snackAlternative.main;
    snack.sides = snack.sides.map((side) => foodConflictsWithGuard(side, guard) ? snackAlternative?.side ?? '' : side).filter(Boolean);
    if (foodConflictsWithGuard(snack.soup, guard)) snack.soup = '물';
    snack.sides = Array.from(new Set(snack.sides)).filter((side) => side !== snack.main);
    if (JSON.stringify([snack.main, snack.soup, snack.sides]) !== beforeSnack) syncMealDetails(snack, 'snack');
}

export function optimizePlanByUserContext(plan: DayPlan, context: UserDietContext) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];
    const addNote = (text: string) => { if (!notes.includes(text)) notes.push(text); };
    const cancerProfile = applyCancerTypeProfile(context.cancerType ?? '', addNote);
    const conditionText = normalizeForMatch((context.additionalConditions ?? []).map((item) => `${item.name} ${item.code ?? ''}`).join(' '));
    const hasCondition = (keywords: string[]) => keywords.some((item) => conditionText.includes(normalizeForMatch(item)));
    const signals = normalizeForMatch((context.recentDietSignals ?? []).join(' '));
    const hasSignal = (keywords: string[]) => keywords.some((item) => signals.includes(normalizeForMatch(item)));

    // Cancer site, age and stage alone do not identify a tolerated texture or
    // a nutrient prescription. Preserve the varied menu until a constraint is known.
    if (context.age && context.age >= 65) addNote('씹기나 식사량에 불편이 있다면 컨디션에 기록해 주세요. 먹기 편한 메뉴로 조정할 수 있어요.');
    if (parseCancerStageLevel(context.cancerStage) !== null) addNote('암 기수만으로 특정 음식을 제한하지 않으며, 현재 증상과 안내받은 식사 지침을 우선해요.');
    const bmi = context.heightCm && context.weightKg && context.heightCm > 0 && context.weightKg > 0
        ? context.weightKg / Math.pow(context.heightCm / 100, 2) : null;
    if (bmi !== null && bmi < 18.5) addNote('체중과 식사량이 줄고 있다면 의료진과 상의하고, 먹을 수 있는 식사와 간식을 나누어 드세요.');
    if (bmi !== null && bmi >= 25) addNote('치료 중 체중 조절은 현재 영양 상태를 확인한 뒤 의료진과 목표를 정해 주세요.');

    const renal = cancerProfile === '신장암'
        || hasCondition(['신장', '신부전', '콩팥', '투석', '고칼륨', 'kidney', 'renal', 'dialysis', 'hyperkal', 'CKD'])
        || (context.additionalConditions ?? []).some((item) => /^(N0[0-8]|N1[7-9]|Z49|Z99\.?2|E87\.?5)/i.test(item.code ?? ''));
    if (renal) {
        addNote('신장 관련 질환은 신기능·투석 여부에 따라 단백질, 칼륨, 인, 수분 조절이 달라요. 제한량을 확인하기 전에는 자동으로 증감하지 않아요.');
        return { plan: optimized, notes };
    }

    const recent = context.recentDietPattern;
    const hasPattern = (key: keyof RecentDietPattern) => !!recent && recent.analyzedDays >= 4 && recent[key] >= (recent.analyzedDays >= 10 ? 4 : 3);
    const soreMouth = hasSignal(['구내염', '구강통증', '입안통증']);
    const soft = soreMouth || hasSignal(['씹기어려움', '저작곤란']);
    const nausea = hasSignal(['메스꺼움', '오심']);
    const diarrhea = hasSignal(['설사', '묽은변', '장염']);
    const activeTreatment = context.activeStageStatus === 'active' && ['chemo', 'chemo_2nd', 'radiation', 'immunotherapy'].includes(context.activeStageType ?? 'other');
    const guard: MenuGuard = {
        lowSalt: hasCondition(['고혈압', 'I10']) || hasPattern('highSodiumDays'),
        bland: nausea || diarrhea || hasPattern('spicyHeavyDays') || hasCondition(['고지혈증', '콜레스테롤', '지방간', '간염', 'E78', 'K76', 'K75']),
        soft, soreMouth, diarrhea,
        avoidRaw: activeTreatment || cancerProfile === '혈액암',
        ensureProtein: hasPattern('lowProteinDays'),
        ensureVegetables: hasPattern('lowVegetableDays'),
        lessSugar: hasPattern('highFlourSugarDays'),
    };
    applyMenuGuard(optimized, guard);
    if (guard.lowSalt) addNote('짠 메뉴가 포함된 경우 담백한 메뉴로 바꾸고, 국물과 양념의 양은 조절해 주세요.');
    if (guard.bland) addNote('기름지거나 자극적인 메뉴가 포함된 경우 담백한 조리로 바꿨어요.');
    if (soft) addNote('구강·씹기 불편에 맞춰 거칠거나 자극적인 메뉴를 부드러운 선택지로 바꿨어요.');
    if (nausea) addNote('메스꺼울 때는 냄새와 온도를 조절하고, 드실 수 있는 음식을 소량씩 나누어 드세요.');
    if (diarrhea) addNote('설사가 있을 때 불편을 주는 유제품·거친 재료·기름진 음식은 조절하고, 지속되면 의료진에게 알려 주세요.');
    if (hasSignal(['연하곤란', '삼키기어려움'])) addNote('삼키기 어렵다면 음식의 질감과 음료의 점도를 의료진에게 확인해 주세요. 일반 죽이나 맑은 국도 맞지 않을 수 있어요.');
    if (hasSignal(['식욕저하', '식욕부진']) || hasPattern('skippedMealDays')) addNote('식사량이 줄었다면 먹을 수 있는 메뉴를 소량씩 자주 드시고, 체중 변화를 의료진과 확인해 주세요.');
    if (hasSignal(['변비'])) addNote('변비가 있을 때는 수분·섬유소 섭취를 현재 치료와 장 상태에 맞춰 의료진과 확인해 주세요.');
    if (guard.ensureProtein || guard.ensureVegetables) addNote('최근 기록에 단백질·채소 식품 이름이 빠진 날이 있어요. 기록을 확인하고, 이미 포함된 메뉴는 다양하게 유지해요.');
    if (guard.avoidRaw) addNote('고기·생선·달걀은 속까지 익히고, 식품 위생과 개인별 생식 제한 지침을 따라 주세요.');
    if ((context.medicationSchedules ?? []).some((item) => item.name.trim())) addNote('약과 식사의 간격은 처방받은 복용 안내를 따라 주세요. 복용 시간만으로 메뉴를 바꾸지는 않아요.');
    return { plan: optimized, notes };
}

export function optimizePlanByPreference(plan: DayPlan, preferences: PreferenceType[]) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];
    const has = (key: PreferenceType) => preferences.includes(key);
    const dayIndex = calendarDayIndex(plan.date);
    const setMain = (slot: MainSlot, main: string) => {
        if (optimized[slot].main === main) return;
        optimized[slot].main = main;
        optimized[slot].riceType = hasIntegratedGrain(main) ? '' : optimized[slot].riceType || RICE_TYPES[positiveModulo(dayIndex + MAIN_SLOTS.indexOf(slot), RICE_TYPES.length)];
        syncMealDetails(optimized[slot], slot);
    };
    const preferFamily = (families: string[]) => {
        if (MAIN_SLOTS.some((slot) => families.includes(proteinFamilyForMain(optimized[slot].main)))) return;
        const pool = MONTHLY_MEAL_CATALOG.filter((item) => families.includes(proteinFamilyForMain(item.main)));
        const chosen = chooseGuardedMain(optimized, 'dinner', {}, pool);
        if (chosen) setMain('dinner', chosen);
    };

    // General preferences are suitability checks, not a new fixed daily menu.
    const soft = has('soft_food') || has('digestive');
    applyMenuGuard(optimized, {
        lowSalt: has('healthy') || has('low_salt'),
        bland: has('bland') || has('digestive') || has('healthy'),
        soft,
        ensureProtein: has('high_protein'),
        ensureVegetables: has('vegetable') || has('healthy'),
        lessSugar: has('healthy'),
    });
    if (has('healthy')) notes.push('곡류·단백질·채소가 이미 있는 식사는 유지하고, 짜거나 기름진 메뉴만 조정했어요.');
    if (soft) notes.push('부드러운 메뉴는 유지하고 씹기 부담스러운 메뉴만 바꿨어요.');
    if (has('high_protein')) notes.push('끼니마다 단백질 식품이 있는지 확인했어요. 필요한 양은 개인의 영양 상태에 따라 달라요.');
    if (has('vegetable')) notes.push('채소 반찬이 빠진 끼니를 보완하고 기존 반찬은 다양하게 유지했어요.');
    if (has('low_salt') || has('bland')) notes.push('담백한 메뉴는 유지하고, 양념과 국물의 양을 조절해 주세요.');
    if (has('weight_loss')) notes.push('치료 중에는 임의로 식사량을 줄이기보다 의료진과 체중 조절 목표를 먼저 확인해 주세요.');

    if (has('meat')) preferFamily(['chicken', 'beef', 'pork', 'duck']);
    if (has('beef')) preferFamily(['beef']);
    if (has('chicken')) preferFamily(['chicken']);
    if (has('fish')) preferFamily(['fish']);
    if (has('pork') && !MAIN_SLOTS.some((slot) => proteinFamilyForMain(optimized[slot].main) === 'pork')) {
        setMain('dinner', ['돼지안심수육', '돼지안심구이', '돼지고기채소찜'][positiveModulo(dayIndex, 3)]);
    }
    if (has('duck') && !MAIN_SLOTS.some((slot) => proteinFamilyForMain(optimized[slot].main) === 'duck')) {
        setMain('dinner', ['오리고기구이', '오리고기채소볶음'][positiveModulo(dayIndex, 2)]);
    }
    if (has('sashimi')) setMain('lunch', ['익힌 생선 숙회', '익힌 새우 숙회', '익힌 오징어 숙회'][positiveModulo(dayIndex, 3)]);
    if (has('sushi')) setMain('lunch', ['익힌 새우 초밥', '달걀 초밥', '익힌 생선 초밥'][positiveModulo(dayIndex, 3)]);
    if (has('noodle')) setMain('lunch', ['잔치국수(저염)', '닭고기쌀국수(저염)', '달걀우동(저염)'][positiveModulo(dayIndex, 3)]);
    if (has('pizza')) setMain('lunch', ['채소피자', '닭고기피자', '버섯피자'][positiveModulo(dayIndex, 3)]);
    if (has('sandwich')) setMain('lunch', ['달걀샌드위치', '닭가슴살샌드위치', '두부샌드위치'][positiveModulo(dayIndex, 3)]);
    if (has('fried_chicken')) setMain('dinner', '치킨');
    if (has('pizza') || has('sandwich') || has('fried_chicken') || has('noodle')) notes.push('원하는 메뉴를 한 끼에 반영했어요. 먹는 양은 컨디션에 맞추고 단백질·채소 반찬을 함께 준비해 주세요.');
    if (has('sashimi') || has('sushi')) notes.push('회·초밥 선호는 속까지 익힌 재료로 반영했어요.');
    if (has('warm_food') || has('soupy')) notes.push('기존 국·수프를 드실 수 있는 온도와 양으로 준비해 주세요.');
    if (has('cool_food')) notes.push('음식은 안전하게 보관하고, 드실 때 견디기 편한 온도로 맞춰 주세요.');
    if (has('sweet')) notes.push('기존 과일·간식을 활용하고 단맛은 드실 수 있는 정도로 조절해 주세요.');
    if (has('spicy')) notes.push('양념은 따로 준비해 드실 수 있는 만큼 넣어 주세요. 구강·소화 불편이 있으면 자극적인 양념을 줄여 주세요.');
    if (has('appetite_boost')) notes.push('현재 먹고 싶은 메뉴와 온도를 선택하고 소량씩 나누어 드셔도 좋아요.');
    // A specific food preference must not undo an explicitly requested texture.
    if (soft) applyMenuGuard(optimized, { soft: true, bland: true });
    return { plan: optimized, notes };
}

export function optimizePlanByMedications(plan: DayPlan, medications: string[]) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];
    const normalized = medications.map(normalizeForMatch).filter(Boolean);
    const hasMedication = (keywords: string[]) => normalized.some((item) => keywords.some((keyword) => item.includes(keyword)));
    if (hasMedication(['타목시펜', 'tamoxifen', '레트로졸', 'letrozole', '아나스트로졸', 'anastrozole', '엑세메스탄', 'exemestane', '팔보시클립', 'palbociclib', '리보시클립', 'ribociclib'])) {
        // A medicine name is not a reason to prescribe the same snack every day.
        // Remove only an actual grapefruit item; exact interactions remain drug-specific.
        (['breakfast', 'lunch', 'dinner', 'snack'] as const).forEach((slot) => {
            const meal = optimized[slot];
            const containsGrapefruit = (value: string) => /자몽|grapefruit/i.test(value);
            const before = JSON.stringify([meal.main, meal.soup, meal.sides]);
            if (containsGrapefruit(meal.main)) meal.main = slot === 'snack' ? '사과 조각' : chooseGuardedMain(optimized, slot, {}) ?? '';
            if (containsGrapefruit(meal.soup)) meal.soup = '물';
            meal.sides = meal.sides.filter((side) => !containsGrapefruit(side));
            if (JSON.stringify([meal.main, meal.soup, meal.sides]) !== before) syncMealDetails(meal, slot);
        });
        notes.push('약에 따라 자몽 등과 상호작용이 있을 수 있어요. 약별 음식 주의사항은 처방 안내나 약사에게 확인해 주세요.');
    }
    if (hasMedication(['덱사메타손', 'dexamethasone', '프레드니솔론', 'prednisolone', '프레드니손', 'prednisone', '스테로이드'])) {
        applyMenuGuard(optimized, { lowSalt: true, lessSugar: true });
        notes.push('스테로이드 복용 중 혈당·부종 관리가 필요하면 의료진과 상의하고, 짠 음식과 가당 음료의 양을 조절해 주세요.');
    }
    if (hasMedication(['와파린', 'warfarin', '쿠마딘', 'coumadin'])) {
        notes.push('와파린 복용 시 비타민 K가 있는 채소를 임의로 빼지 말고, 평소 섭취량이 크게 바뀌지 않도록 의료진·약사와 확인해 주세요.');
    }
    return { plan: optimized, notes };
}

export function getStageFoodGuides(stageType: StageType) {
    switch (stageType) {
        case 'chemo':
        case 'chemo_2nd':
            return {
                help: ['부드러운 단백질 음식', '따뜻한 수분', '자극이 적은 반찬'],
                caution: ['생식(회/육회/날달걀)', '너무 매운 음식', '기름진 튀김류'],
            };
        case 'radiation':
            return {
                help: ['수분 많은 음식', '부드러운 죽/국', '싱거운 반찬'],
                caution: ['뜨겁거나 거친 음식', '자극적인 양념', '과도한 카페인'],
            };
        case 'hormone_therapy':
            return {
                help: ['채소 반찬', '콩/두부류', '잡곡밥'],
                caution: ['당류가 높은 간식', '야식', '과도한 가공식품'],
            };
        case 'surgery':
            return {
                help: ['단백질 반찬', '수분 보충', '소화 쉬운 식사'],
                caution: ['짜고 자극적인 음식', '과식', '알코올'],
            };
        default:
            return {
                help: ['다양한 채소', '잡곡밥', '적당한 단백질 반찬'],
                caution: ['가당 음료·간식 과다', '지나치게 짠 음식', '불규칙한 식사'],
            };
    }
}

export function getSnackCoffeeTimingGuide(stageType: StageType) {
    if (stageType === 'chemo' || stageType === 'chemo_2nd') {
        return {
            snack: '간식은 점심 2~3시간 후(14시~16시)에 소량으로 드세요.',
            coffee: '커피는 필수가 아니며, 꼭 원할 때만 식후 1시간 뒤 연한 커피로 하루 1잔 이내를 권장해요.',
            tea: '차도 필수는 아니고, 원할 때 카페인 없는 종류(카모마일, 루이보스, 보리차)를 우선해 소량씩 드세요.',
        };
    }

    if (stageType === 'radiation') {
        return {
            snack: '간식은 15시 전후에 수분이 있는 음식으로 드세요.',
            coffee: '커피는 필수가 아니며, 꼭 원할 때 탈수 위험을 고려해 소량만 드시고 물을 함께 보충해 주세요.',
            tea: '차도 필수는 아니고, 원할 때 보리차·캐모마일 같은 무카페인 차를 선택해 수분을 보충해 주세요.',
        };
    }

    return {
        snack: '간식은 오후 3시 전후, 저당 간식 위주로 드세요.',
        coffee: '커피는 필수가 아니며, 꼭 원할 때 오전/점심 식후에 1잔 이내로 드시고 저녁에는 피하세요.',
        tea: '차도 필수는 아니고, 원할 때 카페인 없는 종류를 우선해 진하지 않게 따뜻한 온도로 드세요.',
    };
}

export function generatePlanForDate(
    dateKey: string,
    stageType: StageType,
    prevMonthScore: number,
    preferences: PreferenceType[] = []
): DayPlan {
    // Retained for call compatibility; a prior score does not justify restricting foods.
    void prevMonthScore;
    const dayIndex = calendarDayIndex(dateKey);
    const snackTemplate = SNACK_TEMPLATES[positiveModulo(dayIndex, SNACK_TEMPLATES.length)];
    const snack: MealSuggestion = {
        summary: '', riceType: '', main: snackTemplate.main, soup: snackTemplate.hydration,
        sides: [snackTemplate.side], cautionFlour: '간식은 드실 수 있는 양으로 준비해 주세요.',
        nutrient: { carb: 0, protein: 0, fat: 0 }, nutritionUnavailable: true,
        recipeName: '', recipeSteps: [],
    };
    syncMealDetails(snack, 'snack');
    const base: DayPlan = {
        date: dateKey,
        breakfast: buildScheduledMeal(dayIndex, 0, stageType),
        lunch: buildScheduledMeal(dayIndex, 1, stageType),
        dinner: buildScheduledMeal(dayIndex, 2, stageType),
        snack,
    };

    if (preferences.length === 0) {
        return base;
    }

    return optimizePlanByPreference(base, preferences).plan;
}

export function generateMonthPlans(
    year: number,
    monthZeroBased: number,
    stageType: StageType,
    prevMonthScore: number
): DayPlan[] {
    return monthDateKeys(year, monthZeroBased).map((dateKey) =>
        generatePlanForDate(dateKey, stageType, prevMonthScore)
    );
}

export function mealItemsFromSuggestion(meal: MealSuggestion, slot: MealSlot) {
    if (slot === 'snack') {
        return [meal.summary];
    }

    const base = [meal.riceType, meal.main, meal.soup, ...meal.sides].filter((item) => item.trim().length > 0);
    return Array.from(new Set(base));
}

export function mealTypeLabel(slot: MealSlot) {
    if (slot === 'breakfast') {
        return '아침';
    }
    if (slot === 'lunch') {
        return '점심';
    }
    if (slot === 'dinner') {
        return '저녁';
    }
    return '간식';
}

export function scoreToPercentile(score: number) {
    const normalized = clamp(score, 0, 100);
    return clamp(Math.round(35 + normalized * 0.6), 1, 99);
}
