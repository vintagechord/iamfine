import assert from 'node:assert/strict';
import test from 'node:test';
import type { DayPlan, MealSuggestion, PreferenceType } from './dietEngine';
import type { NutritionValues } from './nutritionIngredients';

const { estimateMealNutrition } = await import(new URL('./mealNutrition.ts', import.meta.url).href) as typeof import('./mealNutrition');
const { NUTRITION_INGREDIENTS } = await import(new URL('./nutritionIngredients.ts', import.meta.url).href) as typeof import('./nutritionIngredients');
const { NUTRITION_DISHES } = await import(new URL('./nutritionDishes.ts', import.meta.url).href) as typeof import('./nutritionDishes');
const { MEAL_NUTRITION_RECIPES } = await import(new URL('./mealNutritionRecipes.ts', import.meta.url).href) as typeof import('./mealNutritionRecipes');
const { generatePlanForDate, generateMonthPlans, optimizePlanByPreference, optimizePlanByUserContext } = await import(new URL('./dietEngine.ts', import.meta.url).href) as typeof import('./dietEngine');
const { applyFoodPersonalization, parseFoodPersonalization, AVOIDED_INGREDIENT_OPTIONS } = await import(new URL('./personalization.ts', import.meta.url).href) as typeof import('./personalization');

const nutrientKeys = ['energyKcal', 'carbG', 'proteinG', 'fatG'] as const;
const slots = ['breakfast', 'lunch', 'dinner'] as const;
const menu = (main: string, rest: Partial<Pick<MealSuggestion, 'riceType' | 'soup' | 'sides'>> = {}) => ({
    main, riceType: '', soup: '', sides: [], ...rest,
});
const closeTo = (actual: number, expected: number, label = '') => {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);
};
const checkValues = (actual: NutritionValues | null, expected: NutritionValues) => {
    assert.ok(actual);
    for (const key of nutrientKeys) closeTo(actual[key], expected[key], key);
};

test('official prepared-food values scale by the disclosed grams and add across the displayed meal', () => {
    // MFDS D307-317040000-0001: egg custard, per 100 g.
    const egg = estimateMealNutrition(menu('달걀찜'));
    assert.equal(egg.status, 'complete');
    assert.equal(egg.items[0].grams, 100);
    assert.equal(egg.items[0].sources[0].foodCode, 'D307-317040000-0001');
    checkValues(egg.totals, { energyKcal: 108, carbG: 1.03, proteinG: 9.01, fatG: 7.5 });

    // MFDS D301-022000000-0001: rice, 166 kcal per 100 g × 150 g.
    const rice = estimateMealNutrition(menu('흰쌀밥'));
    assert.equal(rice.items[0].grams, 150);
    checkValues(rice.totals, { energyKcal: 249, carbG: 55.995, proteinG: 5.04, fatG: 0.48 });
    const together = estimateMealNutrition(menu('달걀찜', { riceType: '흰쌀밥' }));
    assert.equal(together.items.length, 2);
    checkValues(together.totals, { energyKcal: 357, carbG: 57.025, proteinG: 14.05, fatG: 7.98 });
});

test('an ingredient example scales cooked rice and raw black rice independently without treating 100 mL as 100 g', () => {
    const blackRice = estimateMealNutrition(menu('흑미밥'));
    assert.equal(blackRice.status, 'complete');
    assert.equal(blackRice.items[0].grams, 150);
    assert.deepEqual(new Set(blackRice.items[0].sources.map((source) => source.foodCode)), new Set([
        'D301-022000000-0001', 'R101-008000701-0000',
    ]));
    // 120 g cooked rice + 10 g raw black rice + 20 g water.
    checkValues(blackRice.totals, { energyKcal: 234.9, carbG: 52.352, proteinG: 4.802, fatG: 0.605 });
});

test('the graph shows 4/4/9 macro energy shares rather than gram shares or database energy progress', () => {
    const estimate = estimateMealNutrition(menu('달걀찜'));
    closeTo(estimate.energyShares.carb, 4.12 / 107.66 * 100);
    closeTo(estimate.energyShares.protein, 36.04 / 107.66 * 100);
    closeTo(estimate.energyShares.fat, 67.5 / 107.66 * 100);
    closeTo(Object.values(estimate.energyShares).reduce((sum, value) => sum + value, 0), 100);
    assert.ok(Math.abs(estimate.energyShares.fat - 7.5 / 17.54 * 100) > 15);
    assert.ok(Math.abs(estimate.energyShares.fat - 67.5 / 108 * 100) > 0.1);
});

test('exact displayed names are counted once after trim, while explicit aliases remain supported', () => {
    const estimate = estimateMealNutrition(menu(' 달걀찜 ', {
        riceType: '흰쌀밥', soup: '달걀찜', sides: ['달걀찜', ' 흰쌀밥 ', '물'],
    }));
    assert.deepEqual(estimate.items.map((item) => item.name), ['달걀찜', '흰쌀밥', '물']);
    checkValues(estimate.totals, { energyKcal: 357, carbG: 57.025, proteinG: 14.05, fatG: 7.98 });
    assert.deepEqual(estimateMealNutrition(menu('계란찜')).totals, estimateMealNutrition(menu('달걀찜')).totals);
});

