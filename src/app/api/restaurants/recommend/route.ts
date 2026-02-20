import { NextRequest, NextResponse } from 'next/server';

type FinderCategory = 'healthy' | 'veggie' | 'protein' | 'soft';

type WebSource = {
    title: string;
    url: string;
    source: string;
};

type PlaceCandidate = {
    placeId: string;
    name: string;
    naverMapUrl: string;
    baseScore: number;
};

type RecommendationItem = {
    name: string;
    score: number;
    reason: string;
    sourceCount: number;
    mapUrl: string;
    naverMapUrl?: string;
    sources: WebSource[];
};

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_REVALIDATE_SECONDS = 60 * 60 * 6;
const MAX_QUERY_COUNT = 4;
const MAX_WEB_SOURCE_COUNT = 40;
const MAX_RECOMMENDATION_COUNT = 12;

const CATEGORY_LABELS: Record<FinderCategory, string> = {
    healthy: '건강식 일반',
    veggie: '샐러드/채식',
    protein: '단백질 중심',
    soft: '부드러운 식사',
};

const CATEGORY_SEARCH_TERMS: Record<FinderCategory, string[]> = {
    healthy: ['건강식 맛집', '저염식 식당', '웰빙 식당', '저당 식단 식당'],
    veggie: ['샐러드 맛집', '포케 맛집', '채식 식당', '비건 식당'],
    protein: ['닭가슴살 식당', '생선구이 맛집', '단백질 식단 식당', '두부요리 맛집'],
    soft: ['죽 전문점', '순두부 식당', '맑은국 식당', '부드러운 식사 맛집'],
};

const PLACE_NAME_STOPWORDS = new Set([
    '맛집',
    '추천',
    '후기',
    '리뷰',
    '식당',
    '카페',
    '전문점',
    '서울',
    '부산',
    '대구',
    '인천',
    '광주',
    '대전',
    '울산',
    '수원',
    '성남',
    '고양',
    '용인',
    '천안',
    '전주',
    '청주',
    '포항',
    '창원',
    '제주',
]);

const PLACE_TRAILING_META_MARKERS = [
    '톡톡',
    '쿠폰',
    '포장',
    '배달',
    '예약',
    '주차',
    '메뉴',
    '리뷰',
    '사진',
    '길찾기',
    '전화',
    '영업중',
    '영업종료',
    '홈페이지',
    '이벤트',
    '할인',
] as const;

const PLACE_CATEGORY_TRAILING_TOKEN_REGEX =
    /^(?:한식|중식|일식|양식|분식|카페|디저트|치킨|피자|버거|족발|보쌈|고기|찌개(?:,전골)?|전골|국밥|백반|샤브샤브|샐러드|포케|브런치)$/u;

function decodeHtml(raw: string) {
    return raw
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#0*39;/g, "'");
}

function cleanText(raw: string) {
    return decodeHtml(raw)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizePlaceName(raw: string) {
    const noBracket = cleanText(raw)
        .replace(/\[[^\]]+\]\s*/g, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
    const tokens = noBracket.split(/\s+/).filter(Boolean);
    let cutIndex = tokens.length;

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index].replace(/[·|]/g, '').trim();
        if (!token) {
            continue;
        }
        const compact = token.toLowerCase();
        const hasMetaMarker = PLACE_TRAILING_META_MARKERS.some((marker) => compact.includes(marker));
        const isCategoryToken = PLACE_CATEGORY_TRAILING_TOKEN_REGEX.test(token);
        if ((hasMetaMarker || isCategoryToken) && index >= 1) {
            cutIndex = index;
            break;
        }
    }

    const trimmedByToken = tokens.slice(0, cutIndex).join(' ');
    return trimmedByToken
        .replace(
            /\s+(?:다이어트|샐러드(?:뷔페)?|채식|카페|도시락|컵밥|비건|포케|브런치|한식|일식|양식|분식|죽|패스트푸드)(?:[,/][^\s]+)*$/u,
            ''
        )
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function toAbsoluteUrl(raw: string) {
    const cleaned = decodeHtml(raw).trim();
    if (!cleaned) {
        return '';
    }

    try {
        return new URL(cleaned).toString();
    } catch {
        return '';
    }
}

function normalizeForMatch(value: string) {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim();
}

function unique<T>(items: T[]) {
    return Array.from(new Set(items));
}

function isLikelyPlaceName(name: string) {
    const cleaned = cleanText(name);
    if (!cleaned || cleaned.length < 2 || cleaned.length > 32) {
        return false;
    }

    if (/알림받기|길찾기|사진|리뷰|메뉴|더보기|예약|주문/.test(cleaned)) {
        return false;
    }

    return /[\p{L}\p{N}]/u.test(cleaned);
}

