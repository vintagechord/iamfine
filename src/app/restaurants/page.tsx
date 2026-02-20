'use client';

import Link from 'next/link';
import { MapPinned, Search, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type FinderCategory = 'healthy' | 'veggie' | 'protein' | 'soft';

type FinderOption = {
    label: string;
    hint: string;
    keywords: string[];
};

type RecommendationSource = {
    title: string;
    url: string;
    source: string;
};

type RecommendationItem = {
    name: string;
    score: number;
    reason: string;
    sourceCount: number;
    mapUrl: string;
    naverMapUrl?: string;
    sources: RecommendationSource[];
};

type RecommendationResponse = {
    region: string;
    category: FinderCategory;
    categoryLabel: string;
    keyword?: string;
    queries: string[];
    items: RecommendationItem[];
    generatedAt: string;
};

type SearchContext = {
    region: string;
    lat: number | null;
    lng: number | null;
};

type DeliveryProvider = {
    name: string;
    description: string;
    homepage: string;
    searchUrlTemplate?: string;
};

const FINDER_OPTIONS: Record<FinderCategory, FinderOption> = {
    healthy: {
        label: '건강식 일반',
        hint: '저염·담백한 한식 중심으로 찾기 좋아요.',
        keywords: [
            '건강식 식당',
            '저염식 한식',
            '한식 백반',
            '쌈밥',
            '두부요리',
            '죽 전문점',
            '가정식 백반',
            '생선구이 백반',
            '나물 반찬',
            '현미밥 식당',
            '국물 적은 한식',
            '담백한 식당',
            '웰빙 한식',
            '저자극 식당',
            '집밥 스타일 식당',
        ],
    },
    veggie: {
        label: '샐러드/채식',
        hint: '샐러드, 포케, 채식·비건 식당 중심으로 탐색해요.',
        keywords: [
            '샐러드 전문점',
            '포케',
            '채식 식당',
            '비건 식당',
            '야채 샤브샤브',
            '샤브샤브',
            '그린볼',
            '비건 브런치',
            '채소 덮밥',
            '두부 샐러드',
            '곡물볼',
            '렌틸콩 샐러드',
            '채식 도시락',
            '버섯 요리',
            '비건 카페',
        ],
    },
    protein: {
        label: '단백질 중심',
        hint: '생선·닭가슴살 등 단백질 위주 식당을 우선해요.',
        keywords: [
            '생선구이',
            '닭가슴살 식당',
            '두부요리',
            '오븐구이',
            '포케',
            '연어 샐러드',
            '훈제오리 샐러드',
            '참치 포케',
            '소고기 안심',
            '계란 요리',
            '단백질 도시락',
            '닭안심 샐러드',
            '해산물 샐러드',
            '그릭요거트 볼',
            '두유 스무디',
        ],
    },
    soft: {
        label: '부드러운 식사',
        hint: '치료 중 부담이 적은 죽/국/담백식 위주로 찾아요.',
        keywords: [
            '죽 전문점',
            '맑은 국',
            '순두부',
            '된장찌개',
            '들깨수프',
            '연두부',
            '계란찜',
            '야채죽',
            '소고기죽',
            '미음',
            '북어국',
            '콩나물국',
            '부드러운 한식',
            '연식 가능 식당',
            '소화 편한 식사',
        ],
    },
};

const DELIVERY_PROVIDERS: DeliveryProvider[] = [
    {
        name: '배달의민족',
        description: '배민1/가게배달 포함 주요 배달 플랫폼',
        homepage: 'https://www.baemin.com',
    },
    {
        name: '요기요',
        description: '지역 기반 배달 식당 탐색과 포장 주문 지원',
        homepage: 'https://www.yogiyo.co.kr/mobile',
        searchUrlTemplate: 'https://www.yogiyo.co.kr/mobile/#/search/',
    },
    {
        name: '쿠팡이츠',
        description: '빠른 배달 중심의 지역 식당 탐색 플랫폼',
        homepage: 'https://www.coupangeats.com',
    },
];

export default function RestaurantsPage() {
    const [selectedCategory, setSelectedCategory] = useState<FinderCategory>('healthy');
    const [selectedKeyword, setSelectedKeyword] = useState<string>('');
    const [regionInput, setRegionInput] = useState('서울');
    const [searchContext, setSearchContext] = useState<SearchContext>({
        region: '서울',
        lat: null,
        lng: null,
    });
    const [resolvedRegion, setResolvedRegion] = useState('');
    const [usedQueries, setUsedQueries] = useState<string[]>([]);
    const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
    const [generatedAt, setGeneratedAt] = useState('');
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [recommendationError, setRecommendationError] = useState('');

    const selected = FINDER_OPTIONS[selectedCategory];
    const quickKeywords = useMemo(
        () => Array.from(new Set(selected.keywords.map((keyword) => keyword.trim()).filter(Boolean))),
        [selected]
    );
    const deliveryKeywords = useMemo(() => {
        const recommendationKeywords = recommendations.map((item) => item.name.trim()).filter(Boolean);
        const merged = [...recommendationKeywords, ...quickKeywords];
        return Array.from(new Set(merged)).slice(0, 6);
    }, [quickKeywords, recommendations]);

    const deliveryRestaurantNames = useMemo(() => {
        return recommendations.map((item) => item.name).filter(Boolean).slice(0, 6);
    }, [recommendations]);

    const generatedAtLabel = useMemo(() => {
        if (!generatedAt) {
            return '';
        }
        const date = new Date(generatedAt);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${month}/${day} ${hours}:${minutes}`;
    }, [generatedAt]);

    const fetchRecommendations = useCallback(
        async (context: SearchContext) => {
            setLoadingRecommendations(true);
            setRecommendationError('');

            try {
                const params = new URLSearchParams();
                params.set('category', selectedCategory);
                if (context.region.trim()) {
                    params.set('region', context.region.trim());
                }
                if (context.lat !== null && context.lng !== null) {
                    params.set('lat', String(context.lat));
                    params.set('lng', String(context.lng));
                }
                if (selectedKeyword.trim()) {
                    params.set('keyword', selectedKeyword.trim());
                }

                const response = await fetch(`/api/restaurants/recommend?${params.toString()}`, {
                    cache: 'no-store',
                });
                if (!response.ok) {
                    throw new Error(`추천 API 오류: ${response.status}`);
                }

                const json = (await response.json()) as RecommendationResponse;
                setRecommendations(json.items ?? []);
                setUsedQueries(json.queries ?? []);
                const nextResolvedRegion = json.region ?? context.region;
                setResolvedRegion(nextResolvedRegion);
                if (context.lat !== null && context.lng !== null && nextResolvedRegion.trim()) {
                    setRegionInput(nextResolvedRegion);
                }
                setGeneratedAt(json.generatedAt ?? '');
            } catch (error) {
                console.error(error);
                setRecommendationError('추천 식당을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
                setRecommendations([]);
                setUsedQueries([]);
            } finally {
                setLoadingRecommendations(false);
            }
        },
        [selectedCategory, selectedKeyword]
    );

    useEffect(() => {
        void fetchRecommendations(searchContext);
    }, [fetchRecommendations, searchContext]);

    useEffect(() => {
        setSelectedKeyword('');
    }, [selectedCategory]);

    useEffect(() => {
        if (!navigator.geolocation) {
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setSearchContext({
                    region: '',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            () => {
                // 권한 거부/실패 시 기존 지역 입력 기반 검색을 유지.
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 5 * 60 * 1000,
            }
        );
    }, []);

    const updateContextByRegion = () => {
        const nextRegion = regionInput.trim() || '서울';
        setSearchContext((prev) => ({
            region: nextRegion,
            lat: prev.lat,
            lng: prev.lng,
        }));
    };

    const updateContextByLocation = () => {
        if (!navigator.geolocation) {
            setRecommendationError('브라우저에서 위치 기능을 지원하지 않아요. 지역명을 직접 입력해 주세요.');
            return;
        }

        setLocationLoading(true);
        setRecommendationError('');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setSearchContext({
                    region: '',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
                setLocationLoading(false);
            },
            () => {
                setRecommendationError('위치 권한이 없거나 위치를 가져오지 못했어요. 지역명을 입력해 검색해 주세요.');
                setLocationLoading(false);
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 5 * 60 * 1000,
            }
        );
    };

    return (
        <main className="mx-auto max-w-3xl space-y-4 py-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">건강식당 찾기</h1>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            치료 상황에 맞는 식당을 키워드로 빠르게 찾을 수 있어요.
                        </p>
                    </div>
                    <Link
                        href="/"
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        홈으로
                    </Link>
                </div>
            </section>

            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2">
                    <MapPinned className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                    <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">추천 검색 카테고리</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.entries(FINDER_OPTIONS) as Array<[FinderCategory, FinderOption]>).map(([key, option]) => {
                        const selectedState = selectedCategory === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedCategory(key)}
                                className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                                    selectedState
                                        ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                                        : 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100 dark:hover:bg-emerald-900/40'
                                }`}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">{selected.hint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {quickKeywords.map((keyword) => (
                        <button
                            key={`${selectedCategory}-${keyword}`}
                            type="button"
                            onClick={() => setSelectedKeyword((prev) => (prev === keyword ? '' : keyword))}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                selectedKeyword === keyword
                                    ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                                    : 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100 dark:hover:bg-emerald-900/40'
                            }`}
                            aria-pressed={selectedKeyword === keyword}
                        >
                            <Search className="h-3.5 w-3.5" />
                            {keyword}
                        </button>
                    ))}
                </div>
                {selectedKeyword && (
                    <p className="mt-2 text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                        적용 중 키워드: {selectedKeyword}
                    </p>
                )}
                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
                    선택한 카테고리 키워드 + 위치(또는 지역명)로 웹 문서를 수집하고, 언급 식당을 점수화해 추천해요.
                </p>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">위치 기반 추천 식당</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {resolvedRegion ? `기준 지역: ${resolvedRegion}` : '기준 지역을 찾는 중'}
                        {generatedAtLabel ? ` · ${generatedAtLabel} 업데이트` : ''}
                    </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input
                        value={regionInput}
                        onChange={(event) => setRegionInput(event.target.value)}
                        placeholder="예: 서울역, 강남역, 종로구"
                        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    />
                    <button
                        type="button"
                        onClick={updateContextByRegion}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                        지역으로 검색
                    </button>
                    <button
                        type="button"
                        onClick={updateContextByLocation}
                        disabled={locationLoading}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
                    >
                        {locationLoading ? '위치 확인 중…' : '내 위치 사용'}
                    </button>
                </div>
                {usedQueries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {usedQueries.map((query) => (
                            <span
                                key={`${selectedCategory}-${query}`}
                                className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200"
                            >
                                {query}
                            </span>
                        ))}
                    </div>
                )}
                {recommendationError && (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                        {recommendationError}
                    </p>
                )}
                {loadingRecommendations ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">추천 식당을 분석 중이에요…</p>
                ) : recommendations.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        아직 추천 결과가 없어요. 지역명을 입력하거나 위치 권한을 허용해 다시 시도해 주세요.
                    </p>
                ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {recommendations.map((item) => (
                            <article
                                key={`${item.name}-${item.score}`}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100">
                                        근거 {item.sourceCount}건
                                    </span>
                                </div>
                                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{item.reason}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <a
                                        href={item.mapUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        카카오맵 보기
                                    </a>
                                    {item.naverMapUrl && (
                                        <a
                                            href={item.naverMapUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                        >
                                            네이버지도 근거
                                        </a>
                                    )}
                                </div>
                                {item.sources.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                        {item.sources.slice(0, 3).map((source) => (
                                            <a
                                                key={`${item.name}-${source.url}`}
                                                href={source.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                            >
                                                [{source.source}] {source.title}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="grid gap-3">
                <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">배달 업체/식당 보기</p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        현재 추천 키워드를 기준으로 배달 업체와 배달 가능한 식당을 바로 확인할 수 있어요.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {DELIVERY_PROVIDERS.map((provider) => (
                            <article
                                key={provider.name}
                                className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{provider.name}</p>
                                    <a
                                        href={provider.homepage}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        플랫폼 열기
                                    </a>
                                </div>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{provider.description}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {deliveryKeywords.slice(0, 3).map((keyword) =>
                                        provider.searchUrlTemplate ? (
                                            <a
                                                key={`${provider.name}-${keyword}`}
                                                href={`${provider.searchUrlTemplate}${encodeURIComponent(keyword)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-100 dark:hover:bg-sky-900/50"
                                            >
                                                {keyword}
                                            </a>
                                        ) : (
                                            <span
                                                key={`${provider.name}-${keyword}`}
                                                className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                                            >
                                                {keyword}
                                            </span>
                                        )
                                    )}
                                </div>
                                {!provider.searchUrlTemplate && (
                                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                        플랫폼 내 검색창에서 위 키워드로 검색해 보세요.
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-950/40">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">배달 가능한 식당 후보</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {deliveryRestaurantNames.length > 0 ? (
                                deliveryRestaurantNames.map((name) => (
                                    <span
                                        key={`delivery-restaurant-${name}`}
                                        className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100"
                                    >
                                        {name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    상단 추천 결과가 생성되면 배달 식당 후보를 함께 보여드려요.
                                </span>
                            )}
                        </div>
                    </div>
                </article>

                {/* 예약/방문 연동 준비는 추후 구현 단계에서 다시 활성화 예정 */}
                {/*
                <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    ...
                </article>
                */}
            </section>
        </main>
    );
}
