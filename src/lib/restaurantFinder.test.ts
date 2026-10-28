import assert from 'node:assert/strict';
import test from 'node:test';
const { createRestaurantFinder } = await import(new URL('./restaurantFinder.ts', import.meta.url).href) as typeof import('./restaurantFinder');
const params = () => new URLSearchParams({ region: '서울역', category: 'soft', keyword: '죽 전문점' });
const signal = () => new AbortController().signal;
const place = '<a class="place_bluelink" href="https://map.naver.com/p/entry/place/123">서울죽 서울역점</a>';

test('search orchestration validates first, bounds fanout, preserves verified identity and caches only successful places', async () => {
    let calls = 0; let active = 0; let peak = 0; let time = 0;
    const fetcher = (async (url: string | URL | Request) => {
        assert.match(String(url), /^https:\/\/search.naver.com\//);
        calls++; active++; peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5)); active--;
        return new Response(place);
    }) as typeof fetch;
    const find = createRestaurantFinder({ fetcher, now: () => time });
    assert.equal((await find(new URLSearchParams(), signal())).status, 400); assert.equal(calls, 0);
    const result = await find(params(), signal());
    assert.equal(result.status, 200); assert.equal(result.body.availability, 'ready');
    assert.equal(result.body.items?.[0].placeId, '123'); assert.equal(result.body.items?.length, 1);
    assert.equal(calls, 4); assert.equal(peak, 4);
    assert.equal(new URL(result.body.mapSearchUrls!.kakao).searchParams.get('q'), '서울역 죽 전문점');
    await find(params(), signal()); assert.equal(calls, 4);
    time = 120001; await find(params(), signal()); assert.equal(calls, 8);
});

test('complete outage remains retryable, partial results survive, and empty pages never fabricate names', async () => {
    let calls = 0;
    const failed = createRestaurantFinder({ fetcher: (async () => { calls++; return new Response('', { status: 503 }); }) as typeof fetch });
    const outage = await failed(params(), signal());
    assert.equal(outage.status, 503); assert.equal(outage.body.availability, 'unavailable'); assert.deepEqual(outage.body.items, []);
    assert.equal(new URL(outage.body.mapSearchUrls!.kakao).searchParams.get('q'), '서울역 죽 전문점');
    await failed(params(), signal()); assert.equal(calls, 8);
    let count = 0;
    const partial = createRestaurantFinder({ fetcher: (async () => ++count === 1 ? new Response(place) : new Response('', { status: 429 })) as typeof fetch });
    const result = await partial(params(), signal());
    assert.equal(result.status, 200); assert.equal(result.body.availability, 'partial'); assert.equal(result.body.items?.length, 1);
    const empty = createRestaurantFinder({ fetcher: (async () => new Response('<a href="https://blog.naver.com/a">서울역 훌륭한 죽 식당</a>')) as typeof fetch });
    const noPlaces = await empty(params(), signal());
    assert.equal(noPlaces.body.availability, 'empty'); assert.deepEqual(noPlaces.body.items, []);
    const blocked = createRestaurantFinder({ fetcher: (async () => new Response('<html>자동입력 방지</html>')) as typeof fetch });
    assert.equal((await blocked(params(), signal())).body.availability, 'unavailable');
});

test('failed reverse lookup never runs locationless searches and coordinates are never cached or forwarded to search', async () => {
    const requested: string[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
        requested.push(String(url)); assert.equal(init?.cache, 'no-store');
        return new Response('{}', { status: 503 });
    }) as typeof fetch;
    const find = createRestaurantFinder({ fetcher });
    assert.equal((await find(new URLSearchParams({ lat: '37.55', lng: '126.97' }), signal())).status, 503);
    assert.equal(requested.length, 1); assert.match(requested[0], /nominatim/);
    await find(new URLSearchParams({ lat: '37.55', lng: '126.97' }), signal()); assert.equal(requested.length, 2);
    const lookup = createRestaurantFinder({ fetcher: (async (url: string | URL | Request) => {
        if (String(url).includes('nominatim')) return Response.json({ address: { city: '서울', city_district: '중구' } });
        const query = new URL(String(url)).searchParams.get('query')!;
        assert.match(query, /^서울 중구 /); assert.doesNotMatch(query, /37\.55|126\.97/);
        return new Response(place);
    }) as typeof fetch });
    assert.equal((await lookup(new URLSearchParams({ lat: '37.55', lng: '126.97' }), signal())).body.region, '서울 중구');
});

test('request abort and stalled upstream sources cannot produce a late successful response', async () => {
    const stalled = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
        if (init?.signal?.aborted) return reject(init.signal.reason);
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    })) as typeof fetch;
    const keepAlive = setTimeout(() => {}, 100);
    try {
        const find = createRestaurantFinder({ fetcher: stalled, sourceTimeoutMs: 5 });
        assert.equal((await find(params(), signal())).body.availability, 'unavailable');
        const controller = new AbortController();
        const pending = find(params(), controller.signal); controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
    } finally { clearTimeout(keepAlive); }
});

test('HTTP route preserves validation/outage/success status and disables response caching', async (t) => {
    let upstreamStatus = 503;
    t.mock.method(globalThis, 'fetch', async () => new Response(upstreamStatus === 200 ? place : '', { status: upstreamStatus }));
    const { GET } = await import(new URL('../app/api/restaurants/recommend/route.ts', import.meta.url).href) as { GET: (request: Request) => Promise<Response> };
    const base = 'https://app.example/api/restaurants/recommend';
    assert.equal((await GET(new Request(base))).status, 400);
    const outage = await GET(new Request(`${base}?${params()}`));
    assert.equal(outage.status, 503); assert.equal(outage.headers.get('cache-control'), 'private, no-store');
    const body = await outage.json(); assert.equal(body.availability, 'unavailable'); assert.ok(body.mapSearchUrls.naver);
    upstreamStatus = 200;
    const success = await GET(new Request(`${base}?${params()}`));
    assert.equal(success.status, 200); assert.equal((await success.json()).items[0].placeId, '123');
    const controller = new AbortController(); controller.abort();
    assert.equal((await GET(new Request(`${base}?${params()}`, { signal: controller.signal }))).status, 499);
});
