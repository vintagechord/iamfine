import assert from 'node:assert/strict';
import test from 'node:test';

const { DAILY_VERSES, getSeoulDateKey, getDailyVerse, millisecondsUntilNextSeoulDay } = await import(new URL('./dailyVerse.ts', import.meta.url).href) as typeof import('./dailyVerse');

test('the verse follows the Korean date independently of the device date or offset', () => {
    const beforeMidnight = new Date('2026-09-08T14:59:59.999Z');
    const atMidnight = new Date('2026-09-08T15:00:00.000Z');
    assert.equal(getSeoulDateKey(beforeMidnight), '2026-09-08');
    assert.equal(getSeoulDateKey(atMidnight), '2026-09-09');
    assert.equal(getDailyVerse(beforeMidnight), getDailyVerse(new Date('2026-09-08T00:00:00+09:00')));
    assert.equal(getDailyVerse(atMidnight), getDailyVerse(new Date('2026-09-09T00:00:00+09:00')));
    assert.notEqual(getDailyVerse(beforeMidnight), getDailyVerse(atMidnight));
});

test('daily rotation continues over month, year and leap-day boundaries', () => {
    for (const [before, after] of [
        ['2026-01-31T23:59:59+09:00', '2026-02-01T00:00:00+09:00'],
        ['2026-12-31T23:59:59+09:00', '2027-01-01T00:00:00+09:00'],
        ['2028-02-28T23:59:59+09:00', '2028-02-29T00:00:00+09:00'],
        ['2028-02-29T23:59:59+09:00', '2028-03-01T00:00:00+09:00'],
    ]) {
        const previousIndex = DAILY_VERSES.indexOf(getDailyVerse(new Date(before)));
        const nextIndex = DAILY_VERSES.indexOf(getDailyVerse(new Date(after)));
        assert.equal(nextIndex, (previousIndex + 1) % DAILY_VERSES.length);
    }
});

test('a full cycle provides unique passages and repeats without adjacent duplicates', () => {
    const start = new Date('2026-09-08T00:00:00+09:00').getTime();
    const cycle = Array.from({ length: DAILY_VERSES.length }, (_, day) => getDailyVerse(new Date(start + day * 86_400_000)));
    assert.ok(cycle.length >= 20);
    assert.equal(new Set(cycle.map((verse) => verse.reference)).size, cycle.length);
    assert.equal(new Set(cycle.map((verse) => verse.text)).size, cycle.length);
    const nextCycleStart = getDailyVerse(new Date(start + cycle.length * 86_400_000));
    assert.equal(nextCycleStart, cycle[0]);
    assert.notEqual(nextCycleStart, cycle[cycle.length - 1]);
});

test('the next update is scheduled for Korean midnight including date rollovers', () => {
    assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-09-08T14:59:59.999Z')), 1);
    assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-09-08T15:00:00.000Z')), 86_400_000);
    assert.equal(millisecondsUntilNextSeoulDay(new Date('2026-12-31T12:00:00+09:00')), 43_200_000);
    assert.equal(millisecondsUntilNextSeoulDay(new Date('2028-02-29T23:59:00+09:00')), 60_000);
});
