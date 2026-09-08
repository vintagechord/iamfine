import assert from 'node:assert/strict';
import test from 'node:test';
import type { DayPlan, MealSlot, MealSuggestion, UserDietContext } from './dietEngine';
import type { PersonalizedPortions } from './personalizedPortions';

const { buildPersonalizedPortions } = await import(new URL('./personalizedPortions.ts', import.meta.url).href) as typeof import('./personalizedPortions');
const { estimateMealNutrition } = await import(new URL('./mealNutrition.ts', import.meta.url).href) as typeof import('./mealNutrition');
const { parseFoodPersonalization } = await import(new URL('./personalization.ts', import.meta.url).href) as typeof import('./personalization');
const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const profile = (patch: Partial<UserDietContext> = {}): UserDietContext => ({
    age: 50, heightCm: 165, weightKg: 60, cancerType: '유방암', ...patch,
});
const meal = (patch: Partial<MealSuggestion> = {}): MealSuggestion => ({
    summary: '예시', main: '달걀찜', riceType: '흰쌀밥', soup: '물', sides: [],
    cautionFlour: '', nutrient: { carb: 13, protein: 17, fat: 70 }, nutritionUnavailable: true,
    recipeName: '', recipeSteps: [], ...patch,
});
const plan = (): DayPlan => ({
    date: '2026-09-09', breakfast: meal(), lunch: meal(), dinner: meal(),
    snack: meal({ main: '플레인 요거트', riceType: '', soup: '물' }),
});
const closeTo = (actual: number, expected: number) => {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`);
};
const assertNoPortions = (result: PersonalizedPortions) => {
    for (const slot of slots) {
        assert.deepEqual(result.meals[slot], { items: [], gramsByFood: {}, energyRange: null });
    }
};

test('all four meals scale to the energy band and graph overrides use its midpoint', () => {
    const input = plan();
    const context = profile();
    const settings = parseFoodPersonalization(null);
    const before = structuredClone({ input, context, settings });
    const result = buildPersonalizedPortions(input, context, settings);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.dailyEnergyRange, { min: 1500, max: 1800 });
    // The returned lower boundary is exclusive, as documented for the UI.
    assert.deepEqual(result.dailyProteinRange, { min: 60, max: 90 });
    const baselineEnergy = slots.reduce((sum, slot) => sum + estimateMealNutrition(input[slot]).totals!.energyKcal, 0);
    let lowEnergy = 0;
    let highEnergy = 0;
    let graphEnergy = 0;
    for (const slot of slots) {
        const portion = result.meals[slot];
        const baseline = estimateMealNutrition(input[slot]);
        assert.equal(portion.items.length, baseline.items.length);
        const low = Object.fromEntries(portion.items.map((item) => [item.name, item.minGrams]));
        const high = Object.fromEntries(portion.items.map((item) => [item.name, item.maxGrams]));
        lowEnergy += estimateMealNutrition(input[slot], low).totals!.energyKcal;
        highEnergy += estimateMealNutrition(input[slot], high).totals!.energyKcal;
        graphEnergy += estimateMealNutrition(input[slot], portion.gramsByFood).totals!.energyKcal;
        closeTo(portion.energyRange!.min, baseline.totals!.energyKcal * 1500 / baselineEnergy);
        closeTo(portion.energyRange!.max, baseline.totals!.energyKcal * 1800 / baselineEnergy);
        for (const item of portion.items) {
            closeTo(item.exampleGrams, (item.minGrams + item.maxGrams) / 2);
            closeTo(portion.gramsByFood[item.name], item.exampleGrams);
        }
    }
    closeTo(lowEnergy, 1500);
    closeTo(highEnergy, 1800);
    closeTo(graphEnergy, 1650);
    assert.deepEqual({ input, context, settings }, before);
    assert.ok(slots.every((slot) => input[slot].nutritionUnavailable));
});

test('water and zero-calorie infusions keep their disclosed grams, including a water-only snack', () => {
    const input = plan();
    input.snack = meal({ main: '물', riceType: '', soup: '물', sides: [' 물 '] });
    const result = buildPersonalizedPortions(input, profile());
    assert.equal(result.status, 'ready');
    for (const slot of slots) {
        assert.deepEqual(result.meals[slot].items.find((item) => item.name === '물'), {
            name: '물', minGrams: 200, maxGrams: 200, exampleGrams: 200, adjusted: false,
        });
    }
    assert.equal(result.meals.snack.items.length, 1);
    assert.deepEqual(result.meals.snack.energyRange, { min: 0, max: 0 });
    closeTo(slots.reduce((sum, slot) => sum + estimateMealNutrition(input[slot], result.meals[slot].gramsByFood).totals!.energyKcal, 0), 1650);
    for (const name of ['보리차', '루이보스차', '연한 생강차']) {
        input.snack = meal({ main: name, riceType: '', soup: '', sides: [] });
        const infusion = buildPersonalizedPortions(input, profile());
        assert.equal(infusion.status, 'ready');
        assert.deepEqual(infusion.meals.snack.items, [{ name, minGrams: 200, maxGrams: 200, exampleGrams: 200, adjusted: false }]);
    }
});

test('a repeated food is de-duplicated only within its meal and each slot receives its own map', () => {
    const input = plan();
    input.breakfast.sides = [' 달걀찜 ', '흰쌀밥'];
    const result = buildPersonalizedPortions(input, profile());
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.meals.breakfast.items.map((item) => item.name), ['달걀찜', '흰쌀밥', '물']);
    assert.notEqual(result.meals.breakfast.gramsByFood, result.meals.lunch.gramsByFood);
    const lunchRice = result.meals.lunch.gramsByFood['흰쌀밥'];
    result.meals.breakfast.gramsByFood['흰쌀밥'] = 1;
    assert.equal(result.meals.lunch.gramsByFood['흰쌀밥'], lunchRice);
});

test('sex, adult age, cancer stage and treatment do not add invented energy multipliers', () => {
    const input = plan();
    const expected = buildPersonalizedPortions(input, profile());
    for (const context of [
        profile({ sex: 'unknown' }), profile({ sex: 'female' }), profile({ sex: 'male' }), profile({ sex: 'other' }),
        profile({ age: 18 }), profile({ age: 85 }), profile({ heightCm: 175 }),
        profile({ cancerType: '폐암', cancerStage: '4기', activeStageType: 'chemo', activeStageStatus: 'active' }),
        profile({ activeStageType: 'immunotherapy', activeStageStatus: 'active', activeStageOrder: 5 }),
    ]) {
        const actual = buildPersonalizedPortions(input, context);
        assert.equal(actual.status, 'ready');
        assert.deepEqual(actual.dailyEnergyRange, expected.dailyEnergyRange);
        assert.deepEqual(actual.dailyProteinRange, expected.dailyProteinRange);
        assert.deepEqual(actual.meals, expected.meals);
    }
});

test('missing, nonfinite and invalid required fields never create numeric targets', () => {
    const contexts: UserDietContext[] = [{}, profile({ cancerType: '' }), profile({ cancerType: '해당 없음' })];
    for (const key of ['age', 'heightCm', 'weightKg'] as const) {
        for (const value of [undefined, NaN, Infinity, -Infinity, -1]) contexts.push(profile({ [key]: value }));
    }
    contexts.push(profile({ age: 50.5 }), profile({ age: 131 }), profile({ heightCm: 0 }), profile({ weightKg: 0 }));
    contexts.push(profile({ heightCm: 1e154, weightKg: Number.MAX_VALUE / 10 }));
    for (const context of contexts) {
        const result = buildPersonalizedPortions(plan(), context);
        assert.equal(result.status, 'needs_profile', JSON.stringify(context));
        assert.equal(result.dailyEnergyRange, null);
        assert.equal(result.dailyProteinRange, null);
        assertNoPortions(result);
    }
});

test('adult and BMI applicability boundaries are inclusive only on the supported side', () => {
    for (const context of [profile({ age: 0 }), profile({ age: 17 }), profile({ heightCm: 200, weightKg: 73.99 }), profile({ heightCm: 100, weightKg: 30 })]) {
        const result = buildPersonalizedPortions(plan(), context);
        assert.equal(result.status, 'needs_review');
        assert.equal(result.dailyEnergyRange, null);
        assertNoPortions(result);
    }
    assert.equal(buildPersonalizedPortions(plan(), profile({ age: 18 })).status, 'ready');
    assert.equal(buildPersonalizedPortions(plan(), profile({ heightCm: 200, weightKg: 74 })).status, 'ready');
    assert.equal(buildPersonalizedPortions(plan(), profile({ heightCm: 100, weightKg: 29.99 })).status, 'ready');
});

test('kidney cancer alone is not CKD but explicit renal dysfunction and relevant codes defer', () => {
    const input = plan();
    for (const context of [profile({ cancerType: '신장암' }), profile({ cancerType: 'renal cell cancer' }),
        profile({ additionalConditions: [{ name: '신장암', code: 'C64.9' }] })]) {
        assert.equal(buildPersonalizedPortions(input, context).status, 'ready');
    }
    for (const condition of [
        { name: '만성 콩팥병' }, { name: '급성 신손상' }, { name: '신기능 저하' },
        { name: 'chronic kidney disease' }, { name: '혈액 투석' }, { name: '단백질 제한' },
        { name: '진단', code: 'N18.9' }, { name: '진단', code: 'N19' }, { name: '진단', code: 'Z99.2' },
    ]) {
        const result = buildPersonalizedPortions(input, profile({ additionalConditions: [condition] }));
        assert.equal(result.status, 'needs_review', condition.name + condition.code);
        assert.equal(result.dailyEnergyRange, null);
        assert.equal(result.dailyProteinRange, null);
        assertNoPortions(result);
    }
});

test('reported clinical risks and coded swallowing, fluid or nutrition problems defer all portions', () => {
    for (const signal of [
        '연하곤란', '삼키기 어려움', '부종', '복수', '임신 중', '수유 중', '경관영양', '정맥영양', '영양지원 중',
        '금식', '수술 후 식이', '위절제', '장폐색', '체중 감소', '악액질', '거의 먹지 못함',
        '장기간 식사 부족', '간경변', '심부전', '재급식 위험',
    ]) {
        const result = buildPersonalizedPortions(plan(), profile({ recentDietSignals: [signal] }));
        assert.equal(result.status, 'needs_review', signal);
        assert.equal(result.dailyEnergyRange, null, signal);
        assertNoPortions(result);
    }
    for (const code of ['R13.9', 'R60.9', 'R18', 'O21.9', 'Z34.0', 'E43', 'R63.4']) {
        assert.equal(buildPersonalizedPortions(plan(), profile({ additionalConditions: [{ name: '진단', code }] })).status, 'needs_review', code);
    }
    const negatives = buildPersonalizedPortions(plan(), profile({ recentDietSignals: ['부종 없음', '연하곤란 아님', 'no CKD'] }));
    assert.equal(negatives.status, 'ready');
});

test('active surgery and a prescribed surgical diet differ from a completed or merely planned operation', () => {
    for (const activeStageStatus of ['active', undefined] as const) {
        assert.equal(buildPersonalizedPortions(plan(), profile({ activeStageType: 'surgery', activeStageStatus })).status, 'needs_review');
    }
    for (const activeStageStatus of ['completed', 'planned'] as const) {
        assert.equal(buildPersonalizedPortions(plan(), profile({ activeStageType: 'surgery', activeStageStatus, activeStageLabel: '수술' })).status, 'ready');
    }
    assert.equal(buildPersonalizedPortions(plan(), profile({ activeStageType: 'surgery', activeStageStatus: 'completed', activeStageLabel: '수술 후 식이' })).status, 'ready');
    assert.equal(buildPersonalizedPortions(plan(), profile({ activeStageType: 'surgery', activeStageStatus: 'planned', recentDietSignals: ['수술식이'] })).status, 'needs_review');
});

test('soft texture, mild symptoms and short records do not establish prolonged inadequate intake', () => {
    const settings = parseFoodPersonalization({ texture: 'soft', symptoms: ['poor_appetite', 'nausea', 'sore_mouth'] });
    const context = profile({ recentDietSignals: ['메스꺼움'], recentDietPattern: {
        analyzedDays: 1, skippedMealDays: 1, lowProteinDays: 1, lowVegetableDays: 1,
        highFlourSugarDays: 0, highSodiumDays: 0, spicyHeavyDays: 0,
    } });
    const result = buildPersonalizedPortions(plan(), context, settings);
    assert.equal(result.status, 'ready');
    assert.ok(result.notes.some((note) => note.includes('나누어')));
    assert.ok(result.notes.some((note) => note.includes('체중 변화')));
});

test('one missing food in any slot defers every portion while preserving the eligible daily band', () => {
    for (const slot of slots) {
        const input = plan();
        input[slot].sides.push('등록되지 않은 음식');
        const result = buildPersonalizedPortions(input, profile());
        assert.equal(result.status, 'incomplete_menu', slot);
        assert.deepEqual(result.dailyEnergyRange, { min: 1500, max: 1800 });
        assertNoPortions(result);
    }
    for (const main of ['', '없음', 'constructor']) {
        const input = plan();
        input.breakfast.main = main;
        assert.equal(buildPersonalizedPortions(input, profile()).status, 'incomplete_menu');
    }
    const emptyEnergyMeal = plan();
    emptyEnergyMeal.breakfast = meal({ main: '물', riceType: '', soup: '', sides: [] });
    assert.equal(buildPersonalizedPortions(emptyEnergyMeal, profile()).status, 'incomplete_menu');
});

test('integrated rice and explicit omissions never acquire a fabricated extra food', () => {
    const input = plan();
    input.breakfast = meal({ main: '채소죽', riceType: '밥 생략', soup: '국 생략', sides: ['없음'] });
    const result = buildPersonalizedPortions(input, profile({ weightKg: 55 }));
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.meals.breakfast.items.map((item) => item.name), ['채소죽']);
    assert.deepEqual(Object.keys(result.meals.breakfast.gramsByFood), ['채소죽']);
});

test('extreme recipe scaling is deferred without clamping or silently changing daily targets', () => {
    for (const context of [profile({ weightKg: 20, heightCm: 100 }), profile({ weightKg: 85, heightCm: 180 })]) {
        const result = buildPersonalizedPortions(plan(), context);
        assert.equal(result.status, 'needs_review');
        assert.match(result.reason, /차이가 커서/);
        assert.deepEqual(result.dailyEnergyRange, { min: context.weightKg! * 25, max: context.weightKg! * 30 });
        assertNoPortions(result);
    }
    const input = plan();
    const energy = slots.reduce((sum, slot) => sum + estimateMealNutrition(input[slot]).totals!.energyKcal, 0);
    for (const weightKg of [energy * 0.5 / 25, energy * 2 / 30]) {
        const context = profile({ weightKg, heightCm: Math.sqrt(weightKg / 22) * 100 });
        assert.equal(buildPersonalizedPortions(input, context).status, 'ready');
    }
});

test('changed menus and current weight recalculate quantities without stale date or legacy flags', () => {
    const input = plan();
    const first = buildPersonalizedPortions(input, profile());
    input.date = '2026-09-10';
    input.breakfast.riceType = '흑미밥';
    input.breakfast.nutritionUnavailable = false;
    const second = buildPersonalizedPortions(input, profile({ weightKg: 65 }));
    assert.equal(second.status, 'ready');
    assert.deepEqual(second.dailyEnergyRange, { min: 1625, max: 1950 });
    assert.ok(Object.hasOwn(second.meals.breakfast.gramsByFood, '흑미밥'));
    assert.ok(!Object.hasOwn(second.meals.breakfast.gramsByFood, '흰쌀밥'));
    assert.notEqual(first.meals.lunch.gramsByFood['흰쌀밥'], second.meals.lunch.gramsByFood['흰쌀밥']);
    input.breakfast.nutritionUnavailable = true;
    assert.deepEqual(buildPersonalizedPortions(input, profile({ weightKg: 65 })), second);
});
