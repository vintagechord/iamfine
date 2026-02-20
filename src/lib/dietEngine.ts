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
    | 'pizza'
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
    { key: 'pizza', label: '피자', guide: '채소 중심의 가벼운 피자형 메뉴로 반영해요.' },
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
    { key: 'weight_loss', label: '체중감량(다이어트)', guide: '단백질을 유지하고 정제 탄수화물을 줄인 감량형 식단으로 조정해요.' },
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

const RICE_TYPES = ['현미밥', '잡곡밥', '귀리밥', '보리밥', '흑미밥', '기장밥'];
const PROTEIN_MAINS = ['닭가슴살구이', '연어구이', '두부조림', '달걀찜', '흰살생선찜', '콩불고기'];
const MEAT_MAINS = ['닭안심구이', '저지방 소고기볶음', '돼지안심수육'];
const SOUPS = ['맑은채소국', '저염 된장국', '단호박수프', '들깨버섯수프', '두부맑은국', '미역국(저염)'];
const SIDES = ['브로콜리찜', '버섯볶음', '시금치나물', '오이무침', '당근볶음', '애호박볶음'];
const SNACKS = ['무가당 요거트', '바나나 반 개', '찐고구마', '두유', '사과 조각', '아몬드 소량'];
const SNACK_FRUITS = ['사과 조각', '바나나 반 개', '배 조각', '키위', '딸기'];
const BREAKFAST_MAIN_VARIANTS = ['달걀두부찜', '달걀찜', '두부조림', '닭안심찜', '닭가슴살구이', '연두부덮밥', '흰살생선찜', '부드러운 죽'];
const LUNCH_MAIN_VARIANTS = ['연어구이', '닭가슴살구이', '두부조림', '닭안심찜', '흰살생선찜', '연두부덮밥', '고등어구이', '두부스테이크'];
const DINNER_MAIN_VARIANTS = ['닭가슴살구이', '흰살생선찜', '두부조림', '연어구이', '닭안심찜', '부드러운 죽', '달걀두부찜', '고등어구이'];
const SNACK_MAIN_VARIANTS = ['무가당 요거트', '그릭요거트', '무가당 두유', '찐고구마', '사과 조각', '바나나 반 개', '아몬드 소량', '베리류'];
const SNACK_SIDE_VARIANTS = ['사과 조각', '바나나 반 개', '베리류', '키위', '딸기', '배 조각', '아몬드 소량', '호두 소량'];
const SNACK_HYDRATION_VARIANTS = ['물', '따뜻한 물'];
const MEAL_SIMILARITY_THRESHOLD = 0.72;
const MEAL_REGEN_MAX_ATTEMPTS = 5;

const SEASONAL_FOOD: Record<number, string[]> = {
    1: ['배추', '무', '시금치'],
    2: ['브로콜리', '당근', '양배추'],
    3: ['달래', '냉이', '두릅'],
    4: ['아스파라거스', '미나리', '쑥'],
    5: ['오이', '상추', '완두콩'],
    6: ['애호박', '가지', '토마토'],
    7: ['옥수수', '오이', '복숭아'],
    8: ['가지', '토마토', '자두'],
    9: ['버섯', '배', '고구마'],
    10: ['단호박', '무', '사과'],
    11: ['브로콜리', '배추', '감'],
    12: ['무', '양배추', '귤'],
};

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
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

function baseMealNutrientByStage(stageType: StageType, mealType: '아침' | '점심' | '저녁' | '간식'): MealNutrient {
    if (mealType === '간식') {
        return { carb: 35, protein: 30, fat: 35 };
    }

    const stageSoft = stageType === 'chemo' || stageType === 'chemo_2nd' || stageType === 'radiation';
    const stageLowerCarb =
        stageType === 'hormone_therapy' ||
        stageType === 'medication' ||
        stageType === 'targeted' ||
        stageType === 'immunotherapy';

    // 저녁 탄수화물은 아침/점심 대비 단계적으로 낮춰 야간 과식·혈당 급상승을 줄이도록 조정.
    if (stageLowerCarb) {
        if (mealType === '아침') {
            return { carb: 36, protein: 34, fat: 30 };
        }
        if (mealType === '점심') {
            return { carb: 34, protein: 36, fat: 30 };
        }
        return { carb: 30, protein: 40, fat: 30 };
    }

    if (stageSoft) {
        if (mealType === '아침') {
            return { carb: 42, protein: 31, fat: 27 };
        }
        if (mealType === '점심') {
            return { carb: 40, protein: 33, fat: 27 };
        }
        return { carb: 36, protein: 35, fat: 29 };
    }

    if (mealType === '아침') {
        return { carb: 40, protein: 32, fat: 28 };
    }
    if (mealType === '점심') {
        return { carb: 38, protein: 34, fat: 28 };
    }
    return { carb: 34, protein: 36, fat: 30 };
}