function placeNameTokens(name: string) {
    return unique(
        cleanText(name)
            .split(/[\s/·,|:()\-]+/)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !PLACE_NAME_STOPWORDS.has(token))
    );
}

function extractHost(url: string) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '웹';
    }
}

function buildKakaoMapSearchUrl(region: string, placeName: string) {
    const normalizedPlaceName = normalizePlaceName(placeName);
    const query = (normalizedPlaceName || placeName || region).trim();
    return `https://map.kakao.com/?q=${encodeURIComponent(query)}`;
}

function parseNaverPlaceCandidates(html: string) {
    const results: PlaceCandidate[] = [];
    const seen = new Set<string>();
    const regex =
        /<a[^>]+href="(https:\/\/map\.naver\.com\/p\/search\/[^"]*?\/place\/(\d+)[^"]*)"[^>]*class="[^"]*place_bluelink[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match = regex.exec(html);
    let rank = 0;

    while (match) {
        const href = toAbsoluteUrl(match[1]);
        const placeId = cleanText(match[2]);
        const title = normalizePlaceName(match[3]);

        if (href && placeId && title && isLikelyPlaceName(title) && !seen.has(placeId)) {
            rank += 1;
            seen.add(placeId);
            results.push({
                placeId,
                name: title,
                naverMapUrl: href,
                baseScore: 200 - rank,
            });
        }

        match = regex.exec(html);
    }

    return results;
}

function parseNaverWebSources(html: string) {
    const sources: WebSource[] = [];
    const seen = new Set<string>();
    const regex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*data-heatmap-target="\.tit"[^>]*>([\s\S]*?)<\/a>/gi;
    let match = regex.exec(html);

    while (match) {
        const url = toAbsoluteUrl(match[1]);
        const title = cleanText(match[2]);
        if (!url || !title) {
            match = regex.exec(html);
            continue;
        }

        if (
            /search\.naver\.com|map\.naver\.com/.test(url) ||
            /옵션|더보기|지도|검색|네이버뉴스|네이버 지도/i.test(title)
        ) {
            match = regex.exec(html);
            continue;
        }

        if (!seen.has(url)) {
            seen.add(url);
            sources.push({
                title,
                url,
                source: extractHost(url),
            });
        }

        match = regex.exec(html);
    }

    return sources;
}

function extractNamedCandidatesFromSources(sources: WebSource[]) {
    const named: Array<{ name: string; source: WebSource; score: number }> = [];

    for (const source of sources) {
        const title = source.title;
        const cleanTitle = cleanText(title).replace(/\s+/g, ' ').trim();
        if (!cleanTitle) {
            continue;
        }

        const matches = cleanTitle.match(/[가-힣A-Za-z0-9&·\s]{2,28}(?:점|식당|카페|비스트로|포케|샐러드)/g) ?? [];
        for (const rawName of matches) {
            const name = normalizePlaceName(rawName);
            if (!isLikelyPlaceName(name)) {
                continue;
            }
            named.push({
                name,
                source,
                score: 20,
            });
        }
    }

    return named;
}

function scoreRecommendations(
    region: string,
    category: FinderCategory,
    places: PlaceCandidate[],
    webSources: WebSource[]
) {
    const byName = new Map<string, RecommendationItem>();
    const normalizedWebSources = webSources.map((source) => ({
        source,
        normalizedTitle: normalizeForMatch(source.title),
    }));

    for (const place of places) {
        const name = normalizePlaceName(place.name);
        if (!isLikelyPlaceName(name)) {
            continue;
        }
        const normalizedName = normalizeForMatch(name);
        const tokens = placeNameTokens(name).map((token) => normalizeForMatch(token));
        const evidence: WebSource[] = [];

        for (const item of normalizedWebSources) {
            const titleMatchedByName = normalizedName.length >= 2 && item.normalizedTitle.includes(normalizedName);
            const tokenMatchCount = tokens.filter((token) => token.length >= 2 && item.normalizedTitle.includes(token)).length;
            if (!titleMatchedByName && tokenMatchCount === 0) {
                continue;
            }
            evidence.push(item.source);
            if (evidence.length >= 4) {
                break;
            }
        }

        const key = normalizeForMatch(name);
        const score = place.baseScore + evidence.length * 25;
        const reason =
            evidence.length > 0
                ? `${CATEGORY_LABELS[category]} 관련 웹 문서 ${evidence.length}건에서 언급된 식당이에요.`
                : '';

        const previous = byName.get(key);
        if (!previous || previous.score < score) {
            byName.set(key, {
                name,
                score,
                reason,
                sourceCount: evidence.length,
                mapUrl: buildKakaoMapSearchUrl(region, name),
                naverMapUrl: place.naverMapUrl,
                sources: evidence,
            });
        }
    }

    if (byName.size === 0) {
        const fallbackCandidates = extractNamedCandidatesFromSources(webSources);
        for (const fallback of fallbackCandidates) {
            const key = normalizeForMatch(fallback.name);
            if (byName.has(key)) {
                continue;
            }
            byName.set(key, {
                name: normalizePlaceName(fallback.name),
                score: fallback.score,
                reason: `${CATEGORY_LABELS[category]} 관련 웹 문서에서 추출한 식당명이에요.`,
                sourceCount: 1,
                mapUrl: buildKakaoMapSearchUrl(region, fallback.name),
                sources: [fallback.source],
            });
        }
    }

    return Array.from(byName.values())
        .sort((a, b) => b.score - a.score || b.sourceCount - a.sourceCount || a.name.localeCompare(b.name, 'ko'))
        .slice(0, MAX_RECOMMENDATION_COUNT);
}

