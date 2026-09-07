import type { DayPlan, MealSlot, UserDietContext } from './dietEngine';

export const EATING_SYMPTOM_OPTIONS = [
    { value: 'poor_appetite', label: '입맛이 없어요' },
    { value: 'nausea', label: '속이 메스꺼워요' },
    { value: 'sore_mouth', label: '입안이 아파요' },
] as const;

export const AVOIDED_INGREDIENT_OPTIONS = [
    { value: 'dairy', label: '우유·유제품' },
    { value: 'egg', label: '달걀' },
    { value: 'soy', label: '콩·두부' },
    { value: 'wheat', label: '밀' },
    { value: 'nuts', label: '견과류' },
    { value: 'fish', label: '생선' },
    { value: 'shellfish', label: '갑각류·조개류' },
    { value: 'meat', label: '육류' },
] as const;

export type EatingSymptom = (typeof EATING_SYMPTOM_OPTIONS)[number]['value'];
export type AvoidedIngredient = (typeof AVOIDED_INGREDIENT_OPTIONS)[number]['value'];
export type FoodPersonalization = {
    symptoms: EatingSymptom[];
    texture: 'regular' | 'soft';
    avoidedIngredients: AvoidedIngredient[];
    updatedAt: string;
};

// Symptom guidance: NCI, Nutrition During Cancer and Weight Changes and Cancer.
export const PERSONALIZATION_GUIDANCE_URL = 'https://www.cancer.gov/about-cancer/treatment/side-effects/nutrition';

export function parseFoodPersonalization(raw: unknown): FoodPersonalization {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
    return {
        symptoms: EATING_SYMPTOM_OPTIONS.filter((option) =>
            Array.isArray(value.symptoms) && value.symptoms.includes(option.value)
        ).map((option) => option.value),
        texture: value.texture === 'soft' ? 'soft' : 'regular',
        avoidedIngredients: AVOIDED_INGREDIENT_OPTIONS.filter((option) =>
            Array.isArray(value.avoidedIngredients) && value.avoidedIngredients.includes(option.value)
        ).map((option) => option.value),
        updatedAt: typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))
            ? value.updatedAt : '',
    };
}

export function readFoodPersonalization(metadata: unknown): FoodPersonalization {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return parseFoodPersonalization(null);
    }
    const scoped = (metadata as Record<string, unknown>).iamfine;
    return parseFoodPersonalization(
        scoped && typeof scoped === 'object' && !Array.isArray(scoped)
            ? (scoped as Record<string, unknown>).foodPersonalization : null
    );
}

const INGREDIENT_KEYWORDS: Record<AvoidedIngredient, string[]> = {
    dairy: ['우유', '유제품', '요거트', '요구르트', '치즈', '버터', '크림', '라떼', '아이스크림', '분유', '유청', '그라탕', '밀크'],
    egg: ['달걀', '계란', '에그', '지단', '오믈렛', '오므라이스', '마요', '커스터드'],
    soy: ['콩', '두부', '두유', '된장', '청국장', '간장', '고추장', '춘장', '유부', '낫토', '미소'],
    wheat: ['밀', '빵', '면', '국수', '파스타', '스파게티', '수제비', '만두', '피자', '샌드위치', '햄버거', '토스트', '크래커', '쿠키', '케이크', '과자', '튀김', '돈가스', '돈까스', '전병', '부침', '팬케이크', '우동', '라멘', '짜장', '카레', '간장', '고추장'],
    nuts: ['견과', '땅콩', '아몬드', '호두', '잣', '캐슈', '피스타치오', '헤이즐넛', '피칸', '마카다미아'],
    fish: ['생선', '연어', '고등어', '흰살', '참치', '멸치', '가자미', '삼치', '갈치', '대구', '조기', '명태', '황태', '동태', '북어', '꽁치', '장어', '어묵', '액젓', '젓갈', '가쓰오', '굴비', '임연수', '코다리', '아귀', '광어', '우럭', '도미', '농어', '추어'],
    shellfish: ['새우', '조개', '바지락', '홍합', '전복', '가리비', '꼬막', '랍스터', '해물', '꽃게', '대게', '게살', '게장', '게맛살', '크랩', '굴국', '굴밥', '굴전', '굴찜', '굴소스', '굴죽', '석화', '대하'],
    meat: ['소고기', '쇠고기', '돼지', '닭', '오리', '육류', '육수', '육회', '육포', '불고기', '갈비', '안심', '등심', '삼겹', '차돌', '햄', '소시지', '베이컨', '미트', '치킨', '돈가스', '돈까스', '사골', '곰탕', '순대', '족발', '보쌈', '양고기', '제육', '목살', '대패', '함박', '스테이크', '탕수육', '동그랑땡', '곱창', '선지', '도가니', '설렁탕', '고기만두'],
};