function createMealSuggestion(
    seed: number,
    stageType: StageType,
    mealType: '아침' | '점심' | '저녁' | '간식',
    prevMonthScore: number,
    monthOneBased: number,
    fixedRiceType?: string
): MealSuggestion {
    const seasonalSet = SEASONAL_FOOD[monthOneBased] ?? ['채소'];
    const seasonal = seasonalSet[seed % seasonalSet.length];
    const riceType = fixedRiceType ?? RICE_TYPES[seed % RICE_TYPES.length];
    const isSnack = mealType === '간식';
    const main = isSnack ? SNACKS[seed % SNACKS.length] : PROTEIN_MAINS[(seed + 1) % PROTEIN_MAINS.length];
    const soup = isSnack ? '따뜻한 물' : SOUPS[(seed + 2) % SOUPS.length];
    const sideA = isSnack ? SNACK_FRUITS[(seed + 2) % SNACK_FRUITS.length] : `${seasonal} ${SIDES[(seed + 3) % SIDES.length]}`;
    const sideB = SIDES[(seed + 4) % SIDES.length];
    const sideC = SIDES[(seed + 5) % SIDES.length];

    const easierMenu = prevMonthScore < 60;
    const nutrient = baseMealNutrientByStage(stageType, mealType);

    const flourGuide = easierMenu
        ? '밀가루 음식은 주 2회 이하로 줄여보세요.'
        : '밀가루 음식은 가능한 한 적게 드세요.';

    const summary = isSnack ? `${main} + ${sideA} + ${soup}` : `${riceType} + ${main} + ${soup}`;
    const sides = isSnack ? [sideA] : [sideA, sideB, sideC];

    const recipe = isSnack ? buildSnackRecipe(main, sideA, soup) : buildRecipe(main, soup, sideA, seasonal);

    return {
        summary,
        riceType,
        main,
        soup,
        sides,
        cautionFlour: flourGuide,
        nutrient,
        recipeName: recipe.recipeName,
        recipeSteps: recipe.recipeSteps,
    };
}

