import assert from 'node:assert/strict';
import test from 'node:test';

const { FOOD_SEARCH_CATALOG, searchFoods } = await import(new URL('./foodSearch.ts', import.meta.url).href) as typeof import('./foodSearch');

test('catalog includes granular everyday dishes across food families', () => {
    assert.ok(FOOD_SEARCH_CATALOG.length > 450);
    for (const food of ['소고기버섯죽', '바지락순두부찌개', '버섯크림리조또', '궁중떡볶이', '락토프리우유']) {
        assert.equal(searchFoods(food)[0]?.name, food);
        assert.equal(searchFoods(food)[0]?.matchType, 'exact');
    }
});

test('spacing, serving suffixes and common spelling aliases resolve', () => {
    assert.equal(searchFoods(' 소고기 버섯죽 1인분 ')[0]?.name, '소고기버섯죽');
    assert.equal(searchFoods('계란말이')[0]?.name, '달걀말이');
    assert.equal(searchFoods('계란말이')[0]?.matchType, 'alias');
    assert.equal(searchFoods('돈까스')[0]?.name, '돈가스');
    assert.equal(searchFoods('야채죽')[0]?.name, '채소죽');
    assert.equal(searchFoods('크로와상')[0]?.name, '크루아상');
});

test('partial and misspelled queries return recognizable menus', () => {
    assert.ok(searchFoods('순두부').some((item) => item.name === '바지락순두부찌개'));
    const typo = searchFoods('소고기버섯쥭');
    assert.equal(typo[0]?.name, '소고기버섯죽');
    assert.equal(typo[0]?.matchType, 'typo');
});

test('unlisted dishes get explicitly related results without false exact matches', () => {
    const results = searchFoods('매생이굴죽');
    assert.ok(results.length > 0);
    assert.ok(results.every((item) => item.matchType === 'related'));
    assert.ok(results.every((item) => item.name.endsWith('죽') || item.name === '쌀미음' || item.name === '오트밀'));
    const branded = searchFoods('우리집특제마라탕');
    assert.equal(branded[0]?.name, '마라탕');
    assert.equal(branded[0]?.matchType, 'related');
});

test('unknown and empty queries do not recommend arbitrary character matches', () => {
    assert.deepEqual(searchFoods(''), []);
    assert.deepEqual(searchFoods('   '), []);
    assert.deepEqual(searchFoods('알수없는메뉴xyz'), []);
    assert.deepEqual(searchFoods('ㅁㄴㅇㄹ'), []);
});

test('personal history is searchable, canonical duplicates collapse, results are bounded', () => {
    assert.equal(searchFoods('우리집채소전', ['우리집채소전'])[0]?.matchType, 'exact');
    const results = searchFoods('계란', ['계란말이', '달걀 말이', '달걀말이']);
    assert.equal(results.filter((item) => item.name.includes('말이') && !item.name.includes('채소')).length, 1);
    assert.ok(searchFoods('죽', [], 5).length <= 5);
    assert.deepEqual(searchFoods('죽', [], 0), []);
});
