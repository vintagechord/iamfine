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

export function applyFoodPersonalization(plan: DayPlan, settings: FoodPersonalization, context?: ClinicalDietContext) {
    const soft = settings.texture === 'soft' || settings.symptoms.includes('sore_mouth');
    const nausea = settings.symptoms.includes('nausea');
    const poorAppetite = settings.symptoms.includes('poor_appetite');
    const avoided = settings.avoidedIngredients;
    // Renal restrictions depend on labs and dialysis status. Preserve the caller's
    // condition-aware plan instead of introducing symptom fallback ingredients.
    if (hasRenalDietRestrictions(context)) {
        return {
            plan,
            notes: ['신장 관련 식사 제한은 검사 결과에 따라 달라요. 메뉴 자동 변경을 보류했으니, 불편한 증상과 피할 재료에 맞는 식사는 의료진과 정해 주세요.'],
        };
    }
    if (!soft && !nausea && !poorAppetite && avoided.length === 0) {
        return { plan, notes: [] as string[] };
    }

    const notes: string[] = [];
    const adjusted = { ...plan };
    const dayOffset = Number(plan.date.slice(-2)) || 0;
    const choose = (candidates: string[], fallback: string, offset: number) => {
        const available = candidates.filter((item) => !matchesAvoidedIngredient(item, avoided));
        return available.length > 0 ? available[offset % available.length] : fallback;
    };
    const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    slots.forEach((slot, index) => {
        const original = plan[slot];
        const meal = { ...original, sides: [...original.sides], recipeSteps: [...original.recipeSteps] };
        const offset = dayOffset + index;
        const main = choose(['달걀찜', '연두부찜', '잘게 다진 닭안심찜', '흰살생선찜'], '부드러운 감자찜', offset);
        if (slot !== 'snack' && (soft || nausea)) {
            meal.riceType = soft ? '진밥' : '쌀밥';
            meal.main = main;
            meal.soup = choose(['맑은 애호박국', '맑은 감자국', '맑은 무국'], '맑은 채소국', offset);
            meal.sides = ['부드럽게 익힌 당근', '부드럽게 익힌 애호박'];
        }
        if (slot === 'snack' && (soft || nausea || poorAppetite)) {
            meal.main = choose(['달걀찜', '플레인 요거트', '연두부찜'], '부드러운 감자찜', offset);
            meal.soup = '물';
            meal.sides = ['으깬 바나나'];
        }
        if (matchesAvoidedIngredient(meal.riceType, avoided)) meal.riceType = soft ? '진밥' : '쌀밥';
        if (matchesAvoidedIngredient(meal.main, avoided)) meal.main = slot === 'snack'
            ? choose(['플레인 요거트', '달걀찜', '연두부찜'], '부드러운 감자찜', offset) : main;
        if (matchesAvoidedIngredient(meal.soup, avoided)) meal.soup = slot === 'snack' ? '물' : '맑은 애호박국';
        meal.sides = Array.from(new Set(meal.sides.map((item) => matchesAvoidedIngredient(item, avoided)
            ? (slot === 'snack' ? '으깬 바나나' : '부드럽게 익힌 당근') : item)));

        const menuChanged = meal.riceType !== original.riceType || meal.main !== original.main
            || meal.soup !== original.soup || meal.sides.join('|') !== original.sides.join('|');
        const recipeHasAvoidedIngredient = meal.recipeSteps.some((step) => matchesAvoidedIngredient(step, avoided));
        if (menuChanged || recipeHasAvoidedIngredient) {
            meal.nutritionUnavailable = true;
            meal.summary = (slot === 'snack' ? [meal.main, ...meal.sides, meal.soup] : [meal.riceType, meal.main, meal.soup]).join(' + ');
            meal.recipeName = `${meal.main} 준비하기`;
            meal.recipeSteps = [
                `${meal.main}과 ${meal.sides.join(', ')}을 준비해 주세요.`,
                '익혀 먹는 재료는 속까지 충분히 익혀 주세요.',
                ...(soft ? ['씹기 편하도록 잘게 다지고 부드럽게 익혀 주세요.'] : []),
                ...(settings.symptoms.includes('sore_mouth') ? ['맵고 신 양념은 빼고, 뜨겁지 않게 드세요.'] : []),
                ...(nausea ? ['냄새가 불편하면 환기하고, 먹기 편한 온도로 드세요.'] : []),
                ...(avoided.length > 0 ? ['양념·육수·제품 표시에도 피할 재료가 들어 있는지 확인해 주세요.'] : []),
            ];
        }
        // Keep any condition-specific guidance carried by the original plan.
        const appetiteGuidance = '한 번에 많이 먹기 어렵다면, 먹을 수 있는 양을 나누어 드세요.';
        if (poorAppetite && !meal.cautionFlour.includes(appetiteGuidance)) {
            meal.cautionFlour = `${meal.cautionFlour} ${appetiteGuidance}`.trim();
        }
        adjusted[slot] = meal;
    });
    if (soft) notes.push('씹기 편한 부드러운 메뉴로 바꿨어요.');
    if (nausea) notes.push('메스꺼움을 고려해 맵고 기름진 메뉴를 줄였어요.');
    if (poorAppetite) notes.push('입맛이 없을 때 먹기 편한 간식을 넣었어요. 조금씩 나누어 드세요.');
    if (avoided.length > 0) notes.push('피할 재료가 이름에 있는 메뉴를 바꿨어요. 양념과 알레르기 표시는 직접 확인해 주세요.');
    if (['egg', 'soy', 'dairy', 'fish', 'meat'].filter((item) => avoided.includes(item as AvoidedIngredient)).length >= 4) {
        notes.push('단백질 식품을 여러 가지 제외했어요. 영양사와 대체 식품을 정해 주세요.');
    }
    return { plan: adjusted, notes };
}
