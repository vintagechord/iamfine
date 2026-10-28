import {
    buildRestaurantQueries, fetchRestaurantText, parseRestaurantSearch, parseVerifiedRestaurantPlaces,
    rankVerifiedRestaurants, restaurantAvailability, restaurantMapLinks, RESTAURANT_CATEGORY_LABELS,
    type RestaurantPlace, type RestaurantSource,
} from './restaurantSearch.ts';

function webSources(html: string): RestaurantSource[] {
    const sources = new Map<string, RestaurantSource>();
    for (const [, attributes, body] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        if (!/data-heatmap-target\s*=\s*["']\.tit["']/i.test(attributes)) continue;
        const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/g, '&');
        if (!href) continue;
        try {
            const url = new URL(href);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password || /^(?:search|map)\.naver\.com$/.test(url.hostname)) continue;
            const title = body.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
            if (title) sources.set(url.href, { title, url: url.href, source: url.hostname.replace(/^www\./, '') });
        } catch { /* Ignore malformed external links. */ }
        if (sources.size >= 20) break;
    }
    return [...sources.values()];
}

type SourceResult = { places: RestaurantPlace[]; sources: RestaurantSource[] };
type FinderOptions = { fetcher?: typeof fetch; now?: () => number; sourceTimeoutMs?: number; geocodeTimeoutMs?: number };

export function createRestaurantFinder({ fetcher = fetch, now = Date.now, sourceTimeoutMs = 5000, geocodeTimeoutMs = 3000 }: FinderOptions = {}) {
    // Cache only public food/place queries, never coordinates, profiles, failures or HTML pages.
    const cache = new Map<string, { expires: number; result: SourceResult }>();
    const findPlaces = async (query: string, signal: AbortSignal) => {
        signal.throwIfAborted();
        const cached = cache.get(query);
        if (cached && cached.expires > now()) return cached.result;
        cache.delete(query);
        const html = await fetchRestaurantText(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`, signal, sourceTimeoutMs, fetcher);
        if (!html.trim() || /captcha|자동입력\s*방지|비정상적인\s*접근|서비스\s*이용이\s*제한/i.test(html)) throw new Error('Restaurant search source blocked');
        const result = { places: parseVerifiedRestaurantPlaces(html), sources: webSources(html) };
        if (result.places.length > 0 && !signal.aborted) {
            if (cache.size >= 32) cache.delete(cache.keys().next().value!);
            cache.set(query, { expires: now() + 120_000, result });
        }
        return result;
    };

    const resolveRegion = async (lat: number, lng: number, signal: AbortSignal) => {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko,en`;
            const response = await fetcher(url, {
                headers: { 'User-Agent': 'Iamfine-RestaurantFinder/1.0', Accept: 'application/json' },
                cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(geocodeTimeoutMs)]),
            });
            if (!response.ok) return '';
            const json = await response.json() as { address?: Record<string, unknown> };
            const address = json.address ?? {};
            const city = [address.city, address.town, address.county, address.state].find((part) => typeof part === 'string' && part.trim());
            const district = [address.city_district, address.borough, address.suburb, address.state_district].find((part) => typeof part === 'string' && part.trim());
            return [...new Set([city, district].filter((part): part is string => typeof part === 'string'))].join(' ').replace(/<[^>]*>/g, '').trim().slice(0, 60);
        } catch { return ''; }
    };

    return async (params: URLSearchParams, signal: AbortSignal) => {
        const parsed = parseRestaurantSearch(params);
        if (!parsed.ok) return { status: 400, body: { message: parsed.message } };
        const search = parsed.value;
        const region = search.region || await resolveRegion(search.lat!, search.lng!, signal);
        signal.throwIfAborted();
        if (!region) return { status: 503, body: { availability: 'unavailable' as const, message: '위치의 지역명을 확인하지 못했어요. 지역명을 직접 입력해 주세요.' } };
        const queries = buildRestaurantQueries(search, region);
        const settled = await Promise.allSettled(queries.map((query) => findPlaces(query, signal)));
        signal.throwIfAborted();
        const succeeded = settled.filter((item): item is PromiseFulfilledResult<SourceResult> => item.status === 'fulfilled').map((item) => item.value);
        const items = rankVerifiedRestaurants(region, succeeded.flatMap((item) => item.places), succeeded.flatMap((item) => item.sources));
        const availability = restaurantAvailability(succeeded.length, queries.length, items.length);
        const message = availability === 'unavailable' ? '식당 검색에 연결하지 못했어요. 지도에서 같은 조건으로 찾아보세요.'
            : availability === 'partial' ? '일부 검색 결과를 불러오지 못했어요. 지도에서도 확인할 수 있어요.'
                : availability === 'empty' ? '확인 가능한 식당 정보를 불러오지 못했어요. 지도에서 이어서 찾아보세요.' : '';
        return {
            status: availability === 'unavailable' ? 503 : 200,
            body: {
                region, category: search.category, categoryLabel: RESTAURANT_CATEGORY_LABELS[search.category], keyword: search.keyword,
                queries, items, availability, message, sourceStatus: { succeeded: succeeded.length, total: queries.length },
                mapSearchUrls: restaurantMapLinks(region, search.keyword || RESTAURANT_CATEGORY_LABELS[search.category]),
                personalizationApplied: search.focusTerms.length > 0, personalizationFocusTerms: search.focusTerms,
                generatedAt: new Date(now()).toISOString(),
            },
        };
    };
}