function clonePlan(plan: DayPlan): DayPlan {
    return {
        date: plan.date,
        breakfast: { ...plan.breakfast, sides: [...plan.breakfast.sides], recipeSteps: [...plan.breakfast.recipeSteps] },
        lunch: { ...plan.lunch, sides: [...plan.lunch.sides], recipeSteps: [...plan.lunch.recipeSteps] },
        dinner: { ...plan.dinner, sides: [...plan.dinner.sides], recipeSteps: [...plan.dinner.recipeSteps] },
        snack: { ...plan.snack, sides: [...plan.snack.sides], recipeSteps: [...plan.snack.recipeSteps] },
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

export function applySevenDayNoRepeatRule(plan: DayPlan, recentPlans: DayPlan[], windowDays = 7) {
    const recentWindow = clamp(Math.round(windowDays), 1, 14);
    const recent = recentPlans.slice(-recentWindow);
    const optimized = clonePlan(plan);

    if (recent.length === 0) {
        return {
            plan: optimized,
            notes: [] as string[],
        };
    }

    const changedSlots: MealSlot[] = [];
    const similarityAdjustedSlots: MealSlot[] = [];
    const similarityUnresolvedSlots: MealSlot[] = [];
    const mainPools: Record<MealSlot, string[]> = {
        breakfast: BREAKFAST_MAIN_VARIANTS,
        lunch: LUNCH_MAIN_VARIANTS,
        dinner: DINNER_MAIN_VARIANTS,
        snack: SNACK_MAIN_VARIANTS,
    };

    (['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]).forEach((slot) => {
        const meal = mealBySlot(optimized, slot);
        const originalMain = meal.main;
        const originalSoup = meal.soup;
        const originalFirstSide = meal.sides[0] ?? '';
        const recentMainValues = new Set(recent.map((item) => mealBySlot(item, slot).main));
        const nextMain = pickNextNonRepeating(meal.main, mainPools[slot], recentMainValues);
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
                    meal.main = pickNextNonRepeatingWithOffset(meal.main, mainPools[slot], recentMainValues, attempt);
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

            if (
                meal.main !== originalMain ||
                meal.soup !== originalSoup ||
                (meal.sides[0] ?? '') !== originalFirstSide
            ) {
                changedSlots.push(slot);
            }
            return;
        }

        const recentSoupValues = new Set(recent.map((item) => mealBySlot(item, slot).soup));
        const nextSoup = pickNextNonRepeating(meal.soup, SOUPS, recentSoupValues);
        meal.soup = nextSoup;

        const firstSide = meal.sides[0] ?? SIDES[0];
        meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;
        const recipe = buildRecipe(meal.main, meal.soup, firstSide, seasonalFromSide(firstSide));
        meal.recipeName = recipe.recipeName;
        meal.recipeSteps = recipe.recipeSteps;

        let similarityScore = maxMealSimilarityAgainstRecent(meal, slot, recent);
        if (similarityScore >= MEAL_SIMILARITY_THRESHOLD) {
            for (let attempt = 1; attempt <= MEAL_REGEN_MAX_ATTEMPTS; attempt += 1) {
                meal.main = pickNextNonRepeatingWithOffset(meal.main, mainPools[slot], recentMainValues, attempt);
                meal.soup = pickNextNonRepeatingWithOffset(meal.soup, SOUPS, recentSoupValues, attempt);
                meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;

                const adjustedFirstSide = meal.sides[0] ?? SIDES[0];
                const adjustedRecipe = buildRecipe(meal.main, meal.soup, adjustedFirstSide, seasonalFromSide(adjustedFirstSide));
                meal.recipeName = adjustedRecipe.recipeName;
                meal.recipeSteps = adjustedRecipe.recipeSteps;

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

        if (meal.main !== originalMain || meal.soup !== originalSoup) {
            changedSlots.push(slot);
        }
    });

    if (changedSlots.length === 0 && similarityAdjustedSlots.length === 0 && similarityUnresolvedSlots.length === 0) {
        return {
            plan: optimized,
            notes: [] as string[],
        };
    }

    const notes: string[] = [];
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

function applyCancerTypeProfile(
    plan: DayPlan,
    cancerTypeNormalized: string,
    syncSummary: (meal: MealSuggestion) => void,
    addNote: (text: string) => void
) {
    if (!cancerTypeNormalized) {
        return null;
    }

    const breastMatched = findMatchedKeyword(cancerTypeNormalized, BREAST_PROFILE_KEYWORDS);
    if (breastMatched) {
        plan.breakfast.riceType = '현미밥';
        plan.lunch.riceType = '잡곡밥';
        plan.dinner.riceType = '현미밥';
        plan.breakfast.main = '달걀두부찜';
        plan.lunch.main = '연어구이';
        plan.dinner.main = '닭가슴살구이';
        plan.breakfast.sides = ['브로콜리찜', '버섯볶음', '당근볶음'];
        plan.lunch.sides = ['양배추볶음', '시금치나물', '오이무침'];
        plan.dinner.sides = ['구운채소', '버섯볶음', '저염 나물'];
        plan.snack.summary = '무가당 요거트 + 베리류 + 호두 소량';
        plan.snack.main = '무가당 요거트';
        plan.snack.soup = '물';
        plan.snack.sides = ['베리류', '호두 소량'];
        plan.snack.recipeName = '유방암 고려 간식 조합';
        plan.snack.recipeSteps = [
            '무가당 요거트를 1회 분량으로 담아 주세요.',
            '베리류와 호두를 소량 곁들여 주세요.',
            '당 함량이 높은 소스나 시럽은 피해주세요.',
        ];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote('암 종류(유방암)를 직접 반영해 저당·채소·생선/두부 중심으로 조정했어요.');
        return '유방암';
    }

    const digestiveMatched = findMatchedKeyword(cancerTypeNormalized, DIGESTIVE_PROFILE_KEYWORDS);
    if (digestiveMatched) {
        plan.breakfast.main = '부드러운 죽';
        plan.lunch.main = '연두부덮밥';
        plan.dinner.main = '흰살생선찜';
        plan.breakfast.soup = '단호박수프';
        plan.lunch.soup = '두부맑은국';
        plan.dinner.soup = '맑은채소국';
        plan.breakfast.sides = ['데친브로콜리', '애호박볶음', '저염 채소볶음'];
        plan.lunch.sides = ['담백한 두부무침', '버섯볶음', '저염 나물'];
        plan.dinner.sides = ['저염 채소무침', '시금치나물', '구운채소'];
        plan.snack.summary = '두유 + 바나나 반 개 + 따뜻한 물';
        plan.snack.main = '무가당 두유';
        plan.snack.soup = '따뜻한 물';
        plan.snack.sides = ['바나나 반 개'];
        plan.snack.recipeName = '소화기 암종 고려 간식 조합';
        plan.snack.recipeSteps = [
            '무가당 두유를 작은 컵에 준비해 주세요.',
            '바나나 반 개를 소량 곁들여 주세요.',
            '속이 불편하면 천천히 나눠 드세요.',
        ];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote(
            '암 종류(소화기 계열)를 반영해 부드럽고 소화가 편한 저자극 메뉴 중심으로 조정했어요.'
        );
        return '소화기계 암';
    }

    const lungMatched = findMatchedKeyword(cancerTypeNormalized, LUNG_PROFILE_KEYWORDS);
    if (lungMatched) {
        plan.breakfast.main = '달걀두부찜';
        plan.lunch.main = '닭안심찜';
        plan.dinner.main = '고등어구이';
        plan.breakfast.soup = '들깨버섯수프';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '미역국(저염)';
        plan.breakfast.sides = ['브로콜리찜', '버섯볶음', '당근볶음'];
        plan.lunch.sides = ['양배추볶음', '오이무침', '저염 나물'];
        plan.dinner.sides = ['구운채소', '시금치나물', '저염 버섯볶음'];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote('암 종류(폐암)를 반영해 수분·단백질 보강과 저자극 조합을 우선 배치했어요.');
        return '폐암';
    }

    const hepatobiliaryMatched = findMatchedKeyword(cancerTypeNormalized, HEPATOBILIARY_PROFILE_KEYWORDS);
    if (hepatobiliaryMatched) {
        plan.breakfast.riceType = '귀리밥';
        plan.lunch.riceType = '보리밥';
        plan.dinner.riceType = '현미밥';
        plan.breakfast.main = '닭안심찜';
        plan.lunch.main = '두부조림';
        plan.dinner.main = '흰살생선찜';
        plan.breakfast.soup = '두부맑은국';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '미역국(저염)';
        plan.breakfast.sides = ['데친브로콜리', '애호박볶음', '저염 채소볶음'];
        plan.lunch.sides = ['담백한 두부무침', '버섯볶음', '저염 나물'];
        plan.dinner.sides = ['구운채소', '시금치나물', '저염 버섯볶음'];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote(
            '암 종류(간·담도 계열)를 반영해 저염·저지방 조리 기준으로 조정했어요.'
        );
        return '간담도계 암';
    }

    const hematologicMatched = findMatchedKeyword(cancerTypeNormalized, HEMATOLOGIC_PROFILE_KEYWORDS);
    if (hematologicMatched) {
        plan.breakfast.main = '달걀두부찜';
        plan.lunch.main = '닭안심찜';
        plan.dinner.main = '흰살생선찜';
        plan.breakfast.soup = '두부맑은국';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '미역국(저염)';
        plan.breakfast.sides = ['데친브로콜리', '버섯볶음', '저염 채소볶음'];
        plan.lunch.sides = ['저염 나물', '구운채소', '오이무침'];
        plan.dinner.sides = ['애호박볶음', '시금치나물', '저염 버섯볶음'];
        plan.snack.summary = '무가당 요거트 + 사과 조각 + 따뜻한 물';
        plan.snack.main = '무가당 요거트';
        plan.snack.soup = '따뜻한 물';
        plan.snack.sides = ['사과 조각'];
        plan.snack.recipeName = '혈액암 고려 간식 조합';
        plan.snack.recipeSteps = [
            '무가당 요거트를 1회 분량으로 준비해 주세요.',
            '씻은 과일은 소량만 곁들여 주세요.',
            '익힌 메뉴 위주 식사를 유지해 주세요.',
        ];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote(
            '암 종류(혈액암 계열)를 반영해 익힌 음식 중심의 저자극 구성으로 조정했어요.'
        );
        return '혈액암';
    }

    const thyroidMatched = findMatchedKeyword(cancerTypeNormalized, THYROID_PROFILE_KEYWORDS);
    if (thyroidMatched) {
        plan.breakfast.main = '달걀두부찜';
        plan.lunch.main = '닭가슴살구이';
        plan.dinner.main = '두부조림';
        plan.breakfast.soup = '두부맑은국';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '단호박수프';
        plan.breakfast.sides = ['브로콜리찜', '당근볶음', '버섯볶음'];
        plan.lunch.sides = ['양배추볶음', '저염 나물', '구운채소'];
        plan.dinner.sides = ['애호박볶음', '버섯볶음', '오이무침'];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote('암 종류(갑상선암)를 반영해 담백한 조리 중심으로 조정했어요.');
        addNote('갑상선암은 치료 방식에 따라 요오드 제한 필요 여부가 달라질 수 있어, 해조류 제한은 의료진 지시를 우선해 주세요.');
        return '갑상선암';
    }

    const kidneyMatched = findMatchedKeyword(cancerTypeNormalized, KIDNEY_PROFILE_KEYWORDS);
    if (kidneyMatched) {
        plan.breakfast.riceType = '귀리밥';
        plan.lunch.riceType = '보리밥';
        plan.dinner.riceType = '현미밥';
        plan.breakfast.main = '닭안심찜';
        plan.lunch.main = '두부조림';
        plan.dinner.main = '흰살생선찜';
        plan.breakfast.soup = '두부맑은국';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '미역국(저염)';
        plan.breakfast.sides = ['저염 채소볶음', '버섯볶음', '오이무침'];
        plan.lunch.sides = ['담백한 두부무침', '양배추볶음', '저염 나물'];
        plan.dinner.sides = ['구운채소', '당근볶음', '저염 버섯볶음'];
        plan.snack.summary = '무가당 요거트 + 사과 조각 + 물';
        plan.snack.main = '무가당 요거트';
        plan.snack.soup = '물';
        plan.snack.sides = ['사과 조각'];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote('암 종류(신장암)를 반영해 저염·저자극 구성으로 조정했어요.');
        addNote('신장암은 신기능 수치(eGFR/칼륨/인)에 따라 제한이 달라지므로, 검사 결과 기반 조정을 의료진과 확인해 주세요.');
        return '신장암';
    }

    const cervicalMatched = findMatchedKeyword(cancerTypeNormalized, CERVICAL_PROFILE_KEYWORDS);
    if (cervicalMatched) {
        plan.breakfast.main = '달걀두부찜';
        plan.lunch.main = '닭안심찜';
        plan.dinner.main = '연어구이';
        plan.breakfast.soup = '들깨버섯수프';
        plan.lunch.soup = '맑은채소국';
        plan.dinner.soup = '두부맑은국';
        plan.breakfast.sides = ['브로콜리찜', '시금치나물', '당근볶음'];
        plan.lunch.sides = ['양배추볶음', '버섯볶음', '저염 나물'];
        plan.dinner.sides = ['구운채소', '오이무침', '저염 채소볶음'];
        syncSummary(plan.breakfast);
        syncSummary(plan.lunch);
        syncSummary(plan.dinner);
        addNote('암 종류(자궁경부암)을 반영해 단백질·채소 균형과 저자극 조합을 우선했어요.');
        return '자궁경부암';
    }

    return null;
}

export function optimizePlanByUserContext(plan: DayPlan, context: UserDietContext) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];

    const addNote = (text: string) => {
        if (!notes.includes(text)) {
            notes.push(text);
        }
    };

    const syncSummary = (meal: MealSuggestion) => {
        meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;
    };

    const age = context.age && context.age > 0 ? context.age : null;
    const validHeight = context.heightCm && context.heightCm > 0 ? context.heightCm : null;
    const validWeight = context.weightKg && context.weightKg > 0 ? context.weightKg : null;
    const bmi =
        validHeight && validWeight
            ? Number((validWeight / Math.pow(validHeight / 100, 2)).toFixed(1))
            : null;
    const cancerTypeNormalized = normalizeForMatch(context.cancerType ?? '');
    const cancerStageLevel = parseCancerStageLevel(context.cancerStage);
    const activeStageType = context.activeStageType ?? 'other';
    const isActiveTreatment = context.activeStageStatus === 'active';

    if (age !== null && age >= 65) {
        optimized.breakfast.main = '달걀두부찜';
        optimized.lunch.main = '닭안심찜';
        optimized.dinner.main = '흰살생선찜';
        optimized.breakfast.soup = '들깨버섯수프';
        optimized.lunch.soup = '두부맑은국';
        optimized.dinner.soup = '단호박수프';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        addNote('연령 정보를 반영해 씹기 쉽고 소화가 편한 메뉴 비중을 높였어요.');
    }

    if (bmi !== null && bmi < 18.5) {
        optimized.breakfast.main = '달걀두부찜';
        optimized.lunch.main = '닭가슴살구이';
        optimized.dinner.main = '연어구이';
        optimized.snack.summary = '그릭요거트 + 두유 + 바나나 반 개';
        optimized.snack.main = '그릭요거트';
        optimized.snack.soup = '물';
        optimized.snack.sides = ['두유', '바나나 반 개'];
        optimized.snack.recipeName = '체중 보완 간식 조합';
        optimized.snack.recipeSteps = [
            '그릭요거트를 작은 그릇에 담아 주세요.',
            '무가당 두유를 작은 컵으로 곁들여 주세요.',
            '바나나 반 개를 추가해 에너지를 보충해 주세요.',
        ];
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        addNote('키/몸무게 정보를 반영해 체중 유지에 도움되는 단백질·간식 구성을 보강했어요.');
    } else if (bmi !== null && bmi >= 25) {
        optimized.breakfast.riceType = '귀리밥';
        optimized.lunch.riceType = '보리밥';
        optimized.dinner.riceType = '현미밥';
        optimized.snack.summary = '무가당 요거트 + 베리류 + 견과류 소량';
        optimized.snack.main = '무가당 요거트';
        optimized.snack.soup = '물';
        optimized.snack.sides = ['베리류', '견과류 소량'];
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        addNote('키/몸무게 정보를 반영해 정제 탄수화물 비중을 줄인 곡류·간식으로 조정했어요.');
    }

    if (context.sex === 'female') {
        optimized.lunch.sides[0] = '브로콜리찜';
        optimized.dinner.sides[0] = '버섯볶음';
        addNote('성별 정보를 반영해 채소·단백질 균형 반찬을 우선 배치했어요.');
    } else if (context.sex === 'male') {
        optimized.lunch.sides[0] = '브로콜리찜';
        optimized.dinner.sides[1] = '시금치나물';
        addNote('성별 정보를 반영해 채소 반찬 다양성을 늘렸어요.');
    }

    if (context.ethnicity?.trim()) {
        const ethnicity = context.ethnicity.trim();
        addNote(`식습관 배경(${ethnicity})을 반영해 익숙한 밥·반찬 중심 구성을 유지했어요.`);
    }

    const matchedCancerProfile = applyCancerTypeProfile(optimized, cancerTypeNormalized, syncSummary, addNote);
    if (cancerTypeNormalized && !matchedCancerProfile) {
        addNote(
            `암 종류(${context.cancerType?.trim() ?? '미입력'}) 전용 규칙이 아직 없어 기본 안전식 + 치료 단계 기준으로 추천했어요.`
        );
    }

    if (cancerStageLevel !== null && cancerStageLevel >= 3) {
        optimized.breakfast.main = '부드러운 죽';
        optimized.lunch.main = '두부덮밥';
        optimized.dinner.main = '닭안심찜';
        optimized.breakfast.soup = '단호박수프';
        optimized.lunch.soup = '두부맑은국';
        optimized.dinner.soup = '들깨버섯수프';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        addNote('암 기수 정보를 반영해 자극을 낮추고 회복 중심 메뉴 비중을 높였어요.');
    }

    if (isActiveTreatment && (activeStageType === 'chemo' || activeStageType === 'chemo_2nd' || activeStageType === 'radiation')) {
        optimized.breakfast.soup = '두부맑은국';
        optimized.lunch.soup = '맑은채소국';
        optimized.dinner.soup = '단호박수프';
        optimized.lunch.sides[2] = '저염 나물';
        optimized.dinner.sides[2] = '저염 버섯볶음';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        addNote('현재 치료 단계 상태(진행중)를 반영해 속이 편한 저자극 메뉴로 보정했어요.');
    }

    const stageLabelNormalized = normalizeForMatch(context.activeStageLabel ?? '');
    if (
        context.activeStageOrder &&
        context.activeStageOrder >= 2 &&
        (stageLabelNormalized.includes('항암') || activeStageType === 'chemo' || activeStageType === 'chemo_2nd')
    ) {
        optimized.snack.summary = '무가당 요거트 + 바나나 반 개 + 따뜻한 물';
        optimized.snack.main = '무가당 요거트';
        optimized.snack.soup = '따뜻한 물';
        optimized.snack.sides = ['바나나 반 개'];
        optimized.snack.recipeName = '치료 단계 고려 간식 조합';
        optimized.snack.recipeSteps = [
            '무가당 요거트를 소량 준비해 주세요.',
            '바나나 반 개를 곁들여 부담을 줄여 주세요.',
            '따뜻한 물과 함께 천천히 드세요.',
        ];
        addNote('치료 단계 순서를 반영해 간식을 더 부드럽게 조정했어요.');
    }

    const schedules = (context.medicationSchedules ?? []).filter((item) => item.name.trim().length > 0);
    if (schedules.length > 0) {
        const timings = new Set(schedules.map((item) => item.timing));
        if (timings.has('breakfast')) {
            optimized.breakfast.soup = '두부맑은국';
            syncSummary(optimized.breakfast);
        }
        if (timings.has('lunch')) {
            optimized.lunch.soup = '맑은채소국';
            syncSummary(optimized.lunch);
        }
        if (timings.has('dinner')) {
            optimized.dinner.soup = '미역국(저염)';
            syncSummary(optimized.dinner);
        }
        addNote('복용 시기 정보를 반영해 약 복용 전후 부담이 적은 식사 구성으로 맞췄어요.');
    }

    return {
        plan: optimized,
        notes,
    };
}

export function optimizePlanByPreference(plan: DayPlan, preferences: PreferenceType[]) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];
    const has = (key: PreferenceType) => preferences.includes(key);
    const syncSummary = (meal: MealSuggestion) => {
        meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;
    };

    if (has('pizza')) {
        optimized.lunch.main = '통밀 또띠아 채소 피자';
        optimized.lunch.soup = '맑은채소국';
        optimized.lunch.sides = ['그린샐러드', '저당 피클', '구운채소'];
        syncSummary(optimized.lunch);
        optimized.lunch.recipeName = '통밀 또띠아 채소 피자';
        optimized.lunch.recipeSteps = [
            '통밀 또띠아 위에 토마토소스를 얇게 펴 주세요.',
            '채소와 저지방 단백질 토핑을 올려요.',
            '치즈는 소량만 사용하고 오븐에서 짧게 익혀요.',
            '맑은채소국과 함께 먹어 자극을 줄여요.',
        ];
        optimized.dinner.main = '두부스테이크';
        optimized.dinner.soup = '버섯수프';
        syncSummary(optimized.dinner);
        notes.push('피자 메뉴를 반영했어요. 같은 날 저녁은 가볍게 조정했어요.');
    }

    if (has('spicy')) {
        optimized.lunch.sides[0] = '저자극 매콤 두부무침';
        optimized.dinner.sides[0] = '고춧가루 소량 채소무침';
        notes.push('매운 맛은 유지하면서 자극은 줄인 양념으로 조정했어요.');
    }

    if (has('meat')) {
        optimized.dinner.main = MEAT_MAINS[0];
        syncSummary(optimized.dinner);
        notes.push('고기 메뉴는 기름이 적은 부위로 반영했어요.');
    }

    if (has('sweet')) {
        optimized.snack.summary = '무가당 요거트 + 제철 과일 + 견과류 소량';
        optimized.snack.main = '무가당 요거트';
        optimized.snack.sides = ['제철 과일', '견과류 소량'];
        optimized.snack.recipeName = '당이 낮은 간식 조합';
        optimized.snack.recipeSteps = [
            '무가당 요거트를 작은 그릇에 담아요.',
            '제철 과일을 작은 조각으로 추가해요.',
            '견과류는 한 줌 이내로 마무리해요.',
        ];
        notes.push('단맛 요청을 반영해 혈당 부담이 낮은 간식으로 바꿨어요.');
    }

    if (has('healthy')) {
        optimized.breakfast.riceType = '잡곡밥';
        optimized.lunch.riceType = '잡곡밥';
        optimized.dinner.riceType = '잡곡밥';
        optimized.breakfast.sides[1] = '데친브로콜리';
        optimized.lunch.sides[1] = '저염 나물모둠';
        optimized.dinner.sides[1] = '구운채소';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('건강식 방향으로 잡곡밥과 채소 반찬 비중을 높였어요.');
    }

    if (has('fish')) {
        optimized.lunch.main = '고등어구이';
        optimized.dinner.main = '흰살생선찜';
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('생선 메뉴를 늘려 단백질을 보강했어요.');
    }

    if (has('sashimi')) {
        optimized.lunch.main = '익힌 생선 숙회무침';
        optimized.lunch.sides[0] = '저염 해초무침';
        syncSummary(optimized.lunch);
        notes.push('회 느낌은 생식 대신 안전한 익힘 메뉴로 바꿨어요.');
    }

    if (has('sushi')) {
        optimized.lunch.main = '익힌 생선 초밥(저염)';
        optimized.lunch.sides[2] = '따뜻한 미소수프';
        syncSummary(optimized.lunch);
        notes.push('초밥 느낌은 익힌 재료 위주로 안전하게 반영했어요.');
    }

    if (has('cool_food')) {
        optimized.lunch.soup = '오이냉국(저염)';
        optimized.snack.summary = '시원한 두유 + 과일 조각';
        optimized.snack.main = '시원한 두유';
        optimized.snack.soup = '물';
        optimized.snack.sides = ['제철 과일'];
        optimized.snack.recipeName = '시원한 간식 조합';
        optimized.snack.recipeSteps = [
            '시원한 두유를 작은 컵 1잔으로 준비해요.',
            '제철 과일은 한 줌 이내로 곁들여요.',
            '차가운 간식 뒤에는 물을 조금 더 마셔 주세요.',
        ];
        syncSummary(optimized.lunch);
        notes.push('시원한 음식 요청을 반영하되 자극은 낮췄어요.');
    }

    if (has('warm_food')) {
        optimized.breakfast.soup = '들깨버섯수프';
        optimized.lunch.soup = '두부맑은국';
        optimized.dinner.soup = '단호박수프';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('따뜻한 국·수프 중심으로 구성했어요.');
    }

    if (has('soft_food')) {
        optimized.breakfast.main = '두부달걀찜';
        optimized.lunch.main = '연두부덮밥';
        optimized.dinner.main = '흰살생선찜';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('씹기 편한 부드러운 메뉴를 중심으로 조정했어요.');
    }

    if (has('soupy')) {
        optimized.breakfast.soup = '미역국(저염)';
        optimized.lunch.soup = '맑은채소국';
        optimized.dinner.soup = '두부맑은국';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('국물 음식은 저염 기준으로 반영했어요.');
    }

    if (has('high_protein')) {
        optimized.breakfast.main = '달걀두부찜';
        optimized.lunch.main = '닭가슴살구이';
        optimized.dinner.main = '연어구이';
        optimized.snack.summary = '그릭요거트 + 두유';
        optimized.snack.main = '그릭요거트';
        optimized.snack.soup = '물';
        optimized.snack.sides = ['두유'];
        optimized.snack.recipeName = '단백질 보강 간식';
        optimized.snack.recipeSteps = [
            '그릭요거트를 1회 분량으로 담아 주세요.',
            '무가당 두유를 작은 컵으로 곁들여요.',
            '당 함량이 높은 토핑은 생략하고 담백하게 드세요.',
        ];
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('단백질 보충을 위해 닭·생선·두부 비중을 높였어요.');
    }

    if (has('vegetable')) {
        optimized.breakfast.sides = ['브로콜리찜', '시금치나물', '당근볶음'];
        optimized.lunch.sides = ['양배추볶음', '버섯볶음', '오이무침'];
        optimized.dinner.sides = ['애호박볶음', '시금치나물', '구운채소'];
        notes.push('채소 반찬 종류를 더 다양하게 넣었어요.');
    }

    if (has('bland')) {
        optimized.breakfast.sides[0] = '저염 나물무침';
        optimized.lunch.sides[0] = '담백한 두부무침';
        optimized.dinner.sides[0] = '담백한 채소무침';
        notes.push('강한 양념을 줄이고 담백하게 조정했어요.');
    }

    if (has('appetite_boost')) {
        optimized.lunch.sides[2] = '새콤한 무피클(저염)';
        optimized.dinner.sides[2] = '레몬채소무침';
        notes.push('입맛을 돕는 새콤한 반찬을 소량 추가했어요.');
    }

    if (has('digestive')) {
        optimized.breakfast.main = '부드러운 죽';
        optimized.lunch.main = '두부덮밥';
        optimized.dinner.main = '닭안심찜';
        optimized.breakfast.soup = '단호박수프';
        optimized.dinner.soup = '들깨버섯수프';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('속이 편한 소화 중심 메뉴로 조정했어요.');
    }

    if (has('low_salt')) {
        optimized.breakfast.soup = '두부맑은국';
        optimized.lunch.soup = '맑은채소국';
        optimized.dinner.soup = '미역국(저염)';
        optimized.breakfast.sides[2] = '저염 채소볶음';
        optimized.lunch.sides[2] = '저염 나물';
        optimized.dinner.sides[2] = '저염 버섯볶음';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('저염식 기준으로 국·반찬 간을 낮췄어요.');
    }

    if (has('noodle')) {
        optimized.lunch.main = '잔치국수(저염)';
        optimized.lunch.soup = '멸치육수국(저염)';
        optimized.lunch.sides = ['데친채소', '달걀지단', '두부무침'];
        syncSummary(optimized.lunch);
        notes.push('면 요리는 자극을 줄인 저염 방식으로 반영했어요.');
    }

    if (has('weight_loss')) {
        optimized.breakfast.riceType = '현미밥(소량)';
        optimized.lunch.riceType = '잡곡밥(소량)';
        optimized.dinner.riceType = '현미밥(소량)';
        optimized.breakfast.main = '달걀두부찜';
        optimized.lunch.main = '닭가슴살구이';
        optimized.dinner.main = '흰살생선찜';
        optimized.breakfast.sides = ['브로콜리찜', '버섯볶음', '당근볶음'];
        optimized.lunch.sides = ['양배추볶음', '저염 나물', '구운채소'];
        optimized.dinner.sides = ['애호박볶음', '버섯볶음', '오이무침'];
        optimized.breakfast.nutrient = { carb: 30, protein: 45, fat: 25 };
        optimized.lunch.nutrient = { carb: 28, protein: 47, fat: 25 };
        optimized.dinner.nutrient = { carb: 24, protein: 48, fat: 28 };
        optimized.snack.summary = '그릭요거트 + 베리류 + 아몬드 소량';
        optimized.snack.main = '그릭요거트';
        optimized.snack.soup = '물';
        optimized.snack.sides = ['베리류', '아몬드 소량'];
        optimized.snack.nutrient = { carb: 22, protein: 43, fat: 35 };
        optimized.snack.recipeName = '체중감량형 간식 조합';
        optimized.snack.recipeSteps = [
            '그릭요거트를 1회 분량으로 담아 주세요.',
            '베리류를 한 줌 이내로 곁들여 주세요.',
            '아몬드는 5~6알 이내로 추가해 주세요.',
        ];
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('체중감량 방향을 반영해 저녁 탄수화물 비율을 더 낮추고 단백질 중심으로 조정했어요.');
    }

    return {
        plan: optimized,
        notes,
    };
}