test('an integrated porridge and an explicitly omitted rice slot never gain an invented extra bowl', () => {
    const porridge = estimateMealNutrition(menu('채소죽', { soup: '국 생략', sides: ['없음'] }));
    assert.equal(porridge.status, 'complete');
    assert.deepEqual(porridge.items.map((item) => [item.name, item.grams]), [['채소죽', 300]]);
    checkValues(porridge.totals, { energyKcal: 129, carbG: 22.86, proteinG: 5.07, fatG: 2.07 });
    const omitted = estimateMealNutrition(menu('달걀찜', { riceType: '밥 생략', soup: '해당 없음' }));
    assert.equal(omitted.items.length, 1);
    closeTo(omitted.totals!.energyKcal, 108);
});

test('estimates follow the changed final menu without changing recipes, recommendations or legacy flags', () => {
    const meal = {
        ...generatePlanForDate('2026-09-08', 'other', 70).breakfast,
        ...menu('달걀찜'), nutritionUnavailable: true, nutrient: { carb: 13, protein: 17, fat: 70 },
    };
    const before = structuredClone(meal);
    const original = estimateMealNutrition(meal);
    assert.deepEqual(meal, before);
    meal.main = '흰쌀밥';
    const changedBefore = structuredClone(meal);
    const changed = estimateMealNutrition(meal);
    closeTo(original.totals!.energyKcal, 108);
    closeTo(changed.totals!.energyKcal, 249);
    assert.deepEqual(meal, changedBefore);
    assert.equal(meal.nutritionUnavailable, true);
    assert.deepEqual(meal.nutrient, { carb: 13, protein: 17, fat: 70 });
    assert.deepEqual(estimateMealNutrition({ ...meal, nutritionUnavailable: false } as MealSuggestion), changed);
});

test('unknown, partly known and empty main menus explicitly retain missing data', () => {
    const partial = estimateMealNutrition(menu('달걀찜', { soup: '등록되지 않은 새 음식', sides: ['등록되지 않은 새 음식'] }));
    assert.equal(partial.status, 'partial');
    assert.deepEqual(partial.missingFoods, ['등록되지 않은 새 음식']);
    closeTo(partial.totals!.energyKcal, 108);
    for (const main of ['등록되지 않은 음식', 'constructor', 'toString', '__proto__']) {
        const unknown = estimateMealNutrition(menu(main));
        assert.equal(unknown.status, 'unavailable', main);
        assert.equal(unknown.totals, null, main);
        assert.deepEqual(unknown.missingFoods, [main]);
    }
    for (const main of ['', ' ', '없음', '생략']) {
        const empty = estimateMealNutrition(menu(main));
        assert.equal(empty.status, 'unavailable');
        assert.equal(empty.totals, null);
        assert.ok(empty.missingFoods.includes('주메뉴 미정'));
        const riceOnly = estimateMealNutrition(menu(main, { riceType: '흰쌀밥' }));
        assert.equal(riceOnly.status, 'partial');
        assert.ok(riceOnly.missingFoods.includes('주메뉴 미정'));
    }
});

test('real zero-energy water yields finite zero shares and remains distinct from unavailable data', () => {
    const water = estimateMealNutrition(menu('물'));
    assert.equal(water.status, 'complete');
    assert.equal(water.items[0].grams, 200);
    checkValues(water.totals, { energyKcal: 0, carbG: 0, proteinG: 0, fatG: 0 });
    assert.deepEqual(water.energyShares, { carb: 0, protein: 0, fat: 0 });
    assert.deepEqual(water.missingFoods, []);
});

