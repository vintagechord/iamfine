import assert from 'node:assert/strict';
import test from 'node:test';
import type { DayPlan, PreferenceType, UserDietContext } from './dietEngine';

const { generatePlanForDate, generateMonthPlans, optimizePlanByUserContext, optimizePlanByPreference, optimizePlanByMedications, applyDinnerCarbSafety } = await import(new URL('./dietEngine.ts', import.meta.url).href) as typeof import('./dietEngine');

const mains = ['breakfast', 'lunch', 'dinner'] as const;
const slots = [...mains, 'snack'] as const;
const menuNames = (plan: DayPlan) => slots.flatMap((slot) => {
    const meal = plan[slot];
    return [meal.riceType, meal.main, meal.soup, ...meal.sides];
});
const proteinFamily = (main: string) => {
    if (/닭/.test(main)) return 'chicken';
    if (/생선|연어|대구|고등어/.test(main)) return 'fish';
    if (/두부|콩/.test(main)) return 'soy';
    if (/달걀|계란|에그/.test(main)) return 'egg';
    if (/소고기/.test(main)) return 'beef';
    return 'unknown';
};
const cookingMethod = (main: string) => {
    if (/죽|국밥/.test(main)) return 'porridge';
    if (/구이|스테이크/.test(main)) return 'grill';
    if (/조림/.test(main)) return 'braise';
    if (/볶음|오믈렛|계란말이|스크램블/.test(main)) return 'saute';
    if (/수육/.test(main)) return 'boil';
    if (/덮밥/.test(main)) return 'rice bowl';
    return 'steam';
};

test('month plans equal independent date lookups and remain stable across call order and score changes', () => {
    for (const [year, month, expectedDays] of [[2026, 8, 30], [2028, 1, 29], [2027, 1, 28], [2026, 11, 31]]) {
        const plans = generateMonthPlans(year, month, 'chemo', 70);
        assert.equal(plans.length, expectedDays);
        for (const plan of [...plans].reverse()) {
            assert.deepEqual(generatePlanForDate(plan.date, 'chemo', 25), plan);
            assert.deepEqual(generatePlanForDate(plan.date, 'chemo', 95), plan);
        }
    }
    assert.throws(() => generatePlanForDate('2026-02-30', 'other', 70), RangeError);
    assert.throws(() => generatePlanForDate('2026-9-1', 'other', 70), RangeError);
});

test('protein groups, actual dishes and cooking methods are distributed over each month', () => {
    for (let month = 0; month < 12; month += 1) {
        const plans = generateMonthPlans(2026, month, 'other', 70);
        const allMains = plans.flatMap((plan) => mains.map((slot) => plan[slot].main));
        assert.ok(new Set(allMains).size >= 40, `month ${month + 1}: main variety`);
        assert.ok(new Set(allMains.map(cookingMethod)).size >= 6, `month ${month + 1}: cooking variety`);
        for (const slot of mains) {
            assert.ok(new Set(plans.map((plan) => plan[slot].main)).size >= 18, `${month + 1} ${slot}`);
            assert.ok(new Set(plans.map((plan) => plan[slot].soup)).size >= 8, `${month + 1} ${slot} soups`);
        }
        for (const plan of plans) {
            const families = mains.map((slot) => proteinFamily(plan[slot].main));
            assert.equal(new Set(families).size, 3, `${plan.date}: distinct daily protein groups`);
            assert.ok(!families.includes('unknown'), `${plan.date}: actual protein dish`);
            for (const slot of mains) {
                const meal = plan[slot];
                assert.ok(meal.riceType || /죽|덮밥|국밥/.test(meal.main), `${plan.date}: grain included`);
                assert.equal(meal.sides.length, 3);
                assert.equal(new Set(meal.sides).size, 3);
                assert.ok(!meal.summary.startsWith(' + '));
            }
        }
    }
});

test('a main dish does not repeat within seven days, including month, year and leap-day boundaries', () => {
    const plans = [
        ...generateMonthPlans(2027, 11, 'other', 70),
        ...generateMonthPlans(2028, 0, 'other', 70),
        ...generateMonthPlans(2028, 1, 'other', 70),
        ...generateMonthPlans(2028, 2, 'other', 70),
    ];
    plans.forEach((plan, index) => {
        const recent = plans.slice(Math.max(0, index - 7), index);
        const recentMains = new Set(recent.flatMap((item) => mains.map((slot) => item[slot].main)));
        for (const slot of mains) assert.ok(!recentMains.has(plan[slot].main), `${plan.date}: ${plan[slot].main}`);
        assert.ok(!recent.some((item) => item.snack.main === plan.snack.main), `${plan.date}: snack`);
    });
});

test('new monthly menus carry no calculated nutrient claim or blanket flour restriction', () => {
    for (const plan of generateMonthPlans(2026, 8, 'chemo', 30)) {
        for (const slot of slots) {
            assert.equal(plan[slot].nutritionUnavailable, true);
            assert.deepEqual(plan[slot].nutrient, { carb: 0, protein: 0, fat: 0 });
            assert.ok(!/밀가루|주 2회/.test(plan[slot].cautionFlour));
        }
        assert.deepEqual(applyDinnerCarbSafety(plan, { bmi: 17, lowAppetiteRisk: true, weightLossPreference: false }).plan, plan);
    }
});

