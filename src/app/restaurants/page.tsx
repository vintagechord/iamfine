'use client';

import Link from 'next/link';
import { MapPinned, Search, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    restaurantMapLinks,
    type FinderCategory, type RestaurantAvailability, type RestaurantSource,
} from '@/lib/restaurantSearch';

type RecommendationItem = {
    placeId: string; name: string; reason: string; mapUrl: string; naverMapUrl: string; sources: RestaurantSource[];
};
type RecommendationResponse = {
    region?: string; items?: RecommendationItem[]; queries?: string[]; availability?: RestaurantAvailability;
    message?: string; generatedAt?: string; mapSearchUrls?: ReturnType<typeof restaurantMapLinks>;
};
type SearchContext = { region: string; lat: number | null; lng: number | null };
type FinderOption = { label: string; hint: string; keywords: string[] };
const FINDER_OPTIONS: Record<FinderCategory, FinderOption> = {
    healthy: { label: '한식·집밥', hint: '백반, 쌈밥, 두부요리처럼 평소 먹는 메뉴를 찾아요.', keywords: ['한식 백반', '쌈밥', '두부요리', '생선구이', '가정식', '저염식 한식'] },
    veggie: { label: '채소 중심', hint: '샐러드, 채식, 채소 요리 메뉴를 찾아요.', keywords: ['샐러드', '포케', '채식 식당', '비건 식당', '야채 샤브샤브', '버섯 요리'] },
    protein: { label: '생선·고기·두부', hint: '먹고 싶은 재료를 골라 찾아보세요.', keywords: ['생선구이', '닭요리', '두부요리', '오븐구이', '계란 요리', '소고기 구이'] },
    soft: { label: '부드러운 식사', hint: '죽, 수프, 순두부 메뉴가 있는 식당을 찾아요.', keywords: ['죽 전문점', '순두부', '들깨수프', '계란찜', '야채죽', '소고기죽'] },
};
const DELIVERY_PROVIDERS = [
    { name: '배달의민족', homepage: 'https://www.baemin.com' },
    { name: '요기요', homepage: 'https://www.yogiyo.co.kr/mobile' },
    { name: '쿠팡이츠', homepage: 'https://www.coupangeats.com' },
];