test('every curated record has all four finite nonnegative values and traceable provenance', () => {
    for (const [key, food] of Object.entries({ ...NUTRITION_INGREDIENTS, ...NUTRITION_DISHES })) {
        for (const nutrient of nutrientKeys) {
            assert.ok(Object.hasOwn(food.per100g, nutrient), `${key}: missing ${nutrient}`);
            assert.ok(Number.isFinite(food.per100g[nutrient]) && food.per100g[nutrient] >= 0, `${key}: invalid ${nutrient}`);
        }
        assert.ok(food.source.foodCode && food.source.name && food.source.description && food.source.referenceDate, `${key}: provenance`);
        if (key !== 'water') assert.match(food.source.url, /^https:\/\/(?:various\.foodsafetykorea\.go\.kr|fdc\.nal\.usda\.gov)\//, key);
    }
    for (const [name, recipe] of Object.entries(MEAL_NUTRITION_RECIPES)) {
        assert.ok(recipe.ingredients.length > 0, name);
        for (const [key, grams] of recipe.ingredients) {
            assert.ok(Object.hasOwn(NUTRITION_INGREDIENTS, key), `${name}: ${key}`);
            assert.ok(Number.isFinite(grams) && grams > 0, `${name}: ${grams} g`);
        }
    }
});

test('nonfinite or missing source values cannot become a complete meal estimate', async (t) => {
    const cases: Array<[string, Partial<NutritionValues>, keyof NutritionValues | undefined]> = [
        ['NaN energy', { energyKcal: Number.NaN }, undefined],
        ['infinite carbohydrate', { carbG: Infinity }, undefined],
        ['negative protein', { proteinG: -1 }, undefined],
        ['missing fat', {}, 'fatG'],
    ];
    for (const [kind, target, foodName] of [
        ['prepared dish', NUTRITION_DISHES['달걀찜'], '달걀찜'],
        ['ingredient', NUTRITION_INGREDIENTS.blackRice, '흑미밥'],
    ] as const) {
        for (const [label, patch, removed] of cases) {
            await t.test(`${kind}: ${label}`, () => {
                const original = target.per100g;
                const invalid: Partial<NutritionValues> = { ...original, ...patch };
                if (removed) delete invalid[removed];
                target.per100g = invalid as NutritionValues;
                try {
                    const estimate = estimateMealNutrition(menu(foodName));
                    assert.equal(estimate.status, 'unavailable');
                    assert.equal(estimate.totals, null);
                    assert.deepEqual(estimate.missingFoods, [foodName]);
                } finally {
                    target.per100g = original;
                }
            });
        }
    }
});

test('a year of meals and representative preference and personalization changes retain calculable final menus', () => {
    const plans: Array<{ label: string; plan: DayPlan }> = [];
    const preferences: PreferenceType[][] = [
        ['soft_food', 'digestive'], ['pizza', 'fried_chicken'], ['high_protein', 'vegetable', 'low_salt'],
    ];
    for (let month = 0; month < 12; month += 1) {
        plans.push(...generateMonthPlans(2026, month, 'other', 70).map((plan) => ({ label: 'baseline', plan })));
        for (const day of [7, 21]) {
            const base = generatePlanForDate(`2026-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 'other', 70);
            for (const preference of preferences) plans.push({ label: preference.join(','), plan: optimizePlanByPreference(base, preference).plan });
            const settings = parseFoodPersonalization({ texture: 'soft', symptoms: ['sore_mouth'], avoidedIngredients: ['egg', 'soy', 'shellfish'] });
            plans.push({ label: 'soft exclusions', plan: applyFoodPersonalization(base, settings).plan });
            plans.push({ label: 'renal exclusions', plan: applyFoodPersonalization(
                optimizePlanByUserContext(base, { cancerType: '신장암' }).plan,
                settings, { additionalConditions: [{ name: '만성 콩팥병', code: 'N18.9' }] },
            ).plan });
        }
    }
    let checked = 0;
    const failures: string[] = [];
    for (const { label, plan } of plans) {
        const before = structuredClone(plan);
        for (const slot of slots) {
            checked += 1;
            const meal = plan[slot];
            const estimate = estimateMealNutrition(meal);
            const expectedMissing = meal.main.trim() ? [] : ['주메뉴 미정'];
            if (JSON.stringify(estimate.missingFoods) !== JSON.stringify(expectedMissing)) {
                failures.push(`${label} ${plan.date} ${slot}: ${estimate.missingFoods.join(', ')}`);
            }
            assert.equal(estimate.status, expectedMissing.length ? 'partial' : 'complete', `${label} ${plan.date} ${slot}`);
            assert.ok(estimate.totals, `${label} ${plan.date} ${slot}`);
            for (const key of nutrientKeys) assert.ok(Number.isFinite(estimate.totals[key]) && estimate.totals[key] >= 0);
            for (const share of Object.values(estimate.energyShares)) assert.ok(Number.isFinite(share) && share >= 0 && share <= 100);
        }
        assert.deepEqual(plan, before, `${label} ${plan.date}: estimator must not alter a plan`);
    }
    assert.equal(checked, 1455);
    assert.deepEqual(failures, [], `unmapped final foods: ${failures.slice(0, 20).join('; ')}`);
});

test('renal exclusions with an empty main remain partial, without fabricating replacements or changing clinical flags', () => {
    const base = generatePlanForDate('2026-09-08', 'other', 70);
    Object.assign(base.breakfast, menu('달걀두부찜', { riceType: '콩밥', soup: '새우된장국', sides: ['양배추찜', '달걀찜'] }));
    const settings = parseFoodPersonalization({ avoidedIngredients: AVOIDED_INGREDIENT_OPTIONS.map((option) => option.value) });
    const finalPlan = applyFoodPersonalization(base, settings, { cancerType: '신장암' }).plan;
    const meal = finalPlan.breakfast;
    assert.equal(meal.main, '');
    assert.equal(meal.riceType, '');
    const before = structuredClone(meal);
    const estimate = estimateMealNutrition(meal);
    assert.equal(estimate.status, 'partial');
    assert.deepEqual(estimate.items.map((item) => item.name), ['양배추찜']);
    assert.deepEqual(estimate.missingFoods, ['주메뉴 미정']);
    assert.equal(meal.nutritionUnavailable, true);
    assert.deepEqual(meal, before);
});
