export type FinderCategory = 'healthy' | 'veggie' | 'protein' | 'soft';
export type RestaurantSearch = { category: FinderCategory; region: string; keyword: string; lat: number | null; lng: number | null; focusTerms: string[] };
export type RestaurantSource = { title: string; url: string; source: string };
export type RestaurantPlace = { placeId: string; name: string; naverMapUrl: string; baseScore: number };

export const RESTAURANT_CATEGORY_LABELS: Record<FinderCategory, string> = {
    healthy: '건강식 일반', veggie: '샐러드/채식', protein: '단백질 중심', soft: '부드러운 식사',
};
const CATEGORY_TERMS: Record<FinderCategory, string[]> = {
    healthy: ['한식 백반', '두부요리 식당', '생선구이 식당', '건강식 식당'],
    veggie: ['샐러드 식당', '포케 식당', '채식 식당', '비건 식당'],
    protein: ['생선구이 식당', '닭요리 식당', '두부요리 식당', '단백질 식사'],
    soft: ['죽 전문점', '순두부 식당', '수프 식당', '부드러운 식사'],
};
const FOOD_FOCUS = [
    ['저염', '저염식 식당'], ['부드러운', '부드러운 식사'], ['생선', '생선구이 식당'],
    ['두부', '두부요리 식당'], ['채소', '채소 요리'], ['단백질', '단백질 식사'],
] as const;
const ALLOWED_FOCUS = new Set<string>(FOOD_FOCUS.map(([, term]) => term));
const CATEGORY_FOCUS: Record<FinderCategory, readonly string[]> = {
    healthy: [...ALLOWED_FOCUS], veggie: ['채소 요리', '두부요리 식당'],
    protein: ['생선구이 식당', '두부요리 식당', '단백질 식사'], soft: ['부드러운 식사'],
};

export function restaurantFocusTermsFromFoodSignals(signals: readonly string[]) {
    // Only ordinary food terms leave the browser; diagnosis, stage and condition names do not.
    return FOOD_FOCUS.filter(([keyword]) => signals.some((signal) => signal.includes(keyword))).map(([, term]) => term).slice(0, 3);
}

