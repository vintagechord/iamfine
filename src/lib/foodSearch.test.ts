import assert from 'node:assert/strict';
import test from 'node:test';

const { FOOD_SEARCH_CATALOG, searchFoods } = await import(new URL('./foodSearch.ts', import.meta.url).href) as typeof import('./foodSearch');

test('catalog includes granular everyday dishes across food families', () => {
    assert.ok(FOOD_SEARCH_CATALOG.length >= 1500);
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

test('mushroom porridge suggests porridges instead of unrelated vegetable sides', () => {
    const results = searchFoods('버섯죽');
    assert.equal(results[0]?.name, '소고기버섯죽');
    assert.equal(results[1]?.name, '버섯들깨죽');
    assert.ok(results.length > 5);
    assert.ok(results.every((item) => /죽$|미음$/.test(item.name) || item.name === '오트밀'));
    assert.ok(results.some((item) => item.matchType === 'related' && item.reason === '죽 종류'));
});

test('specific dish endings outrank ingredients and generic rice families', () => {
    for (const [query, expectedFamily] of [
        ['소고기덮밥', '볶음밥·덮밥'],
        ['버섯찌개', '찌개·전골'],
        ['브로콜리수프', '수프'],
        ['소고기국밥', '국·탕'],
    ]) {
        const related = searchFoods(query).filter((item) => item.matchType === 'related');
        assert.ok(related.length > 0, query);
        assert.ok(related.every((item) => item.reason === `${expectedFamily} 종류`), query);
    }
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


test('expanded catalog covers regional Korean meals, world cuisines and everyday foods', () => {
    const representativeFoods = [
        '헛제삿밥', '성게미역국', '나주곰탕', '언양불고기', '보리굴비', '총각김치', '모시송편',
        '들기름막국수', '병천순대', '고등어김치찜', '우렁강된장', '두부강정', '유부초밥',
        '동파육', '라즈지', '샤오룽바오', '지삼선', '하가우', '하이난치킨라이스',
        '돈코츠라멘', '오야코동', '히츠마부시', '가라아게', '샥슈카', '팔라펠',
        '버터치킨', '팔락파니르', '치킨비리야니', '똠얌꿍', '반미', '나시고렝',
        '엔칠라다', '세비체', '페이조아다', '라타투이', '비프웰링턴', '피시앤칩스',
        '잠봉뵈르', '바스크치즈케이크', '아몬드크루아상', '레드향', '아보카도',
        '고추참치', '냉동만두', '밀크셰이크', '고구마라떼', '크림치즈', '강낭콩',
    ];
    for (const name of representativeFoods) {
        const result = searchFoods(name, [], 1)[0];
        assert.equal(result?.name, name, name);
        assert.equal(result?.matchType, 'exact', name);
    }
});

test('international and everyday alternative spellings resolve without inventing a specific dish', () => {
    for (const [query, expected] of [
        ['나시고랭', '나시고렝'], ['샤오롱바오', '샤오룽바오'], ['똠양꿍', '똠얌꿍'],
        ['쭈꾸미볶음', '주꾸미볶음'], ['떡볶기', '떡볶이'], ['카르보나라', '까르보나라'],
        ['butter chicken', '버터치킨'], ['banh mi', '반미'], ['hummus', '후무스'],
    ]) {
        assert.equal(searchFoods(query)[0]?.name, expected, query);
        assert.equal(searchFoods(query)[0]?.matchType, 'alias', query);
    }
    const genericPasta = searchFoods('pasta');
    assert.ok(genericPasta.length >= 5);
    assert.ok(genericPasta.every((item) => item.matchType !== 'exact' && item.matchType !== 'alias'));
});

test('recognized dish searches do not substitute raw ingredients or different dish types', () => {
    assert.ok(!searchFoods('버터치킨').some((item) => item.name === '버터'));
    const porridge = searchFoods('매생이굴죽');
    assert.ok(porridge.some((item) => item.name === '굴죽'));
    assert.ok(!porridge.some((item) => item.name === '매생이굴국'));
    assert.ok(!searchFoods('브로콜리수프').some((item) => item.name === '브로콜리'));
});

test('unknown names stay unforced and cached histories stay isolated', () => {
    for (const query of ['constructor', 'unlistedmealxyz', 'zzqxv', '등록되지않은음식xyz']) {
        assert.deepEqual(searchFoods(query), [], query);
    }
    const firstHistory = ['우리집특별식알파'];
    const secondHistory = ['우리집특별식베타'];
    assert.equal(searchFoods(firstHistory[0], firstHistory)[0]?.matchType, 'exact');
    assert.equal(searchFoods(secondHistory[0], secondHistory)[0]?.matchType, 'exact');
    assert.ok(!searchFoods('우리집특별식', secondHistory).some((item) => item.name === firstHistory[0]));
});

test('every exported catalog name can be found as itself', () => {
    assert.equal(new Set(FOOD_SEARCH_CATALOG).size, FOOD_SEARCH_CATALOG.length);
    for (const name of FOOD_SEARCH_CATALOG) {
        const result = searchFoods(name, [], 1)[0];
        assert.equal(result?.name, name, name);
        assert.equal(result?.matchType, 'exact', name);
    }
});