export function optimizePlanByMedications(plan: DayPlan, medications: string[]) {
    const optimized = clonePlan(plan);
    const notes: string[] = [];

    if (medications.length === 0) {
        return {
            plan: optimized,
            notes,
        };
    }

    const normalizedMedications = medications
        .map((item) => item.toLowerCase().replace(/\s+/g, '').trim())
        .filter(Boolean);
    const hasMedication = (keywords: string[]) =>
        normalizedMedications.some((medication) => keywords.some((keyword) => medication.includes(keyword)));
    const syncSummary = (meal: MealSuggestion) => {
        meal.summary = `${meal.riceType} + ${meal.main} + ${meal.soup}`;
    };

    const hormoneOrTargetedKeywords = [
        '타목시펜',
        'tamoxifen',
        '레트로졸',
        'letrozole',
        '아나스트로졸',
        'anastrozole',
        '엑세메스탄',
        'exemestane',
        '팔보시클립',
        'palbociclib',
        '리보시클립',
        'ribociclib',
    ];

    if (hasMedication(hormoneOrTargetedKeywords)) {
        optimized.snack.summary = '무가당 요거트 + 베리류 + 호두 소량';
        optimized.snack.main = '무가당 요거트';
        optimized.snack.soup = '따뜻한 물';
        optimized.snack.sides = ['베리류', '호두 소량'];
        optimized.snack.recipeName = '약물치료 고려 간식 조합';
        optimized.snack.recipeSteps = [
            '무가당 요거트를 작은 그릇에 담아 주세요.',
            '베리류를 한 줌 정도 추가해 주세요.',
            '호두는 소량(4~5알)만 곁들여 주세요.',
            '자몽·자몽주스는 피하고 물을 함께 드세요.',
        ];
        notes.push('복용 약을 고려해 간식을 저당·저자극 조합으로 조정했어요.');
    }

    const steroidKeywords = [
        '덱사메타손',
        'dexamethasone',
        '프레드니솔론',
        'prednisolone',
        '프레드니손',
        'prednisone',
        '스테로이드',
    ];

    if (hasMedication(steroidKeywords)) {
        optimized.breakfast.soup = '두부맑은국';
        optimized.lunch.soup = '맑은채소국';
        optimized.dinner.soup = '미역국(저염)';
        optimized.breakfast.sides[2] = '저염 채소볶음';
        optimized.lunch.sides[2] = '저염 나물';
        optimized.dinner.sides[2] = '저염 버섯볶음';
        syncSummary(optimized.breakfast);
        syncSummary(optimized.lunch);
        syncSummary(optimized.dinner);
        notes.push('복용 약을 고려해 염분과 당 부담이 적은 구성으로 조정했어요.');
    }

    const anticoagulantKeywords = ['와파린', 'warfarin', '쿠마딘', 'coumadin'];
    if (hasMedication(anticoagulantKeywords)) {
        const normalizeSides = (sides: string[]) =>
            sides.map((side) => {
                if (side.includes('시금치')) {
                    return '버섯볶음';
                }
                return side;
            });

        optimized.breakfast.sides = normalizeSides(optimized.breakfast.sides);
        optimized.lunch.sides = normalizeSides(optimized.lunch.sides);
        optimized.dinner.sides = normalizeSides(optimized.dinner.sides);
        notes.push('복용 약을 고려해 특정 채소 섭취량이 급격히 바뀌지 않도록 반찬을 완만하게 조정했어요.');
    }

    return {
        plan: optimized,
        notes,
    };
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
                caution: ['밀가루/당류 과다', '지나치게 짠 음식', '야식 습관'],
            };
    }
}

