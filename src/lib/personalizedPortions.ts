import type { DayPlan, MealSlot, UserDietContext } from './dietEngine';
import type { FoodPersonalization } from './personalization';
import { estimateMealNutrition } from './mealNutrition.ts';

export type PortionRange = { min: number; max: number };
export type PortionItem = {
    name: string;
    minGrams: number;
    maxGrams: number;
    exampleGrams: number;
    adjusted: boolean;
};
export type MealPortions = {
    items: PortionItem[];
    gramsByFood: Record<string, number>;
    energyRange: PortionRange | null;
};
export type PortionSource = { title: string; url: string; detail: string };
export type PersonalizedPortions = {
    status: 'ready' | 'needs_profile' | 'needs_review' | 'incomplete_menu';
    reason: string;
    profileSummary: string[];
    dailyEnergyRange: PortionRange | null;
    // ESPEN's lower boundary is OPEN: more than 1 g/kg/day, not at least 1.
    // Consumers must label min as "초과" rather than silently making it inclusive.
    dailyProteinRange: PortionRange | null;
    meals: Record<MealSlot, MealPortions>;
    notes: string[];
    sources: PortionSource[];
};

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SOURCES: PortionSource[] = [
    {
        title: 'ESPEN 성인 암 영양 실무지침 (2021)',
        url: 'https://www.espen.org/files/ESPEN-Guidelines/ESPEN-practical-guideline-clinical-nutrition-in-cancer.pdf#page=2',
        detail: '권고 1–4: 영양 상태 평가, 하루 25–30 kcal/kg, 단백질 1 g/kg 초과·가능하면 1.5 g/kg까지.',
    },
    {
        title: 'ESPEN 암 영양 지침 (2017)',
        url: 'https://www.espen.org/files/ESPEN-Guidelines/ESPEN_guidelines_on_nutrition_in_cancer_patients.pdf#page=10',
        detail: 'B2-1: 단순 체중식은 비만에서 과대, 심한 영양불량에서 과소 추정할 수 있어요.',
    },
    {
        title: 'NICE 성인 영양지원 지침',
        url: 'https://www.nice.org.uk/guidance/CG32/chapter/recommendations',
        detail: '1.3, 1.4, 1.6: 저체중·체중 감소·섭취 부족·재급식 위험·삼킴 문제의 개별 평가.',
    },
    {
        title: 'KDIGO 만성콩팥병 지침 (2024)',
        url: 'https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf#page=42',
        detail: '3.3.1: 신기능·영양 상태에 따른 단백질 조절이 필요하며 암 기준을 일괄 적용하지 않아요.',
    },
    {
        title: 'NCI 암환자 영양 관리',
        url: 'https://www.cancer.gov/about-cancer/treatment/side-effects/appetite-loss/nutrition-hp-pdq',
        detail: 'Malnutrition, Significant Weight Loss: 높은 BMI도 영양불량을 가릴 수 있고 부종·복수는 체중에 영향을 줘요.',
    },
];

// Product limits on scaling a representative recipe, NOT medical portion or
// energy limits. Do not clamp a patient's energy range to fit these bounds.
const MIN_EXAMPLE_SCALE = 0.5;
const MAX_EXAMPLE_SCALE = 2;