// Menu-name screening supports preference matching, not allergy certification.
// Hidden ingredients, sauces, and cross-contact still require an ingredient check.
export function matchesAvoidedIngredient(name: string, avoided: AvoidedIngredient[]) {
    const normalized = name.toLowerCase().replace(/\s+/g, '');
    return avoided.some((ingredient) => INGREDIENT_KEYWORDS[ingredient]?.some((keyword) => normalized.includes(keyword)));
}

export function describeFoodPersonalization(settings: FoodPersonalization): string[] {
    return [
        ...EATING_SYMPTOM_OPTIONS.filter((option) => settings.symptoms.includes(option.value)).map((option) => option.label),
        ...(settings.texture === 'soft' ? ['부드러운 식사'] : []),
        ...(settings.avoidedIngredients.length > 0
            ? [`피할 재료 ${settings.avoidedIngredients.length}개`] : []),
    ];
}

type ClinicalDietContext = Pick<UserDietContext, 'additionalConditions' | 'cancerType'>;

export function hasRenalDietRestrictions(context?: ClinicalDietContext) {
    return /신장|신세포|신우|kidney|renal/i.test(context?.cancerType ?? '')
        || (context?.additionalConditions ?? []).some((condition) =>
            /신장|콩팥|투석|고칼륨|renal|kidney|dialysis|hyperkal/i.test(condition.name)
            || /^(N0[0-8]|N1[7-9]|Z49|Z99\.?2|E87\.?5)/i.test(condition.code ?? '')
        );
}

// Curated preparation options, not clinical nutrient-equivalent exchanges.
// Compatible incoming dishes are retained; these pools only replace conflicts.
const SOFT_MAINS = [
    '달걀찜', '연두부찜', '잘게 다진 닭안심찜', '흰살생선찜',
    '버섯달걀찜', '두부채소죽', '닭안심채소죽', '흰살생선죽',
    '단호박달걀찜', '연두부버섯찜', '닭안심버섯찜', '대구살채소찜',
    '연두부달걀찜', '두부버섯찜', '닭가슴살채소찜', '흰살생선두부찜',
    '달걀두부찜', '단호박두부찜', '닭죽', '대구살찜',
    '채소달걀죽', '고구마두부죽', '귀리닭죽', '연어두부찜',
    '달걀채소찜', '두부달걀찜', '닭안심찜', '연어채소찜',
    '연두부덮밥', '달걀죽', '순두부달걀찜', '두부죽',
];
const MILD_MAINS = [...SOFT_MAINS, '닭가슴살구이', '닭안심구이', '연어구이', '흰살생선구이', '두부구이'];
const SOFT_MAIN_FALLBACKS = ['부드러운 감자찜', '단호박찜', '으깬 고구마', '채소죽'];
const GENTLE_SOUPS = [
    '맑은 애호박국', '맑은 감자국', '맑은 무국', '맑은 채소국',
    '두부맑은국', '연두부국', '배추맑은국', '애호박맑은국',
    '단호박수프', '당근수프', '감자양파수프', '양배추수프',
    '닭안심채소수프', '양송이버섯수프', '브로콜리수프', '들깨버섯수프',
];
const SOFT_SIDES = [
    '부드럽게 익힌 당근', '부드럽게 익힌 애호박', '양배추찜', '배추찜',
    '으깬 단호박', '부드러운 감자찜', '브로콜리찜', '무나물',
    '잘게 다진 시금치나물', '가지찜', '연두부찜', '잘게 다진 버섯찜',
];
const GENTLE_SNACKS = [
    '달걀찜', '플레인 요거트', '연두부찜', '단호박찜', '무가당 요거트',
    '부드러운 감자찜', '그릭요거트', '오트밀죽', '으깬 고구마', '두부달걀찜',
];
const GENTLE_SNACK_SIDES = [
    '으깬 바나나', '껍질 벗겨 익힌 사과', '껍질 벗겨 익힌 배',
    '으깬 단호박', '으깬 고구마', '부드러운 감자찜',
];
const SOFT_PREPARATION = '씹기 편하도록 잘게 다지고 부드럽게 익혀 주세요.';
const NAUSEA_PREPARATION = '냄새가 불편하면 환기하고, 먹기 편한 온도로 드세요.';

function menuKey(name: string) {
    return name.replace(/\s+/g, '').replace(/\((?:저염|무염|담백한맛)\)/g, '').replace(/계란/g, '달걀').replace(/야채/g, '채소');
}

function mainIncludesGrain(name: string) {
    return /죽|미음|덮밥|볶음밥|비빔밥|국밥|초밥|김밥|주먹밥|국수|우동|파스타|리소토|피자|샌드위치/.test(name);
}