export function getSnackCoffeeTimingGuide(stageType: StageType) {
    if (stageType === 'chemo' || stageType === 'chemo_2nd') {
        return {
            snack: '간식은 점심 2~3시간 후(14시~16시)에 소량으로 드세요.',
            coffee: '커피는 식후 1시간 뒤, 하루 1잔 이내로 줄여보세요.',
        };
    }

    if (stageType === 'radiation') {
        return {
            snack: '간식은 15시 전후에 수분이 있는 음식으로 드세요.',
            coffee: '카페인은 탈수를 줄이기 위해 물과 함께 드세요.',
        };
    }

    return {
        snack: '간식은 오후 3시 전후, 저당 간식 위주로 드세요.',
        coffee: '커피는 오전/점심 식후에 마시고 저녁에는 피하세요.',
    };
}

export function generatePlanForDate(
    dateKey: string,
    stageType: StageType,
    prevMonthScore: number,
    preferences: PreferenceType[] = []
): DayPlan {
    const [year, month, day] = dateKey.split('-').map(Number);
    const seed = day + month * 37 + year;
    const dayRiceType = RICE_TYPES[(seed + 11) % RICE_TYPES.length];

    const base: DayPlan = {
        date: dateKey,
        breakfast: createMealSuggestion(seed + 1, stageType, '아침', prevMonthScore, month, dayRiceType),
        lunch: createMealSuggestion(seed + 2, stageType, '점심', prevMonthScore, month, dayRiceType),
        dinner: createMealSuggestion(seed + 3, stageType, '저녁', prevMonthScore, month, dayRiceType),
        snack: createMealSuggestion(seed + 4, stageType, '간식', prevMonthScore, month),
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
    return '간식/커피';
}

export function scoreToPercentile(score: number) {
    const normalized = clamp(score, 0, 100);
    return clamp(Math.round(35 + normalized * 0.6), 1, 99);
}