function isPositiveFinite(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function emptyMeals(): Record<MealSlot, MealPortions> {
    const emptyMeal = (): MealPortions => ({ items: [], gramsByFood: {}, energyRange: null });
    return {
        breakfast: emptyMeal(), lunch: emptyMeal(), dinner: emptyMeal(), snack: emptyMeal(),
    };
}

function describeProfile(context: UserDietContext): string[] {
    const { age, heightCm, weightKg } = context;
    const labels: string[] = [];
    if (typeof age === 'number' && Number.isFinite(age) && age >= 0) labels.push(`${age}세`);
    if (context.sex === 'female') labels.push('여성');
    if (context.sex === 'male') labels.push('남성');
    if (context.sex === 'other') labels.push('성별 기타');
    if (isPositiveFinite(heightCm)) labels.push(`${heightCm} cm`);
    if (isPositiveFinite(weightKg)) labels.push(`${weightKg} kg`);
    if (isPositiveFinite(heightCm) && isPositiveFinite(weightKg)) {
        const bmi = weightKg / (heightCm / 100) ** 2;
        if (Number.isFinite(bmi)) labels.push(`BMI ${bmi.toFixed(1)}`);
    }
    if (context.cancerType?.trim()) labels.push(context.cancerType.trim());
    if (context.activeStageLabel?.trim()) labels.push(context.activeStageLabel.trim());
    return labels;
}

/** Positive text signals only support deferral; they cannot diagnose or exclude
 * a condition. In particular, absent history is never proof of stable weight,
 * normal renal function, or freedom from refeeding risk. Avoid interpreting
 * simple explicit negatives such as "부종 없음" or "no CKD" as positive reports.
 */
function reports(texts: string[], expression: RegExp): boolean {
    return texts.some((raw) => {
        const text = raw.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        for (const match of text.matchAll(new RegExp(expression.source, 'gi'))) {
            const before = text.slice(0, match.index);
            const after = text.slice(match.index + match[0].length);
            if (/^(?:은|는|이|가)?(?:없|아님|아니|음성)/.test(after)) continue;
            if (/(?:^|[,;:])(?:no|without|denies)$/.test(before)) continue;
            return true;
        }
        return false;
    });
}

function clinicalReviewReason(context: UserDietContext): string | null {
    const conditions = context.additionalConditions ?? [];
    const codes = conditions.map((condition) => (condition.code ?? '').trim().replaceAll('.', ''));
    const texts = [
        ...conditions.map((condition) => condition.name),
        ...(context.recentDietSignals ?? []),
        context.cancerType ?? '',
        ...(context.activeStageStatus !== 'completed' ? [context.activeStageLabel ?? ''] : []),
    ];
    const hasCode = (pattern: RegExp) => codes.some((code) => pattern.test(code));

    // Deliberately does not reuse hasRenalDietRestrictions: kidney cancer alone
    // is not evidence of CKD. eGFR/dialysis/protein restrictions need care-team
    // review, and neither the cancer nor CKD protein target wins automatically.
    if (hasCode(/^(?:N0[0-8]|N1[7-9]|Z49|Z992|E875)/i)
        || reports(texts, /신부전|신손상|(?:신장|콩팥|신)기능(?:이)?(?:저하|감소|이상)|(?:신장|콩팥)(?:질환|병)|투석|단백질제한|고칼륨|ckd|aki|(?:kidney|renal)(?:failure|disease|impairment)|dialysis|proteinrestriction|hyperkal/)) {
        return '신기능과 식사 제한량을 의료진에게 먼저 확인해 주세요.';
    }
    if (hasCode(/^R13/i) || reports(texts, /연하곤란|연하장애|삼키기어려|삼키기힘|삼키지못|사레|흡인위험|dysphagia|swallowingdifficulty/)) {
        return '삼킴 상태에 맞는 음식과 분량을 먼저 확인해 주세요.';
    }
    if (hasCode(/^(?:R60|R18)/i) || reports(texts, /부종|복수|edema|oedema|ascites/)) {
        return '부종이나 복수가 있으면 계산에 쓸 체중을 먼저 확인해 주세요.';
    }
    if (hasCode(/^(?:O\d|Z3[3-6]|Z39)/i) || reports(texts, /임신|수유중|수유부|pregnan|breastfeeding|lactation/)) {
        return '임신·수유 중에는 별도의 영양 기준을 확인해 주세요.';
    }
    if (reports(texts, /경관영양|경장영양|정맥영양|경구영양보충|영양지원|영양관|위루관|비위관|장루|금식|영양수액|tube(?:feed|nutrition)|enteralnutrition|parenteralnutrition|oralnutritionalsupplement|(?:^|[,;:])(?:tpn|ppn)(?:$|[,;:])/)) {
        return '현재 영양지원과 식사 지침에 맞는 분량을 먼저 확인해 주세요.';
    }
    if ((context.activeStageType === 'surgery' && context.activeStageStatus !== 'completed' && context.activeStageStatus !== 'planned')
        || reports(texts, /수술직후|수술후식|수술식이|위절제|장절제|덤핑증후군|장폐색|장폐쇄|흡수장애|postoperativediet|gastrectomy|bowelobstruction|malabsorption/)) {
        return '수술·소화 상태에 맞는 식사 단계와 분량을 먼저 확인해 주세요.';
    }
    if (hasCode(/^(?:E4[0-6]|R64|R634)/i)
        || reports(texts, /체중감소|체중이줄|살이빠|영양불량|영양실조|악액질|근감소|쇠약|거의못먹|거의먹지못|섭취불가|장기간(?:섭취|식사)부족|weightloss|malnutrition|cachexia|sarcopenia|frailty|littleornointake/)) {
        return '체중 변화와 최근 식사량을 의료진과 먼저 확인해 주세요.';
    }
    if (hasCode(/^(?:I50|K72|K74)/i)
        || reports(texts, /심부전|간부전|간경변|재급식|heartfailure|liverfailure|cirrhosis|refeeding/)) {
        return '현재 질환에 맞는 개별 식사량을 먼저 확인해 주세요.';
    }
    return null;
}

/**
 * An educational scaling example for an adult cancer menu, not a prescribed
 * intake, a nutrition diagnosis, or a clinically validated meal plan.
 *
 * ESPEN 2021 recommendations 3/4 give 25–30 kcal/kg/day and protein >1 up to
 * 1.5 g/kg/day where possible. Their evidence does not justify sex, cancer site,
 * stage, or treatment multipliers. Age establishes adult scope; height supplies
 * a BMI applicability check. Actual entered weight is an explicit assumption,
 * not a guideline-mandated weight choice for every patient. Do not substitute
 * ideal/adjusted weight automatically in obesity or uncertain fluid status.
 *
 * BMI <18.5 or >=30 and reported clinical risks defer automatic portions as
 * conservative product scope, not diagnostic cutoffs or a complete screening
 * tool. The available profile has no measured weight history, intake duration,
 * electrolyte results, or confirmation of absent risks. "ready" only means
 * this example can be computed from the information supplied.
 *
 * All four final meals (including snack) must have complete composition data.
 * Equal scaling preserves menu proportions; it does NOT ensure protein,
 * micronutrient, fluid, texture, or disease-specific requirements are met.
 * Clinical daily goals, when available, take priority outside this function.
 * Neither the menu nor the existing nutritionUnavailable flag is changed.
 */
export function buildPersonalizedPortions(
    plan: DayPlan,
    context: UserDietContext,
    personalization?: FoodPersonalization,
): PersonalizedPortions {
    const result: PersonalizedPortions = {
        status: 'needs_profile', reason: '', profileSummary: describeProfile(context),
        dailyEnergyRange: null, dailyProteinRange: null, meals: emptyMeals(),
        notes: [
            '의료진이 정한 섭취량이 있다면 그 안내를 우선해 주세요.',
            '최근 체중 변화나 식사량 감소가 있다면 분량을 늘리기 전에 상담해 주세요.',
        ],
        sources: SOURCES.map((source) => ({ ...source })),
    };
    const defer = (status: PersonalizedPortions['status'], reason: string) => ({ ...result, status, reason });
    const { age, heightCm, weightKg } = context;
    if (typeof age === 'number' && Number.isFinite(age) && age >= 0 && age < 18) {
        return defer('needs_review', '성장기에는 의료진이 안내한 식사량을 확인해 주세요.');
    }
    if (typeof age !== 'number' || !Number.isFinite(age) || !Number.isInteger(age) || age < 0 || age > 130
        || !isPositiveFinite(heightCm) || !isPositiveFinite(weightKg)) {
        return defer('needs_profile', '출생연도·키·현재 체중을 확인해 주세요.');
    }
    const cancerType = context.cancerType?.trim() ?? '';
    if (!cancerType || /^(?:없음|미입력|미정|모름|해당없음|unknown|none|n\/a)$/i.test(cancerType.replace(/\s+/g, ''))) {
        return defer('needs_profile', '진단 정보를 입력하면 적용 가능한 참고 분량을 확인할 수 있어요.');
    }
    const bmi = weightKg / (heightCm / 100) ** 2;
    if (!Number.isFinite(bmi) || !Number.isFinite(weightKg * 30)) {
        return defer('needs_profile', '키와 현재 체중을 다시 확인해 주세요.');
    }
    if (bmi < 18.5 || bmi >= 30) {
        return defer('needs_review', '현재 체격에서는 계산 기준 체중과 식사량을 먼저 확인해 주세요.');
    }
    const reviewReason = clinicalReviewReason(context);
    if (reviewReason) return defer('needs_review', reviewReason);

    result.dailyEnergyRange = { min: weightKg * 25, max: weightKg * 30 };
    result.dailyProteinRange = { min: weightKg, max: weightKg * 1.5 };
    result.notes.push(
        '입력한 현재 체중을 사용하며 성별·암 종류·치료 단계별 별도 가산은 하지 않아요.',
        '음식 분량은 열량에 맞춘 예시로, 단백질·비타민·무기질 충족을 보장하지 않아요.',
    );
    if (personalization?.symptoms.length) {
        result.notes.push('입맛이나 입안·속 상태가 불편하면 먹을 수 있는 양을 나누어 드세요.');
    }

    const estimates = SLOTS.map((slot) => ({ slot, estimate: estimateMealNutrition(plan[slot]) }));
    if (estimates.some(({ slot, estimate }) => estimate.status !== 'complete' || !estimate.totals
        || (slot !== 'snack' && estimate.totals.energyKcal <= 0))) {
        return defer('incomplete_menu', '식단 전체의 영양 정보를 확인한 뒤 개인 분량을 표시할 수 있어요.');
    }
    const dayEnergy = estimates.reduce((sum, { estimate }) => sum + estimate.totals!.energyKcal, 0);
    if (!Number.isFinite(dayEnergy) || dayEnergy <= 0) {
        return defer('incomplete_menu', '식단 전체의 열량을 확인할 수 없어 분량 계산을 보류했어요.');
    }
    const minScale = result.dailyEnergyRange.min / dayEnergy;
    const maxScale = result.dailyEnergyRange.max / dayEnergy;
    if (minScale < MIN_EXAMPLE_SCALE || maxScale > MAX_EXAMPLE_SCALE) {
        return defer('needs_review', '참고 범위와 기본 식단의 차이가 커서 분량을 따로 확인해 주세요.');
    }

    for (const { slot, estimate } of estimates) {
        const items = estimate.items.map((item): PortionItem => {
            // Zero-energy water/infusions are not a way to meet an energy goal.
            // Their unchanged example amount is not a fluid recommendation.
            const scales = item.nutrients.energyKcal > 0 ? [minScale, maxScale] : [1, 1];
            const minGrams = item.grams * scales[0];
            const maxGrams = item.grams * scales[1];
            return {
                name: item.name, minGrams, maxGrams,
                exampleGrams: (minGrams + maxGrams) / 2,
                adjusted: Math.abs(minGrams - item.grams) > 1e-9 || Math.abs(maxGrams - item.grams) > 1e-9,
            };
        });
        result.meals[slot] = {
            items,
            gramsByFood: Object.fromEntries(items.map((item) => [item.name, item.exampleGrams])),
            energyRange: { min: estimate.totals!.energyKcal * minScale, max: estimate.totals!.energyKcal * maxScale },
        };
    }
    return { ...result, status: 'ready', reason: '입력한 체중을 기준으로 계산한 참고 분량이에요.' };
}