export default function RestaurantsPage() {
    const [selectedCategory, setSelectedCategory] = useState<FinderCategory>('healthy');
    const [selectedKeyword, setSelectedKeyword] = useState('');
    const [regionInput, setRegionInput] = useState('');
    const [searchContext, setSearchContext] = useState<SearchContext>({ region: '', lat: null, lng: null });
    const [resolvedRegion, setResolvedRegion] = useState('');
    const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
    const [usedQueries, setUsedQueries] = useState<string[]>([]);
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [recommendationError, setRecommendationError] = useState('');
    const [availability, setAvailability] = useState<RestaurantAvailability | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [responseMapLinks, setResponseMapLinks] = useState<ReturnType<typeof restaurantMapLinks> | null>(null);
    const [retryKey, setRetryKey] = useState(0);
    const requestVersion = useRef(0);
    const activeController = useRef<AbortController | null>(null);
    const locationVersion = useRef(0);
    const selected = FINDER_OPTIONS[selectedCategory];
    const hasSearchLocation = Boolean(searchContext.region || (searchContext.lat !== null && searchContext.lng !== null));
    const fallbackMapLinks = useMemo(() => {
        if (responseMapLinks) return responseMapLinks;
        const region = resolvedRegion || searchContext.region;
        return region ? restaurantMapLinks(region, selectedKeyword || selected.keywords[0]) : null;
    }, [responseMapLinks, resolvedRegion, searchContext.region, selectedKeyword, selected]);

    const cancelPendingSearch = () => {
        requestVersion.current += 1;
        activeController.current?.abort();
    };

    useEffect(() => {
        const controller = new AbortController();
        activeController.current = controller;
        const version = ++requestVersion.current;
        const isCurrent = () => requestVersion.current === version;
        let timedOut = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const search = async () => {
            setRecommendations([]);
            setUsedQueries([]);
            setResolvedRegion('');
            setResponseMapLinks(null);
            setAvailability(null);
            setStatusMessage('');
            setRecommendationError('');
            if (!searchContext.region && searchContext.lat === null) {
                setLoadingRecommendations(false);
                return;
            }
            setLoadingRecommendations(true);
            timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
            try {
                const params = new URLSearchParams({ category: selectedCategory });
                if (searchContext.region) params.set('region', searchContext.region);
                if (searchContext.lat !== null && searchContext.lng !== null) {
                    params.set('lat', String(searchContext.lat)); params.set('lng', String(searchContext.lng));
                }
                if (selectedKeyword) params.set('keyword', selectedKeyword);
                // Diagnosis, treatment stage and conditions stay out of API URLs and external search.
                const response = await fetch(`/api/restaurants/recommend?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
                const json = await response.json() as RecommendationResponse;
                if (!isCurrent() || controller.signal.aborted) return;
                setResolvedRegion(json.region || searchContext.region);
                setResponseMapLinks(json.mapSearchUrls ?? null);
                setUsedQueries(json.queries ?? []);
                setAvailability(json.availability ?? null);
                setStatusMessage(json.message ?? '');
                if (!response.ok) {
                    setRecommendationError(json.message || '식당 검색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
                    return;
                }
                setRecommendations(json.items ?? []);
            } catch {
                if (!isCurrent() || (controller.signal.aborted && !timedOut)) return;
                setAvailability('unavailable');
                setRecommendationError(timedOut ? '검색이 오래 걸리고 있어요. 지도에서 찾거나 다시 시도해 주세요.' : '식당 검색에 연결하지 못했어요. 지도에서 찾거나 다시 시도해 주세요.');
            } finally {
                clearTimeout(timeout);
                if (isCurrent()) setLoadingRecommendations(false);
            }
        };
        void search();
        return () => { requestVersion.current += 1; controller.abort(); clearTimeout(timeout); };
    }, [retryKey, searchContext, selectedCategory, selectedKeyword]);

    useEffect(() => {
        return () => { locationVersion.current += 1; };
    }, []);

    const updateContextByRegion = () => {
        const region = regionInput.trim();
        if (!region) { setRecommendationError('지역명을 입력해 주세요.'); return; }
        locationVersion.current += 1;
        setLocationLoading(false);
        cancelPendingSearch();
        setSearchContext({ region, lat: null, lng: null });
    };

    const updateContextByLocation = () => {
        if (!navigator.geolocation) { setRecommendationError('지역명을 직접 입력해 주세요. 이 브라우저에서는 위치를 사용할 수 없어요.'); return; }
        const version = ++locationVersion.current;
        setLocationLoading(true);
        setRecommendationError('');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (locationVersion.current !== version) return;
                cancelPendingSearch();
                setSearchContext({ region: '', lat: position.coords.latitude, lng: position.coords.longitude });
                setRegionInput('');
                setLocationLoading(false);
            },
            () => {
                if (locationVersion.current !== version) return;
                setRecommendationError('위치를 확인하지 못했어요. 지역명을 직접 입력해 주세요.');
                setLocationLoading(false);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
        );
    };

    return (
        <main className="mx-auto max-w-3xl space-y-4 py-6">
            <header className="flex items-start justify-between gap-3 px-1">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100"><MapPinned className="h-6 w-6 text-[var(--ui-accent)]" /> 식당 찾기</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">먹고 싶은 메뉴를 가까운 곳에서 찾아보세요.</p>
                </div>
                <Link href="/diet" className="uiButton uiButton--secondary uiButton--small shrink-0">오늘의 식단</Link>
            </header>

            <section className="uiCard p-4" aria-label="식당 검색 조건">
                <label htmlFor="restaurant-region" className="text-sm font-semibold text-gray-900 dark:text-gray-100">어디에서 드시나요?</label>
                <div className="mt-2 flex gap-2">
                    <input
                        id="restaurant-region" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" maxLength={60}
                        value={regionInput}
                        onChange={(event) => { locationVersion.current += 1; setLocationLoading(false); setRegionInput(event.target.value); }}
                        onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); updateContextByRegion(); } }}
                        placeholder="예: 서울역, 강남역, 종로구"
                        className="min-h-12 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-900 outline-none focus:border-[var(--ui-accent)] dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    />
                    <button type="button" onClick={updateContextByRegion} className="uiButton uiButton--primary shrink-0"><Search className="h-4 w-4" /><span>검색</span></button>
                </div>
                <button type="button" onClick={updateContextByLocation} disabled={locationLoading} className="uiButton uiButton--secondary uiButton--small mt-2"><MapPinned className="h-4 w-4" />{locationLoading ? '위치 확인 중…' : '내 위치 사용'}</button>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.entries(FINDER_OPTIONS) as Array<[FinderCategory, FinderOption]>).map(([key, option]) => (
                        <button key={key} type="button" onClick={() => { if (selectedCategory === key && !selectedKeyword) return; cancelPendingSearch(); setSelectedKeyword(''); setSelectedCategory(key); }} aria-pressed={selectedCategory === key}
                            className={`uiButton ${selectedCategory === key ? 'uiButton--primary' : 'uiButton--secondary'}`}>{option.label}</button>
                    ))}
                </div>
                <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">{selected.hint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {selected.keywords.map((keyword) => (
                        <button key={keyword} type="button" onClick={() => { cancelPendingSearch(); setSelectedKeyword((previous) => previous === keyword ? '' : keyword); }}
                            className={`uiButton uiButton--small ${selectedKeyword === keyword ? 'uiButton--primary' : 'uiButton--secondary'}`} aria-pressed={selectedKeyword === keyword}>{keyword}</button>
                    ))}
                </div>
            </section>

            <section className="uiCard p-4" aria-label="식당 검색 결과" aria-busy={loadingRecommendations}>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{resolvedRegion || searchContext.region || '주변 식당'}{recommendations.length > 0 ? ` · ${recommendations.length}곳` : ''}</h2>
                <div aria-live="polite" role="status">
                    {loadingRecommendations ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">식당을 찾고 있어요…</p>
                        : recommendationError ? <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">{recommendationError}</p>
                            : statusMessage ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{statusMessage}</p>
                                : !hasSearchLocation ? <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">지역을 검색하거나 내 위치를 사용해 주세요.</p> : null}
                </div>
                {fallbackMapLinks && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <a href={fallbackMapLinks.naver} target="_blank" rel="noreferrer" className="uiButton uiButton--secondary uiButton--small">네이버지도에서 찾기</a>
                        <a href={fallbackMapLinks.kakao} target="_blank" rel="noreferrer" className="uiButton uiButton--secondary uiButton--small">카카오맵에서 찾기</a>
                    </div>
                )}
                {!loadingRecommendations && hasSearchLocation && (availability === 'unavailable' || availability === 'partial' || recommendationError) && (
                    <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="uiButton uiButton--secondary uiButton--small mt-3">다시 불러오기</button>
                )}
                {recommendations.length > 0 && (
                    <>
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">메뉴와 조리 방법, 영업 여부는 방문 전 매장에 확인해 주세요.</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {recommendations.map((item) => (
                                <article key={item.placeId} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                                    <h3 className="break-words text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</h3>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <a href={item.naverMapUrl} target="_blank" rel="noreferrer" className="uiButton uiButton--primary uiButton--small">네이버지도</a>
                                        <a href={item.mapUrl} target="_blank" rel="noreferrer" className="uiButton uiButton--secondary uiButton--small">카카오맵</a>
                                    </div>
                                    {item.sources.length > 0 && (
                                        <details className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                                            <summary className="cursor-pointer py-2">관련 글 {item.sources.length}개</summary>
                                            <div className="mt-1 space-y-2">{item.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block break-words underline underline-offset-2">{source.title}</a>)}</div>
                                        </details>
                                    )}
                                </article>
                            ))}
                        </div>
                    </>
                )}
                {usedQueries.length > 0 && (
                    <details className="mt-4 text-xs text-gray-500 dark:text-gray-400"><summary className="cursor-pointer py-2">검색에 사용한 메뉴</summary><p className="mt-1 leading-relaxed">{usedQueries.join(' · ')}</p></details>
                )}
            </section>

            <details className="uiCard p-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100"><Truck className="mr-2 inline h-4 w-4" />배달 앱에서 찾기</summary>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">앱에서 메뉴나 식당 이름을 검색하고, 배달 가능한 지역인지 확인해 주세요.</p>
                <div className="mt-3 flex flex-wrap gap-2">{DELIVERY_PROVIDERS.map((provider) => <a key={provider.name} href={provider.homepage} target="_blank" rel="noreferrer" className="uiButton uiButton--secondary uiButton--small">{provider.name}</a>)}</div>
            </details>
        </main>
    );
}
