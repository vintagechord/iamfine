'use client';

import Link from 'next/link';
import { BellRing, Leaf, MapPinned, Search, Soup, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';

type FinderCategory = 'healthy' | 'veggie' | 'protein' | 'soft';

type FinderOption = {
    label: string;
    hint: string;
    keywords: string[];
};

const KAKAO_MAP_SEARCH_BASE_URL = 'https://map.kakao.com/?q=';

const FINDER_OPTIONS: Record<FinderCategory, FinderOption> = {
    healthy: {
        label: '건강식 일반',
        hint: '저염·담백한 한식 중심으로 찾기 좋아요.',
        keywords: ['건강식 식당', '저염식 한식', '한식 백반', '쌈밥', '두부요리', '죽 전문점'],
    },
    veggie: {
        label: '샐러드/채식',
        hint: '샐러드, 포케, 채식·비건 식당 중심으로 탐색해요.',
        keywords: ['샐러드 전문점', '포케', '채식 식당', '비건 식당', '야채 샤브샤브', '샤브샤브'],
    },
    protein: {
        label: '단백질 중심',
        hint: '생선·닭가슴살 등 단백질 위주 식당을 우선해요.',
        keywords: ['생선구이', '닭가슴살 식당', '두부요리', '오븐구이', '포케', '연어 샐러드'],
    },
    soft: {
        label: '부드러운 식사',
        hint: '치료 중 부담이 적은 죽/국/담백식 위주로 찾아요.',
        keywords: ['죽 전문점', '맑은 국', '순두부', '된장찌개', '들깨수프', '연두부'],
    },
};

function buildKakaoMapSearchUrl(keyword: string) {
    return `${KAKAO_MAP_SEARCH_BASE_URL}${encodeURIComponent(keyword)}`;
}

export default function RestaurantsPage() {
    const [selectedCategory, setSelectedCategory] = useState<FinderCategory>('healthy');
    const selected = FINDER_OPTIONS[selectedCategory];
    const quickKeywords = useMemo(() => selected.keywords.slice(0, 6), [selected]);

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
                        <a
                            key={`${selectedCategory}-${keyword}`}
                            href={buildKakaoMapSearchUrl(keyword)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
                        >
                            <Search className="h-3.5 w-3.5" />
                            {keyword}
                        </a>
                    ))}
                </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">배달 연동 준비</p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        요기요/배민과 연결 시, 현재 식단 기준 키워드에 맞는 메뉴를 자동 추천하는 구조로 확장할 예정이에요.
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <p>- 키워드 기반 메뉴 후보 수집</p>
                        <p>- 저염/저당/단백질 필터 우선 적용</p>
                        <p>- 사용자 기록 기반 재정렬</p>
                    </div>
                </article>

                <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">예약/방문 연동 준비</p>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                        캐치테이블 연동 시, 치료 단계와 선호 키워드를 반영한 식당 탐색·예약 연결로 확장할 수 있어요.
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <p>- 식당 유형별 태그 정규화</p>
                        <p>- 메뉴/알레르기/조리법 메모 반영</p>
                        <p>- 재방문 이력 기반 추천 강화</p>
                    </div>
                </article>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">빠른 시작 키워드</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <a
                        href={buildKakaoMapSearchUrl('건강식 식당')}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                        <Leaf className="mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        건강식 식당
                    </a>
                    <a
                        href={buildKakaoMapSearchUrl('샐러드 전문점')}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                        <Leaf className="mb-1 h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        샐러드 전문점
                    </a>
                    <a
                        href={buildKakaoMapSearchUrl('죽 전문점')}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                        <Soup className="mb-1 h-4 w-4 text-amber-600 dark:text-amber-300" />
                        죽 전문점
                    </a>
                </div>
            </section>
        </main>
    );
}