function safeCoordinate(raw: string | null, min: number, max: number) {
    if (!raw) {
        return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return null;
    }
    return parsed;
}

async function fetchText(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko,en-US;q=0.8,en;q=0.6',
        },
        next: { revalidate: FETCH_REVALIDATE_SECONDS },
    });

    if (!response.ok) {
        throw new Error(`fetch failed: ${response.status}`);
    }

    return response.text();
}

async function resolveRegionByCoordinates(lat: number | null, lng: number | null) {
    if (lat === null || lng === null) {
        return '';
    }

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ko,en`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/json',
            },
            next: { revalidate: FETCH_REVALIDATE_SECONDS },
        });

        if (!response.ok) {
            return '';
        }

        const json = (await response.json()) as {
            address?: Record<string, string>;
        };
        const address = json.address ?? {};
        const regionParts = unique([
            address.city_district ?? '',
            address.suburb ?? '',
            address.borough ?? '',
            address.city ?? '',
            address.town ?? '',
            address.county ?? '',
            address.state_district ?? '',
            address.state ?? '',
        ])
            .map((value) => cleanText(value))
            .filter((value) => value.length > 0);

        return regionParts.slice(0, 2).join(' ');
    } catch {
        return '';
    }
}

function buildSearchQueries(region: string, category: FinderCategory, keyword: string) {
    const terms = CATEGORY_SEARCH_TERMS[category] ?? CATEGORY_SEARCH_TERMS.healthy;
    const set = new Set<string>();
    const normalizedKeyword = cleanText(keyword);
    if (normalizedKeyword) {
        set.add(`${region} ${normalizedKeyword}`);
        set.add(`${region} ${normalizedKeyword} 맛집`);
        set.add(`${region} ${normalizedKeyword} 식당`);
    }
    terms.forEach((term) => {
        set.add(`${region} ${term}`);
    });
    set.add(`${region} 건강식 맛집`);
    return Array.from(set).slice(0, MAX_QUERY_COUNT);
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const categoryRaw = (searchParams.get('category') || 'healthy').trim() as FinderCategory;
    const category: FinderCategory =
        categoryRaw === 'healthy' || categoryRaw === 'veggie' || categoryRaw === 'protein' || categoryRaw === 'soft'
            ? categoryRaw
            : 'healthy';
    const lat = safeCoordinate(searchParams.get('lat'), -90, 90);
    const lng = safeCoordinate(searchParams.get('lng'), -180, 180);
    const keyword = cleanText(searchParams.get('keyword') || '').slice(0, 32);

    const manualRegion = cleanText(searchParams.get('region') || '');
    const resolvedRegion = manualRegion || (await resolveRegionByCoordinates(lat, lng)) || '내 주변';
    const queries = buildSearchQueries(resolvedRegion, category, keyword);

    const searchTasks = queries.map((query) =>
        fetchText(`https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(query)}`)
    );
    const settled = await Promise.allSettled(searchTasks);
    const htmlList = settled
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);

    const placePool = htmlList.flatMap((html) => parseNaverPlaceCandidates(html));
    const webSourcePool = htmlList.flatMap((html) => parseNaverWebSources(html));
    const dedupedWebSourcePool = unique(webSourcePool.map((item) => JSON.stringify(item)))
        .map((raw) => JSON.parse(raw) as WebSource)
        .slice(0, MAX_WEB_SOURCE_COUNT);
    const recommendations = scoreRecommendations(resolvedRegion, category, placePool, dedupedWebSourcePool);

    return NextResponse.json({
        region: resolvedRegion,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        keyword,
        queries,
        items: recommendations,
        generatedAt: new Date().toISOString(),
    });
}
