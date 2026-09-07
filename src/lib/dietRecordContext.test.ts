import assert from 'node:assert/strict';
import test from 'node:test';
import type { MealRecordItem, MealRecordLog } from './dietRecordContext';

const { buildDietRecordContext, applyMealRecordGuidance } = await import(new URL('./dietRecordContext.ts', import.meta.url).href) as typeof import('./dietRecordContext');
const { generatePlanForDate } = await import(new URL('./dietEngine.ts', import.meta.url).href) as typeof import('./dietEngine');
const item = (name: string, state: Partial<MealRecordItem> = {}): MealRecordItem => ({ name, eaten: true, ...state });
const emptyPattern = {
    analyzedDays: 0, skippedMealDays: 0, lowProteinDays: 0, lowVegetableDays: 0,
    highFlourSugarDays: 0, highSodiumDays: 0, spicyHeavyDays: 0,
};
const fullLog = (names: [string, string, string]): MealRecordLog => ({
    meals: { breakfast: [item(names[0])], lunch: [item(names[1])], dinner: [item(names[2])] },
});

test('missing, memo-only, medication-only and untouched records are not food-intake evidence', () => {
    const logs: Record<string, MealRecordLog> = {
        '2026-09-06': { meals: {}, memo: '오늘 진료받음' },
        '2026-09-05': { meals: {}, medicationTakenIds: ['medicine-1'] },
        '2026-09-04': { meals: { lunch: [item('달걀찜', { eaten: false, isManual: true, servings: 2 })] } },
    };
    assert.deepEqual(buildDietRecordContext(logs, '2026-09-07'), { recentDietPattern: emptyPattern, recentDietSignals: [] });
    assert.deepEqual(buildDietRecordContext({}, '2026-09-07').recentDietPattern, emptyPattern);
});

test('partial logging never implies missed meals or missing protein and vegetables', () => {
    for (const log of [
        { meals: { lunch: [item('흰밥')] } },
        { meals: { snack: [item('쿠키')] } },
        { meals: { breakfast: [item('흰밥', { eaten: false, notEaten: true }), item('두부찜', { eaten: false })] } },
    ] satisfies MealRecordLog[]) {
        const { recentDietPattern } = buildDietRecordContext({ '2026-09-06': log }, '2026-09-07');
        assert.deepEqual(recentDietPattern, { ...emptyPattern, analyzedDays: 1 });
    }
});

test('only an existing entirely not-eaten meal counts as explicitly skipped', () => {
    const log: MealRecordLog = {
        meals: {
            breakfast: [item('흰밥', { eaten: false, notEaten: true }), item('달걀찜', { eaten: false, notEaten: true })],
            lunch: [],
            dinner: [item('밥', { notEaten: true })],
        },
    };
    assert.deepEqual(buildDietRecordContext({ '2026-09-06': log }, '2026-09-07').recentDietPattern, {
        ...emptyPattern, analyzedDays: 1, skippedMealDays: 1,
    });
    const plan = generatePlanForDate('2026-09-07', 'other', 70);
    const result = applyMealRecordGuidance(plan, log);
    assert.equal(result.plan, plan);
    assert.equal(result.notes.length, 1);
    assert.ok(result.notes[0].includes('먹지 않았다고'));
});

test('food-name absence is counted only after all three main meals have a recorded status', () => {
    const noProteinOrVegetables = fullLog(['흰밥', '쌀죽', '감자찜']);
    assert.deepEqual(buildDietRecordContext({ '2026-09-06': noProteinOrVegetables }, '2026-09-07').recentDietPattern, {
        ...emptyPattern, analyzedDays: 1, lowProteinDays: 1, lowVegetableDays: 1,
    });
    // A recorded protein or vegetable is enough; item ratios cannot establish deficiency.
    for (const proteinName of ['계란찜', '소고기무국', '가자미찜', '새우찜']) {
        const recorded = fullLog([proteinName, '양배추찜', '흰밥']);
        assert.deepEqual(buildDietRecordContext({ '2026-09-06': recorded }, '2026-09-07').recentDietPattern, {
            ...emptyPattern, analyzedDays: 1,
        });
    }
});

