import assert from 'node:assert/strict';
import test from 'node:test';
import type { DayPlan, MealSlot } from './dietEngine';

const { applyFoodPersonalization, parseFoodPersonalization, readFoodPersonalization, matchesAvoidedIngredient, AVOIDED_INGREDIENT_OPTIONS } = await import(new URL('./personalization.ts', import.meta.url).href) as typeof import('./personalization');
const { generatePlanForDate, optimizePlanByUserContext } = await import(new URL('./dietEngine.ts', import.meta.url).href) as typeof import('./dietEngine');
const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const basePlan = () => generatePlanForDate('2026-09-07', 'other', 70);
const menuNames = (plan: DayPlan) => slots.flatMap((slot) => {
    const meal = plan[slot];
    return [meal.riceType, meal.main, meal.soup, ...meal.sides];
});

test('metadata parser tolerates legacy or malformed data and deduplicates allowed values', () => {
    for (const raw of [undefined, null, [], 'text', 3]) {
        assert.deepEqual(parseFoodPersonalization(raw), { symptoms: [], texture: 'regular', avoidedIngredients: [], updatedAt: '' });
    }
    assert.deepEqual(parseFoodPersonalization({ symptoms: ['nausea', 'nausea', 'unknown'], texture: 'invalid', avoidedIngredients: ['soy', 'unknown', 'soy'], updatedAt: 'invalid' }), {
        symptoms: ['nausea'], texture: 'regular', avoidedIngredients: ['soy'], updatedAt: '',
    });
    assert.deepEqual(readFoodPersonalization({ iamfine: { foodPersonalization: { texture: 'soft' } } }).texture, 'soft');
});

test('default settings preserve the source plan exactly', () => {
    const plan = basePlan();
    const result = applyFoodPersonalization(plan, parseFoodPersonalization(null));
    assert.equal(result.plan, plan);
    assert.deepEqual(result.notes, []);
});

test('ingredient name screening recognizes common preparation and ingredient aliases', () => {
    for (const name of ['계란말이', '에그샌드위치', '달걀지단']) assert.ok(matchesAvoidedIngredient(name, ['egg']));
    for (const name of ['치즈', '그릭요거트', '크림수프']) assert.ok(matchesAvoidedIngredient(name, ['dairy']));
    for (const name of ['유부초밥', '된장국', '연두부찜']) assert.ok(matchesAvoidedIngredient(name, ['soy']));
    assert.ok(matchesAvoidedIngredient('매생이굴죽', ['shellfish']));
    for (const name of ['멸치육수국', '굴비구이', '임연수구이', '광어회']) assert.ok(matchesAvoidedIngredient(name, ['fish']));
    for (const name of ['제육볶음', '목살구이', '함박스테이크', '탕수육']) assert.ok(matchesAvoidedIngredient(name, ['meat']));
    assert.equal(matchesAvoidedIngredient('감자찜', ['egg', 'dairy', 'soy']), false);
});

test('all ingredient combinations remain excluded after symptom menu substitutions without mutating input', () => {
    const plan = basePlan();
    const before = JSON.stringify(plan);
    const ingredients = AVOIDED_INGREDIENT_OPTIONS.map((option) => option.value);
    for (let mask = 0; mask < 2 ** ingredients.length; mask += 1) {
        const avoidedIngredients = ingredients.filter((_, index) => (mask & (1 << index)) !== 0);
        for (const symptoms of [[], ['poor_appetite'], ['nausea'], ['sore_mouth'], ['sore_mouth', 'nausea', 'poor_appetite']]) {
            const result = applyFoodPersonalization(plan, parseFoodPersonalization({ texture: 'soft', symptoms, avoidedIngredients }));
            assert.ok(menuNames(result.plan).every((name) => !matchesAvoidedIngredient(name, avoidedIngredients)), `mask ${mask}`);
        }
    }
    assert.equal(JSON.stringify(plan), before);
});

test('sore-mouth guidance takes priority over spicy foods and marks changed nutrition unavailable', () => {
    const plan = basePlan();
    plan.lunch.main = '매운 떡볶이';
    plan.lunch.sides = ['레몬채소무침', '김치'];
    const result = applyFoodPersonalization(plan, parseFoodPersonalization({ symptoms: ['sore_mouth'] }));
    assert.equal(result.plan.lunch.riceType, '진밥');
    assert.ok(result.plan.lunch.nutritionUnavailable);
    assert.ok(result.plan.lunch.recipeSteps.some((step) => step.includes('뜨겁지 않게')));
    assert.ok(!menuNames(result.plan).some((name) => /떡볶이|레몬|김치/.test(name)));
    assert.equal(result.plan.lunch.recipeName, `${result.plan.lunch.main} 준비하기`);
});

test('poor appetite adds a manageable snack while preserving condition cautions', () => {
    const plan = basePlan();
    plan.lunch.cautionFlour = '담당 의료진의 제한식을 따라 주세요.';
    const result = applyFoodPersonalization(plan, parseFoodPersonalization({ symptoms: ['poor_appetite'] }));
    assert.ok(result.plan.snack.nutritionUnavailable);
    assert.ok(result.plan.lunch.cautionFlour.startsWith(plan.lunch.cautionFlour));
    assert.ok(result.notes.some((note) => note.includes('나누어')));
    const repeated = applyFoodPersonalization(result.plan, parseFoodPersonalization({ symptoms: ['poor_appetite'] }));
    assert.deepEqual(repeated.plan, result.plan);
});

test('renal restrictions defer automatic substitutions instead of adding banana or dairy', () => {
    const plan = basePlan();
    const settings = parseFoodPersonalization({ symptoms: ['poor_appetite', 'nausea'], texture: 'soft', avoidedIngredients: ['egg'] });
    for (const condition of [{ name: '만성 콩팥병' }, { name: '질환', code: 'N18.9' }, { name: '고칼륨혈증' }, { name: '질환', code: 'Z99.2' }]) {
        const result = applyFoodPersonalization(plan, settings, { additionalConditions: [condition] });
        assert.equal(result.plan, plan);
        assert.ok(result.notes[0].includes('자동 변경을 보류'));
    }
    const kidneyCancer = applyFoodPersonalization(plan, settings, { cancerType: '신장암' });
    assert.equal(kidneyCancer.plan, plan);
    assert.ok(kidneyCancer.notes[0].includes('검사 결과'));
});

test('excluding most protein groups explains the need for a replacement nutrition plan', () => {
    const avoidedIngredients = AVOIDED_INGREDIENT_OPTIONS.map((option) => option.value);
    const result = applyFoodPersonalization(basePlan(), parseFoodPersonalization({ avoidedIngredients, symptoms: ['poor_appetite'] }));
    assert.ok(menuNames(result.plan).every((name) => !matchesAvoidedIngredient(name, avoidedIngredients)));
    assert.ok(result.notes.some((note) => note.includes('단백질 식품') && note.includes('영양사')));
});

test('sex and cultural background alone do not claim food personalization', () => {
    const plan = basePlan();
    const basic = optimizePlanByUserContext(plan, {});
    assert.deepEqual(optimizePlanByUserContext(plan, { sex: 'female', ethnicity: '한국' }), basic);
    assert.deepEqual(optimizePlanByUserContext(plan, { sex: 'male', ethnicity: '프랑스' }), basic);
});