function dateSequence(dateKey: string) {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!parts) return 0;
    return Math.floor(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) / 86400000);
}

function syncChangedMeal(meal: DayPlan['breakfast'], slot: MealSlot, steps: string[]) {
    meal.nutritionUnavailable = true;
    meal.summary = (slot === 'snack' ? [meal.main, ...meal.sides, meal.soup] : [meal.riceType, meal.main, meal.soup])
        .filter((name) => name.trim()).join(' + ');
    meal.recipeName = meal.main ? `${meal.main} 준비하기` : '식사 구성 확인';
    meal.recipeSteps = steps;
}

export function applyFoodPersonalization(plan: DayPlan, settings: FoodPersonalization, context?: ClinicalDietContext) {
    const soft = settings.texture === 'soft' || settings.symptoms.includes('sore_mouth');
    const nausea = settings.symptoms.includes('nausea');
    const poorAppetite = settings.symptoms.includes('poor_appetite');
    const avoided = settings.avoidedIngredients;
    const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    // Renal nutrient limits require clinical context. Do not substitute foods,
    // but still remove known ingredient conflicts rather than bypassing them.
    if (hasRenalDietRestrictions(context)) {
        const notes = ['신장 관련 식사 제한은 검사 결과에 따라 달라요. 메뉴 자동 변경을 보류했으니, 불편한 증상과 피할 재료에 맞는 식사는 의료진과 정해 주세요.'];
        let changed = false;
        const retained = { ...plan };
        for (const slot of slots) {
            const original = plan[slot];
            const recipeConflict = original.recipeSteps.some((step) => matchesAvoidedIngredient(step, avoided));
            const hasConflict = [original.riceType, original.main, original.soup, ...original.sides]
                .some((name) => matchesAvoidedIngredient(name, avoided));
            if (!hasConflict && !recipeConflict) continue;
            const meal = { ...original, sides: original.sides.filter((name) => !matchesAvoidedIngredient(name, avoided)) };
            for (const key of ['riceType', 'main', 'soup'] as const) {
                if (matchesAvoidedIngredient(meal[key], avoided)) meal[key] = '';
            }
            syncChangedMeal(meal, slot, ['피할 재료를 뺀 뒤에는 대체 음식과 식사량을 의료진·영양사와 정해 주세요.']);
            retained[slot] = meal;
            changed = true;
        }
        if (changed) notes.push('피할 재료가 확인된 메뉴·조리법을 제외했어요. 남은 구성이 영양 요구량을 충족한다는 뜻은 아니며, 의료진 확인이 필요해요.');
        return { plan: changed ? retained : plan, notes };
    }
    if (!soft && !nausea && !poorAppetite && avoided.length === 0) return { plan, notes: [] as string[] };

    const notes: string[] = [];
    const adjusted = { ...plan };
    const dayOffset = dateSequence(plan.date);
    const usedMains = new Set<string>();
    const available = (candidates: string[]) => candidates.filter((name) => !matchesAvoidedIngredient(name, avoided));
    const compatible = (name: string, candidates: string[]) => candidates.some((candidate) => menuKey(candidate) === menuKey(name));
    const choose = (candidates: string[], fallback: string, offset: number, exclude = new Set<string>()) => {
        const allowed = available(candidates);
        const distinct = allowed.filter((name) => !exclude.has(menuKey(name)));
        const choices = distinct.length > 0 ? distinct : allowed;
        return choices.length > 0 ? choices[((offset % choices.length) + choices.length) % choices.length] : fallback;
    };
    const primaryMains = soft ? SOFT_MAINS : MILD_MAINS;
    const mainOptions = [...primaryMains, ...SOFT_MAIN_FALLBACKS];
    const replacementMains = available(primaryMains).length > 0 ? primaryMains : SOFT_MAIN_FALLBACKS;

    slots.forEach((slot, index) => {
        const original = plan[slot];
        const meal = { ...original, sides: [...original.sides], recipeSteps: [...original.recipeSteps] };
        const offset = dayOffset + index * 7;
        const symptomMeal = slot !== 'snack' && (soft || nausea);
        const symptomSnack = slot === 'snack' && (soft || nausea || poorAppetite);
        const needsMainChange = matchesAvoidedIngredient(meal.main, avoided)
            || (symptomMeal && (!compatible(meal.main, mainOptions) || usedMains.has(menuKey(meal.main))))
            || (symptomSnack && (!compatible(meal.main, GENTLE_SNACKS) || usedMains.has(menuKey(meal.main))));
        if (needsMainChange) {
            meal.main = choose(slot === 'snack' ? GENTLE_SNACKS : replacementMains, '부드러운 감자찜', offset, usedMains);
        }
        usedMains.add(menuKey(meal.main));
        if (symptomMeal) {
            if (soft && !mainIncludesGrain(meal.main) && !compatible(meal.riceType, ['진밥', '흰죽', '쌀죽', '쌀미음', '부드러운 죽'])) meal.riceType = '진밥';
            if (!compatible(meal.soup, GENTLE_SOUPS)) meal.soup = choose(GENTLE_SOUPS, '맑은 채소국', offset * 3);
            const usedSides = new Set<string>();
            meal.sides = meal.sides.map((name, sideIndex) => {
                const next = compatible(name, SOFT_SIDES) && !matchesAvoidedIngredient(name, avoided) && !usedSides.has(menuKey(name))
                    ? name : choose(SOFT_SIDES, '부드럽게 익힌 당근', offset + sideIndex * 5, usedSides);
                usedSides.add(menuKey(next));
                return next;
            });
        }
        if (symptomSnack) {
            meal.soup = '물';
            meal.sides = meal.sides.length > 0 ? meal.sides.map((name, sideIndex) =>
                compatible(name, GENTLE_SNACK_SIDES) ? name : choose(GENTLE_SNACK_SIDES, '으깬 바나나', offset + sideIndex)
            ) : [choose(GENTLE_SNACK_SIDES, '으깬 바나나', offset)];
        }
        if (matchesAvoidedIngredient(meal.riceType, avoided)) meal.riceType = soft ? '진밥' : '쌀밥';
        if (matchesAvoidedIngredient(meal.soup, avoided)) meal.soup = slot === 'snack' ? '물' : choose(GENTLE_SOUPS, '맑은 채소국', offset * 3);
        meal.sides = Array.from(new Set(meal.sides.map((name, sideIndex) => matchesAvoidedIngredient(name, avoided)
            ? choose(slot === 'snack' ? GENTLE_SNACK_SIDES : SOFT_SIDES, '부드럽게 익힌 당근', offset + sideIndex) : name)));
        // Run after ingredient replacements so porridge/noodle mains cannot
        // regain a separate rice dish through the soft-food or exclusion rules.
        if (slot !== 'snack' && mainIncludesGrain(meal.main)) meal.riceType = '';

        const menuChanged = meal.riceType !== original.riceType || meal.main !== original.main
            || meal.soup !== original.soup || meal.sides.join('|') !== original.sides.join('|');
        const recipeHasAvoidedIngredient = meal.recipeSteps.some((step) => matchesAvoidedIngredient(step, avoided));
        const needsSymptomPreparation = (soft && !meal.recipeSteps.includes(SOFT_PREPARATION))
            || (nausea && !meal.recipeSteps.includes(NAUSEA_PREPARATION));
        if (menuChanged || recipeHasAvoidedIngredient || needsSymptomPreparation) {
            syncChangedMeal(meal, slot, [
                [meal.main, ...meal.sides].filter(Boolean).join(', ') + '을 준비해 주세요.',
                '익혀 먹는 재료는 속까지 충분히 익혀 주세요.',
                ...(soft ? [SOFT_PREPARATION] : []),
                ...(settings.symptoms.includes('sore_mouth') ? ['맵고 신 양념은 빼고, 뜨겁지 않게 드세요.'] : []),
                ...(nausea ? [NAUSEA_PREPARATION] : []),
                ...(avoided.length > 0 ? ['양념·육수·제품 표시에도 피할 재료가 들어 있는지 확인해 주세요.'] : []),
            ]);
        }
        const appetiteGuidance = '한 번에 많이 먹기 어렵다면, 먹을 수 있는 양을 나누어 드세요.';
        if (poorAppetite && !meal.cautionFlour.includes(appetiteGuidance)) meal.cautionFlour = `${meal.cautionFlour} ${appetiteGuidance}`.trim();
        adjusted[slot] = meal;
    });
    if (soft) notes.push('부드러운 메뉴는 유지하고, 씹기 불편한 메뉴만 바꿨어요.');
    if (nausea) notes.push('담백한 메뉴는 유지하고, 메스꺼울 때 부담되는 메뉴를 바꿨어요.');
    if (poorAppetite) notes.push('입맛이 없을 때 먹기 편한 간식을 넣었어요. 조금씩 나누어 드세요.');
    if (avoided.length > 0) notes.push('피할 재료가 이름에 있는 메뉴를 바꿨어요. 양념과 알레르기 표시는 직접 확인해 주세요.');
    if (['egg', 'soy', 'dairy', 'fish', 'meat'].filter((item) => avoided.includes(item as AvoidedIngredient)).length >= 4) {
        notes.push('단백질 식품을 여러 가지 제외했어요. 영양사와 대체 식품을 정해 주세요.');
    }
    return { plan: adjusted, notes };
}