test('frequency counts only marked food entries without multiplying guessed servings or overlapping names', () => {
    const oneItem: MealRecordLog = { meals: { lunch: [item('매운 라면', { servings: 10 }), item('쿠키', { eaten: false })] } };
    assert.deepEqual(buildDietRecordContext({ '2026-09-06': oneItem }, '2026-09-07').recentDietPattern, { ...emptyPattern, analyzedDays: 1 });
    const repeated: MealRecordLog = { meals: { lunch: [item('매운 라면')], dinner: [item('양념치킨'), item('쿠키'), item('장아찌')] } };
    assert.deepEqual(buildDietRecordContext({ '2026-09-06': repeated }, '2026-09-07').recentDietPattern, {
        ...emptyPattern, analyzedDays: 1, highFlourSugarDays: 1, highSodiumDays: 1, spicyHeavyDays: 1,
    });
});

test('full-date lookback boundaries preserve existing preference hints without treating them as symptoms', () => {
    const log: MealRecordLog = { meals: { lunch: [item('피자', { servings: 2 })] } };
    const today = buildDietRecordContext({ '2026-01-01': log }, '2026-01-01');
    assert.deepEqual(today.recentDietPattern, emptyPattern);
    assert.deepEqual(today.recentDietSignals, ['피자', '단백질 보강', '생선/해산물']);
    const lastPatternDay = buildDietRecordContext({ '2025-12-18': log }, '2026-01-01');
    assert.equal(lastPatternDay.recentDietPattern.analyzedDays, 1);
    assert.deepEqual(lastPatternDay.recentDietSignals, []);
    assert.equal(buildDietRecordContext({ '2025-12-19': log }, '2026-01-01').recentDietSignals[0], '피자');
    assert.deepEqual(buildDietRecordContext({ '2025-12-17': log, '2026-01-02': log }, '2026-01-01'), { recentDietPattern: emptyPattern, recentDietSignals: [] });
    assert.deepEqual(buildDietRecordContext({ '': log }, '2026-02-30'), { recentDietPattern: emptyPattern, recentDietSignals: [] });
});

test('record guidance keeps the identical plan and never derives portions, nutrients or compensatory menus', () => {
    const plan = generatePlanForDate('2026-09-07', 'other', 70);
    const before = JSON.stringify(plan);
    const logs: Array<MealRecordLog | undefined> = [
        undefined,
        { meals: {}, memo: '식사 기록은 아직 없음' },
        { meals: { lunch: [item('흰밥')] } },
        { meals: { snack: [item('쿠키', { servings: 20 })] } },
    ];
    for (const log of logs) {
        const result = applyMealRecordGuidance(plan, log);
        assert.equal(result.plan, plan);
        assert.deepEqual(result.notes, []);
    }
    const missingProtein = applyMealRecordGuidance(plan, fullLog(['흰밥', '양배추찜', '감자찜']));
    assert.equal(missingProtein.plan, plan);
    assert.equal(missingProtein.notes.length, 1);
    assert.ok(missingProtein.notes[0].includes('기록에는 단백질 식품 이름이 없어요'));
    const sweet = applyMealRecordGuidance(plan, { meals: { snack: [item('쿠키'), item('케이크'), item('도넛')] } });
    assert.equal(sweet.plan, plan);
    assert.equal(sweet.notes.length, 1);
    assert.ok(sweet.notes[0].includes('끼니를 거르지 말고'));
    assert.ok([...missingProtein.notes, ...sweet.notes].every((note) => !/\d|과식|부족|감량|보정/.test(note)));
    assert.equal(JSON.stringify(plan), before);
});

test('readonly partial page logs are accepted and inputs remain unchanged across repeated calls', () => {
    const food = Object.freeze(item('달걀찜'));
    const log = Object.freeze({ meals: Object.freeze({ lunch: Object.freeze([food]) }) });
    const logs = Object.freeze({ '2026-09-06': log });
    const first = buildDietRecordContext(logs, '2026-09-07');
    assert.deepEqual(buildDietRecordContext(logs, '2026-09-07'), first);
    assert.equal(log.meals.lunch[0], food);
});
