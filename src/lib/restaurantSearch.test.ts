import assert from 'node:assert/strict';
import test from 'node:test';
const { parseRestaurantSearch, buildRestaurantQueries, restaurantFocusTermsFromFoodSignals, restaurantMapLinks, parseVerifiedRestaurantPlaces, rankVerifiedRestaurants, restaurantAvailability, fetchRestaurantText } = await import(new URL('./restaurantSearch.ts', import.meta.url).href) as typeof import('./restaurantSearch');

test('location and coordinate validation never silently searches near an unknown location', () => {
    for (const query of ['', 'lat=37', 'lng=127', 'lat=NaN&lng=127', 'lat=91&lng=127', 'lat=37&lng=181', 'category=oops&region=서울', `region=${'가'.repeat(61)}`]) assert.equal(parseRestaurantSearch(new URLSearchParams(query)).ok, false, query);
    for (const query of ['region=서울역', 'lat=0&lng=0', 'region=종로구&category=soft']) assert.equal(parseRestaurantSearch(new URLSearchParams(query)).ok, true, query);
});

test('outgoing searches contain only location, selected foods and allowlisted food terms', () => {
    const params = new URLSearchParams({region:'서울역',category:'healthy', cancerType:'유방암',cancerStage:'3기',stageLabel:'항암',condition:'당뇨',dietSignal:'환자 정보', personalized:'1'});
    params.append('focus','유방암'); params.append('focus','저염식 식당'); params.append('focus','저염식 식당');
    const parsed = parseRestaurantSearch(params); assert.ok(parsed.ok);
    const queries = buildRestaurantQueries(parsed.value,'서울역');
    assert.equal(queries.length,4); assert.ok(queries.every((q) => q.startsWith('서울역 ')));
    assert.ok(!JSON.stringify(queries).match(/유방암|3기|항암|당뇨|환자/));
    assert.deepEqual(parsed.value.focusTerms,['저염식 식당']);
    assert.deepEqual(restaurantFocusTermsFromFoodSignals(['항암','유방암','피자','저염 음식','생선/해산물']),['저염식 식당','생선구이 식당']);
});

test('explicit dishes remain in every query and category-incompatible focus terms are discarded', () => {
    const parsed = parseRestaurantSearch(new URLSearchParams('region=서울역&category=veggie&focus=생선구이 식당&focus=단백질 식사&focus=채소 요리'));
    assert.ok(parsed.ok); assert.deepEqual(parsed.value.focusTerms, ['채소 요리']);
    assert.ok(buildRestaurantQueries(parsed.value, '서울역').every((query) => !/생선|단백질/.test(query)));
    const keyword = parseRestaurantSearch(new URLSearchParams('region=서울역&category=healthy&keyword=죽&focus=생선구이 식당'));
    assert.ok(keyword.ok); assert.ok(buildRestaurantQueries(keyword.value, '서울역').every((query) => query.includes('죽')));
});

test('place parser handles attribute ordering and canonicalizes only official HTTPS place IDs', () => {
    const html = `<a class="place_bluelink" href='https://map.naver.com/p/search/서울/place/123?x=1&amp;y=2'><span>바른밥 서울역점</span></a>
    <a href="https://m.place.naver.com/restaurant/123/home">바른밥 서울역점</a>
    <a href="https://pcmap.place.naver.com/restaurant/456/home" class="place_bluelink">바른밥 강남점</a>
    <a href="javascript:alert(1)">위험 식당</a><a href="https://map.naver.com.evil.test/p/entry/place/7">가짜 식당</a>
    <a href="https://map.naver.com@evil.test/place/8">다른 식당</a><a href="https://blog.naver.com/post">서울 추천 식당 후기</a>`;
    const places = parseVerifiedRestaurantPlaces(html);
    assert.deepEqual(places.map((p)=>p.placeId),['123','456']);
    assert.equal(places[0].name,'바른밥 서울역점');
    assert.equal(places[0].naverMapUrl,'https://map.naver.com/p/entry/place/123');
    assert.deepEqual(parseVerifiedRestaurantPlaces('<a href="https://blog.naver.com/a">강남 맛집 행복한 식당</a>'),[]);
});

test('action links never become restaurant names or hide a later named place link', () => {
    const html = `<a href="https://m.place.naver.com/restaurant/123/booking">예약하기</a>
        <a href="https://m.place.naver.com/restaurant/123/home">홈</a>
        <a href="https://m.place.naver.com/restaurant/456/review/visitor">방문자 리뷰 128</a>
        <a href="https://map.naver.com/p/entry/place/789">방문자 리뷰 8</a>
        <a class="place_bluelink" href="https://map.naver.com/p/entry/place/123">바른밥 서울역점</a>`;
    assert.deepEqual(parseVerifiedRestaurantPlaces(html).map(({ placeId, name }) => ({ placeId, name })), [{ placeId: '123', name: '바른밥 서울역점' }]);
});

test('same-named branches keep separate place IDs and unrelated partial-token mentions are not evidence', () => {
    const places = ['123','456'].map((placeId)=>({placeId,name:'바른밥 서울역점',naverMapUrl:`https://map.naver.com/p/entry/place/${placeId}`,baseScore:199}));
    const results=rankVerifiedRestaurants('서울역',[...places,places[0]],[{title:'서울역점 모음',url:'https://example.com/a',source:'example.com'},{title:'바른밥 서울역점 후기',url:'https://example.com/b',source:'example.com'}]);
    assert.equal(results.length,2); assert.ok(results.every((p)=>p.sourceCount===1));
    assert.equal(new URL(results[0].mapUrl).searchParams.get('q'),'서울역 바른밥 서울역점');
    assert.deepEqual(rankVerifiedRestaurants('서울역',[],[{title:'추천 식당',url:'https://example.com',source:'example.com'}]),[]);
});

test('map fallback retains selected region and food query; availability distinguishes failures and empty results', () => {
    const links=restaurantMapLinks('강남역','죽 전문점');
    assert.equal(new URL(links.kakao).searchParams.get('q'),'강남역 죽 전문점');
    assert.equal(decodeURIComponent(new URL(links.naver).pathname),'/p/search/강남역 죽 전문점');
    assert.equal(restaurantAvailability(0,4,0),'unavailable'); assert.equal(restaurantAvailability(2,4,0),'partial');
    assert.equal(restaurantAvailability(4,4,0),'empty'); assert.equal(restaurantAvailability(4,4,3),'ready');
});

test('upstream cancellation is propagated and timeout stops a stalled source', async () => {
    const fetcher = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve,reject)=>{
        const signal=init?.signal;
        if(signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});
    })) as typeof fetch;
    const controller=new AbortController(); controller.abort();
    await assert.rejects(fetchRestaurantText('https://example.com',controller.signal,50,fetcher), {name:'AbortError'});
    const keepAlive=setTimeout(()=>{},100);
    try { await assert.rejects(fetchRestaurantText('https://example.com',new AbortController().signal,5,fetcher),{name:'TimeoutError'}); } finally { clearTimeout(keepAlive); }
});