test('cancer type, age, stage and common medications preserve already suitable monthly dishes', () => {
    const profiles: Array<{ context: UserDietContext; medications: string[] }> = [
        { context: { cancerType: '유방암', cancerStage: '3기' }, medications: ['타목시펜'] },
        { context: { cancerType: '위암' }, medications: [] },
        { context: { age: 72, heightCm: 160, weightKg: 45 }, medications: [] },
        { context: { activeStageType: 'chemo', activeStageStatus: 'active', activeStageOrder: 3 }, medications: ['덱사메타손'] },
        { context: { additionalConditions: [{ name: '고혈압' }, { name: '고지혈증' }] }, medications: ['와파린'] },
    ];
    for (const { context, medications } of profiles) {
        for (const base of generateMonthPlans(2026, 8, 'other', 70)) {
            const updated = optimizePlanByUserContext(optimizePlanByMedications(base, medications).plan, context).plan;
            assert.deepEqual(menuNames(updated), menuNames(base));
        }
    }
});

test('general preferences retain suitable menu variety and soft preference is idempotent', () => {
    const preferences: PreferenceType[] = ['healthy', 'high_protein', 'vegetable', 'bland', 'low_salt', 'warm_food', 'soupy', 'sweet', 'weight_loss'];
    const plans = generateMonthPlans(2026, 8, 'other', 70);
    const softPlans: DayPlan[] = [];
    for (const base of plans) {
        assert.deepEqual(menuNames(optimizePlanByPreference(base, preferences).plan), menuNames(base));
        const soft = optimizePlanByPreference(base, ['soft_food', 'digestive']).plan;
        assert.deepEqual(optimizePlanByPreference(soft, ['soft_food', 'digestive']).plan, soft);
        softPlans.push(soft);
    }
    for (const slot of mains) assert.ok(new Set(softPlans.map((plan) => plan[slot].main)).size >= 15, slot);
});

test('explicit preferences survive when suitable and actual symptom conflicts are corrected afterwards', () => {
    const base = generatePlanForDate('2026-09-07', 'other', 70);
    const requested = optimizePlanByPreference(base, ['pizza', 'fried_chicken']).plan;
    assert.match(requested.lunch.main, /피자/);
    assert.equal(requested.dinner.main, '치킨');
    const context: UserDietContext = { recentDietSignals: ['구내염', '메스꺼움'], additionalConditions: [{ name: '고혈압' }] };
    const fixed = optimizePlanByUserContext(requested, context).plan;
    assert.ok(!menuNames(fixed).some((food) => /피자|치킨|토마토|키위|샐러드/.test(food)));
    assert.deepEqual(optimizePlanByUserContext(fixed, context).plan, fixed);
    assert.equal(new Set(mains.map((slot) => fixed[slot].main)).size, 3);
    const softRequested = optimizePlanByPreference(base, ['soft_food', 'fried_chicken', 'pizza']).plan;
    assert.ok(!menuNames(softRequested).some((food) => /피자|치킨/.test(food)));
    for (const friedName of ['치킨', '후라이드 치킨', '프라이드치킨']) {
        requested.dinner.main = friedName;
        const lipidGuard = optimizePlanByUserContext(requested, { additionalConditions: [{ name: '고지혈증' }] }).plan;
        assert.notEqual(lipidGuard.dinner.main, friedName);
    }
});

test('renal and swallowing guidance does not invent a nutrient prescription or safe liquid texture', () => {
    const base = generatePlanForDate('2026-09-07', 'other', 70);
    const kidney = optimizePlanByUserContext(base, { cancerType: '신장암', recentDietSignals: ['구내염'] });
    assert.deepEqual(kidney.plan, base);
    assert.ok(kidney.notes.some((note) => note.includes('eGFR')));
    const codedRenal = optimizePlanByUserContext(base, { additionalConditions: [{ name: '급성 신손상', code: 'N17.9' }], recentDietSignals: ['구내염'] });
    assert.deepEqual(codedRenal.plan, base);
    const swallowing = optimizePlanByUserContext(base, { recentDietSignals: ['연하곤란'] });
    assert.deepEqual(swallowing.plan, base);
    assert.ok(swallowing.notes.some((note) => note.includes('점도') && note.includes('의료진')));
});

test('active treatment replaces explicitly raw dishes while preserving cooked alternatives', () => {
    const base = generatePlanForDate('2026-09-07', 'other', 70);
    base.breakfast.main = '광어회';
    base.lunch.main = '생연어 초밥';
    base.dinner.main = '익힌 새우 초밥';
    const result = optimizePlanByUserContext(base, { activeStageType: 'chemo', activeStageStatus: 'active' }).plan;
    assert.notEqual(result.breakfast.main, '광어회');
    assert.notEqual(result.lunch.main, '생연어 초밥');
    assert.equal(result.dinner.main, '익힌 새우 초밥');
});

test('medication checks remove an actual conflicting item without replacing every snack or mutating inputs', () => {
    const base = generatePlanForDate('2026-09-07', 'other', 70);
    base.snack.main = '자몽';
    base.snack.soup = '자몽주스';
    base.lunch.sides[0] = '시금치나물';
    const before = structuredClone(base);
    const changed = optimizePlanByMedications(base, ['팔보시클립', '와파린']);
    assert.deepEqual(base, before);
    assert.ok(!menuNames(changed.plan).some((food) => food.includes('자몽')));
    assert.ok(changed.plan.lunch.sides.includes('시금치나물'));
    assert.deepEqual(changed.plan.dinner, base.dinner);
    assert.ok(changed.notes.some((note) => note.includes('비타민 K')));
    assert.equal(changed.plan.snack.nutritionUnavailable, true);
});