function cleanText(value: string) {
    return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseRestaurantSearch(params: URLSearchParams): { ok: true; value: RestaurantSearch } | { ok: false; message: string } {
    const category = params.get('category') || 'healthy';
    if (!Object.hasOwn(RESTAURANT_CATEGORY_LABELS, category)) return { ok: false, message: '식사 종류를 다시 선택해 주세요.' };
    const region = cleanText(params.get('region') || '');
    const keyword = cleanText(params.get('keyword') || '');
    if (region.length > 60 || keyword.length > 40) return { ok: false, message: '지역과 음식 이름을 짧게 입력해 주세요.' };
    const latRaw = params.get('lat');
    const lngRaw = params.get('lng');
    const lat = latRaw?.trim() ? Number(latRaw) : null;
    const lng = lngRaw?.trim() ? Number(lngRaw) : null;
    if ((lat !== null || lng !== null) && (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
        return { ok: false, message: '위치를 확인하지 못했어요. 지역명을 입력해 주세요.' };
    }
    if (!region && lat === null) return { ok: false, message: '지역명을 입력하거나 내 위치를 선택해 주세요.' };
    const focusTerms = [...new Set(params.getAll('focus').filter((term) => CATEGORY_FOCUS[category as FinderCategory].includes(term)))].slice(0, 3);
    return { ok: true, value: { category: category as FinderCategory, region, keyword, lat, lng, focusTerms } };
}

export function buildRestaurantQueries(search: RestaurantSearch, region: string) {
    // A selected dish must remain in every query; category defaults must not dilute that choice.
    const terms = search.keyword
        ? [search.keyword, `${search.keyword} 식당`, `${search.keyword} 메뉴`, `${search.keyword} 맛집`]
        : [...CATEGORY_TERMS[search.category].slice(0, 3), ...search.focusTerms, ...CATEGORY_TERMS[search.category].slice(3)];
    return [...new Set(terms.map((term) => `${region} ${term}`.trim()))].slice(0, 4);
}

export function restaurantMapLinks(region: string, keyword: string) {
    const query = [cleanText(region), cleanText(keyword)].filter(Boolean).join(' ');
    return {
        naver: `https://map.naver.com/p/search/${encodeURIComponent(query)}`,
        kakao: `https://map.kakao.com/?q=${encodeURIComponent(query)}`,
    };
}

function placeIdentity(href: string) {
    try {
        const url = new URL(href.replace(/&amp;/g, '&'));
        if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
        if (!['map.naver.com', 'm.place.naver.com', 'pcmap.place.naver.com', 'place.naver.com'].includes(url.hostname)) return null;
        // Booking/review/menu links identify actions, not restaurant names.
        const match = url.pathname.match(/\/(?:place|restaurant)\/(\d{1,20})(?:\/home)?\/?$/);
        return match?.[1] ?? null;
    } catch { return null; }
}

export function parseVerifiedRestaurantPlaces(html: string): RestaurantPlace[] {
    const places = new Map<string, RestaurantPlace>();
    const anchors = html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi);
    for (const [, attributes, body] of anchors) {
        const href = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (!href) continue;
        const placeId = placeIdentity(href);
        if (!placeId || places.has(placeId)) continue;
        // Only a named place link is a candidate; prose from search results is never a place name.
        const name = cleanText(body).replace(/\s+(?:네이버페이|톡톡|쿠폰|예약|메뉴|리뷰|사진|길찾기|영업중|영업종료)(?:\s.*)?$/, '').trim();
        if (name.length < 2 || name.length > 60 || /^(?:홈|메뉴|메뉴판|리뷰|방문자|블로그|사진|길찾기|예약(?:하기)?|전화|더보기|자세히\s*보기|네이버지도)(?:\s|$)/.test(name)) continue;
        places.set(placeId, { placeId, name, naverMapUrl: `https://map.naver.com/p/entry/place/${placeId}`, baseScore: Math.max(0, 200 - places.size) });
    }
    return [...places.values()];
}

function normalizeName(value: string) { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''); }

export function rankVerifiedRestaurants(region: string, places: RestaurantPlace[], sources: RestaurantSource[]) {
    const uniquePlaces = new Map<string, RestaurantPlace>();
    for (const place of places) {
        const previous = uniquePlaces.get(place.placeId);
        if (!previous || previous.baseScore < place.baseScore) uniquePlaces.set(place.placeId, place);
    }
    return [...uniquePlaces.values()].map((place) => {
        const name = normalizeName(place.name);
        const evidence = [...new Map(sources.filter((source) => {
            try { if (!/^https?:$/.test(new URL(source.url).protocol)) return false; } catch { return false; }
            return name.length >= 3 && normalizeName(source.title).includes(name);
        }).map((source) => [source.url, source])).values()].slice(0, 3);
        return {
            ...place, score: place.baseScore + evidence.length * 5,
            reason: '메뉴와 영업 여부는 지도에서 확인해 주세요.',
            sourceCount: evidence.length, mapUrl: restaurantMapLinks(region, place.name).kakao, sources: evidence,
        };
    }).sort((a, b) => b.score - a.score || a.placeId.localeCompare(b.placeId)).slice(0, 12);
}

export type RestaurantAvailability = 'ready' | 'partial' | 'empty' | 'unavailable';
export function restaurantAvailability(successCount: number, attemptCount: number, itemCount: number): RestaurantAvailability {
    if (successCount === 0) return 'unavailable';
    if (successCount < attemptCount) return 'partial';
    return itemCount > 0 ? 'ready' : 'empty';
}

export async function fetchRestaurantText(url: string, signal: AbortSignal, timeoutMs = 5000, fetcher: typeof fetch = fetch) {
    const response = await fetcher(url, {
        headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ko,en;q=0.5' },
        cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    });
    if (!response.ok) throw new Error(`Restaurant source unavailable (${response.status})`);
    return response.text();
}
