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
    assert.equal(result.plan.lunch.riceType, result.plan.lunch.main.includes('죽') ? '' : '진밥');
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
    const settings = parseFoodPersonalization({ symptoms: ['poor_appetite', 'nausea'], texture: 'soft' });
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


test('compatible varied meals survive personalization rather than being replaced by a fixed menu', () => {
    const plan = basePlan();
    Object.assign(plan.breakfast, { main: '버섯달걀찜', soup: '당근수프', sides: ['양배추찜', '브로콜리찜'] });
    Object.assign(plan.lunch, { main: '대구살채소찜', soup: '배추맑은국', sides: ['배추찜', '무나물'] });
    Object.assign(plan.dinner, { main: '닭안심채소죽', soup: '맑은 애호박국', sides: ['으깬 단호박', '가지찜'] });
    const result = applyFoodPersonalization(plan, parseFoodPersonalization({ symptoms: ['sore_mouth'] }));
    for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
        assert.equal(result.plan[slot].main, plan[slot].main);
        assert.equal(result.plan[slot].soup, plan[slot].soup);
        assert.deepEqual(result.plan[slot].sides, plan[slot].sides);
        assert.ok(result.plan[slot].recipeSteps.some((step) => step.includes('잘게 다지고')));
    }
});

test('monthly symptom menus retain variety and avoid same-day main duplicates when choices exist', () => {
    for (const symptoms of [['sore_mouth'], ['nausea'], ['poor_appetite', 'sore_mouth']]) {
        const settings = parseFoodPersonalization({ symptoms });
        const plans = Array.from({ length: 30 }, (_, day) => {
            const date = `2026-09-${String(day + 1).padStart(2, '0')}`;
            return applyFoodPersonalization(generatePlanForDate(date, 'other', 70), settings).plan;
        });
        for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
            assert.ok(new Set(plans.map((plan) => plan[slot].main)).size >= 15, `${symptoms} ${slot}`);
            assert.ok(new Set(plans.map((plan) => plan[slot].soup)).size >= 8, `${symptoms} ${slot} soups`);
        }
        assert.ok(new Set(plans.map((plan) => plan.snack.main)).size >= 8, `${symptoms} snacks`);
        for (const plan of plans) {
            assert.equal(new Set(slots.map((slot) => plan[slot].main)).size, slots.length, `${symptoms} ${plan.date}`);
            assert.deepEqual(applyFoodPersonalization(plan, settings).plan, plan, `${symptoms} ${plan.date} idempotence`);
        }
    }
});

test('replacement rotation uses the full date and safely repairs ambiguous spicy menu labels', () => {
    const settings = parseFoodPersonalization({ symptoms: ['sore_mouth'] });
    const outputs = ['2026-09-07', '2026-10-07', '2027-09-07'].map((date) => {
        const plan = basePlan();
        plan.date = date;
        for (const slot of slots) {
            plan[slot].main = '달걀찜(매운맛)';
            plan[slot].soup = '매운 김치국';
        }
        return applyFoodPersonalization(plan, settings).plan;
    });
    assert.equal(new Set(outputs.map((plan) => plan.breakfast.main)).size, outputs.length);
    assert.ok(outputs.every((plan) => !menuNames(plan).some((name) => /매운|김치/.test(name))));
});

test('renal restrictions remove known excluded foods without inventing substitute ingredients', () => {
    const plan = basePlan();
    for (const slot of slots) {
        Object.assign(plan[slot], { riceType: '콩밥', main: '달걀두부찜', soup: '새우된장국', sides: ['양배추찜', '달걀찜'], recipeSteps: ['두부와 달걀을 넣어 주세요.'] });
    }
    const before = JSON.stringify(plan);
    const settings = parseFoodPersonalization({ avoidedIngredients: ['egg', 'soy', 'shellfish'], symptoms: ['sore_mouth'] });
    const result = applyFoodPersonalization(plan, settings, { additionalConditions: [{ name: '만성 콩팥병', code: 'N18.9' }] });
    for (const slot of slots) {
        assert.equal(result.plan[slot].main, '');
        assert.equal(result.plan[slot].riceType, '');
        assert.equal(result.plan[slot].soup, '');
        assert.deepEqual(result.plan[slot].sides, ['양배추찜']);
        assert.ok(result.plan[slot].nutritionUnavailable);
        assert.ok(!result.plan[slot].recipeSteps.some((step) => /두부|달걀/.test(step)));
    }
    assert.ok(result.notes.some((note) => note.includes('영양 요구량을 충족한다는 뜻은 아니')));
    assert.ok(menuNames(result.plan).filter(Boolean).every((name) => menuNames(plan).includes(name)));
    assert.equal(JSON.stringify(plan), before);
    assert.deepEqual(applyFoodPersonalization(result.plan, settings, { cancerType: '신장암' }).plan, result.plan);
});

test('grain-based main meals retain a single staple across baseline, soft and nausea personalization', () => {
    const plan = basePlan();
    Object.assign(plan.breakfast, { main: '두부채소죽', riceType: '', summary: '두부채소죽 + 맑은 채소국' });
    for (const settings of [
        parseFoodPersonalization(null),
        parseFoodPersonalization({ texture: 'soft' }),
        parseFoodPersonalization({ symptoms: ['nausea'] }),
    ]) {
        const result = applyFoodPersonalization(plan, settings).plan;
        assert.equal(result.breakfast.main, '두부채소죽');
        assert.equal(result.breakfast.riceType, '');
        assert.ok(!result.breakfast.summary.includes('진밥'));
        assert.deepEqual(applyFoodPersonalization(result, settings).plan, result);
    }
    const riceBowl = basePlan();
    Object.assign(riceBowl.breakfast, { main: '닭고기덮밥', riceType: '', summary: '닭고기덮밥 + 맑은 채소국' });
    assert.equal(applyFoodPersonalization(riceBowl, parseFoodPersonalization({ avoidedIngredients: ['nuts'] })).plan.breakfast.riceType, '');

    const sideDish = basePlan();
    Object.assign(sideDish.breakfast, { main: '버섯달걀찜', riceType: '잡곡밥' });
    const soft = applyFoodPersonalization(sideDish, parseFoodPersonalization({ texture: 'soft' })).plan;
    assert.equal(soft.breakfast.main, '버섯달걀찜');
    assert.equal(soft.breakfast.riceType, '진밥');
});

test('ingredient-driven porridge replacements remove previous rice after the final exclusion pass', () => {
    const plan = basePlan();
    for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
        Object.assign(plan[slot], { main: '달걀두부찜', riceType: '콩밥' });
    }
    for (const extra of [{}, { texture: 'soft' }, { symptoms: ['nausea'] }]) {
        const settings = parseFoodPersonalization({ ...extra, avoidedIngredients: AVOIDED_INGREDIENT_OPTIONS.map((option) => option.value) });
        let porridgeReplacements = 0;
        for (let day = 1; day <= 4; day += 1) {
            const result = applyFoodPersonalization({ ...plan, date: `2026-09-0${day}` }, settings).plan;
            for (const slot of ['breakfast', 'lunch', 'dinner'] as MealSlot[]) {
                if (result[slot].main !== '채소죽') continue;
                porridgeReplacements += 1;
                assert.equal(result[slot].riceType, '');
                assert.ok(result[slot].nutritionUnavailable);
                assert.ok(!result[slot].summary.includes('밥'));
            }
            assert.deepEqual(applyFoodPersonalization(result, settings).plan, result);
        }
        assert.ok(porridgeReplacements > 0, 'excluded protein dishes rotate through a real porridge replacement');
    }
});
