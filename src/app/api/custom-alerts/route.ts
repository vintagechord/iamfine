import { NextRequest, NextResponse } from 'next/server';
import { STAGE_TYPE_LABELS, type StageType } from '@/lib/dietEngine';

type AlertArticle = {
    source: string;
    title: string;
    url: string;
    publishedAt: string;
};

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_REVALIDATE_SECONDS = 60 * 60 * 24;
const SOURCE_LIMIT = 20;
const TOTAL_LIMIT = 60;
const MIN_ALERT_ITEMS = 3;
const RECENT_DAYS = 30;
const BACKFILL_DAYS = 180;
const KEYWORD_SEARCH_SOURCES = new Set([
    '구글 뉴스(키워드 검색)',
    '국민건강보험 보도자료(키워드 검색)',
    '국가암정보센터 암정보나눔터(키워드 검색)',
    '국가암정보센터 국가지원프로그램(키워드 검색)',
]);

const CANCER_PROFILE_KEYWORDS: Array<{ pattern: RegExp; keywords: string[] }> = [
    { pattern: /유방|breast/, keywords: ['유방암', '유방', 'breast cancer'] },
    { pattern: /갑상선|thyroid/, keywords: ['갑상선암', '갑상선', 'thyroid cancer'] },
    { pattern: /신장|신세포|kidney|renal/, keywords: ['신장암', '신장', 'renal cell carcinoma'] },
    { pattern: /자궁경부|cervical/, keywords: ['자궁경부암', '자궁경부', 'cervical cancer'] },
    { pattern: /폐|lung/, keywords: ['폐암', '폐', 'lung cancer'] },
    { pattern: /간|담도|liver|biliary/, keywords: ['간암', '담도암', 'liver cancer'] },
    { pattern: /대장|결장|직장|colon|colorectal/, keywords: ['대장암', '결장암', 'colorectal cancer'] },
    { pattern: /위|식도|gastric|esophageal/, keywords: ['위암', '식도암', 'gastric cancer'] },
    { pattern: /췌장|pancreas|pancreatic/, keywords: ['췌장암', '췌장', 'pancreatic cancer'] },
    { pattern: /림프|백혈병|골수종|hematologic|lymphoma|leukemia|myeloma/, keywords: ['혈액암', '림프종', '백혈병'] },
];

function decodeHtml(raw: string) {
    return raw
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#0*39;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => {
            const code = Number.parseInt(value, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        })
        .replace(/&#(\d+);/g, (_, value: string) => {
            const code = Number.parseInt(value, 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : _;
        });
}

function cleanText(raw: string) {
    return decodeHtml(raw)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanHref(raw: string) {
    return decodeHtml(raw).trim();
}

function normalizeArticleUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        const isNhisArticle = url.hostname.endsWith('nhis.or.kr') && url.searchParams.get('mode') === 'view';
        const articleNo = url.searchParams.get('articleNo');

        if (isNhisArticle && articleNo) {
            url.search = `?mode=view&articleNo=${encodeURIComponent(articleNo)}`;
        }

        return url.toString();
    } catch {
        return rawUrl.replace(/&amp;/g, '&');
    }
}

function absoluteUrl(base: string, href: string) {
    try {
        const resolved = new URL(cleanHref(href), base).toString();
        return normalizeArticleUrl(resolved);
    } catch {
        return '';
    }
}

function parseDateTimestamp(raw: string) {
    if (!raw) {
        return null;
    }
    const normalized = raw.replace(/\.\d+$/, '').replace(/\./g, '-');
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseDateValue(raw: string) {
    return parseDateTimestamp(raw) ?? 0;
}

function normalizeTitleKey(title: string) {
    return cleanText(title)
        .toLowerCase()
        .replace(/[\s"'`‘’“”.,;:!?()[\]{}\-_/\\]+/g, '')
        .trim();
}

function getDateBucket(raw: string) {
    const timestamp = parseDateTimestamp(raw);
    if (timestamp === null) {
        return '';
    }
    return new Date(timestamp).toISOString().slice(0, 10);
}

function isWithinRecentDays(raw: string, days: number) {
    const timestamp = parseDateTimestamp(raw);
    if (timestamp === null) {
        return false;
    }

    const now = Date.now();
    const from = now - days * 24 * 60 * 60 * 1000;
    return timestamp >= from && timestamp <= now;
}

function matchKeyword(text: string, keyword: string) {
    const normalizedText = text.toLowerCase().replace(/\s+/g, '');
    const normalizedKeyword = keyword.toLowerCase().trim().replace(/\s+/g, '');
    if (!normalizedKeyword) {
        return false;
    }
    return normalizedText.includes(normalizedKeyword);
}

function uniqueNonEmpty(values: string[]) {
    return Array.from(
        new Set(
            values
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
        )
    );
}

function buildCancerKeywords(cancerType: string) {
    const raw = cancerType.trim();
    const compact = raw.replace(/\s+/g, '');
    const keywords = [raw, compact];

    if (compact.endsWith('암') && compact.length > 1) {
        keywords.push(compact.slice(0, -1));
    }

    const normalized = compact.toLowerCase();
    CANCER_PROFILE_KEYWORDS.forEach((profile) => {
        if (profile.pattern.test(normalized)) {
            keywords.push(...profile.keywords);
        }
    });

    return uniqueNonEmpty(keywords);
}

function buildGoogleNewsQueries(cancerKeywords: string[]) {
    const queries = new Set<string>();
    const seedKeywords = cancerKeywords.slice(0, 3);

    seedKeywords.forEach((keyword) => {
        queries.add(`${keyword} 식단`);
        queries.add(`${keyword} 음식`);
        queries.add(`${keyword} 영양`);
    });

    queries.add('국가암정보센터 암환자 식단');
    return Array.from(queries).slice(0, 7);
}

function matchAnyKeyword(text: string, keywords: string[]) {
    return keywords.some((keyword) => matchKeyword(text, keyword));
}

function ensureMinimumItems(primary: AlertArticle[], fallback: AlertArticle[], minimum: number) {
    const merged = dedupeAndSort([...primary, ...fallback]);
    return merged.slice(0, Math.max(minimum, Math.min(TOTAL_LIMIT, merged.length)));
}

function dedupeAndSort(items: AlertArticle[]) {
    const seenUrls = new Set<string>();
    const seenTitleBuckets = new Set<string>();
    const deduped: AlertArticle[] = [];

    for (const item of items) {
        if (!item.url) {
            continue;
        }

        const normalizedUrl = normalizeArticleUrl(item.url);
        const titleKey = normalizeTitleKey(item.title);
        const dateBucket = getDateBucket(item.publishedAt);
        const titleBucketKey = titleKey && dateBucket ? `${titleKey}|${dateBucket}` : '';

        if (seenUrls.has(normalizedUrl)) {
            continue;
        }
        if (titleBucketKey && seenTitleBuckets.has(titleBucketKey)) {
            continue;
        }

        seenUrls.add(normalizedUrl);
        if (titleBucketKey) {
            seenTitleBuckets.add(titleBucketKey);
        }

        deduped.push({
            ...item,
            url: normalizedUrl,
        });
    }

    return deduped.sort((a, b) => parseDateValue(b.publishedAt) - parseDateValue(a.publishedAt));
}

function extractRssTag(block: string, tag: string) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = block.match(regex);
    return match ? cleanText(match[1]) : '';
}

function parseRssItems(xml: string, source: string, baseUrl: string) {
    const items: AlertArticle[] = [];
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
    for (const block of blocks) {
        const title = extractRssTag(block, 'title');
        const href = extractRssTag(block, 'link');
        const description = extractRssTag(block, 'description') || extractRssTag(block, 'content:encoded');
        const publishedAt = extractRssTag(block, 'pubDate');
        const url = absoluteUrl(baseUrl, href);

        if (!title || !url) {
            continue;
        }

        items.push({
            source,
            title: title || description,
            url,
            publishedAt,
        });
    }
    return items;
}

function parseCancerNotices(html: string) {
    const items: AlertArticle[] = [];
    const blocks = html.match(/<div class="slide__wrap">[\s\S]*?<\/div>/gi) ?? [];
    for (const block of blocks) {
        const linkMatch = block.match(/<a\s+href="([^"]+)"[^>]*class="txt"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) {
            continue;
        }
        const dateMatch = block.match(/<span class="date">([\s\S]*?)<\/span>/i);
        const url = absoluteUrl('https://www.cancer.go.kr', linkMatch[1]);
        const title = cleanText(linkMatch[2]);
        const publishedAt = dateMatch ? cleanText(dateMatch[1]) : '';
        if (!title || !url) {
            continue;
        }
        items.push({
            source: '국가암정보센터',
            title,
            url,
            publishedAt,
        });
    }
    return items;
}

function parseNhisNotices(html: string) {
    const items: AlertArticle[] = [];
    const sectionMatches = html.match(/<section id="newsTabpanel0[12]"[\s\S]*?<\/section>/gi) ?? [];
    for (const section of sectionMatches) {
        const source = section.includes('newsTabpanel02') ? '국민건강보험 보도자료' : '국민건강보험 공지사항';
        const liMatches = section.match(/<li>[\s\S]*?<\/li>/gi) ?? [];
        for (const li of liMatches) {
            const linkMatch = li.match(/<a\s+href="([^"]+)"[^>]*class="tit"[^>]*>([\s\S]*?)<\/a>/i);
            if (!linkMatch) {
                continue;
            }
            const dateMatch = li.match(/<span class="date">([\s\S]*?)<\/span>/i);
            const title = cleanText(linkMatch[2]);
            const url = absoluteUrl('https://www.nhis.or.kr', linkMatch[1]);
            const publishedAt = dateMatch ? cleanText(dateMatch[1]) : '';
            if (!title || !url) {
                continue;
            }
            items.push({
                source,
                title,
                url,
                publishedAt,
            });
        }
    }
    return items;
}

function parseNhisBoardSearch(html: string, source: string, boardBaseUrl: string) {
    const items: AlertArticle[] = [];
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

    for (const row of rows) {
        const linkMatch = row.match(/<a\s+href="([^"]*\?mode=view[^"]*)"[^>]*class="a-link"[^>]*>([\s\S]*?)<\/a>/i);
        if (!linkMatch) {
            continue;
        }

        const dateMatch = row.match(/<td>(\d{4}\.\d{2}\.\d{2})<\/td>/i);
        const titleFromBody = cleanText(linkMatch[2]);
        const titleFromAttrMatch = row.match(/class="a-link"[^>]*title="([^"]+)"/i);
        const titleFromAttr = titleFromAttrMatch ? cleanText(titleFromAttrMatch[1]).replace(/\s*자세히 보기$/, '') : '';
        const title = titleFromBody || titleFromAttr;
        const url = absoluteUrl(boardBaseUrl, linkMatch[1]);
        const publishedAt = dateMatch ? cleanText(dateMatch[1]) : '';

        if (!title || !url) {
            continue;
        }

        items.push({
            source,
            title,
            url,
            publishedAt,
        });
    }

    return items;
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCancerSearchSection(html: string, source: string, sectionName: string) {
    const items: AlertArticle[] = [];
    const sectionPattern = new RegExp(
        `<a\\s+name="Result_${escapeRegex(sectionName)}"\\s*><\\/a>[\\s\\S]*?(?=<a\\s+name="Result_|<div\\s+id="searchFooter"|<\\/body>)`,
        'i'
    );
    const sectionMatch = html.match(sectionPattern);
    if (!sectionMatch) {
        return items;
    }

    const dtMatches = sectionMatch[0].match(/<dt>[\s\S]*?<\/dt>/gi) ?? [];
    for (const dt of dtMatches) {
        const titleMatch = dt.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        if (!titleMatch) {
            continue;
        }
        const title = cleanText(titleMatch[2]);
        const url = absoluteUrl('https://www.cancer.go.kr', titleMatch[1]);
        if (!title || !url) {
            continue;
        }
        items.push({
            source,
            title,
            url,
            publishedAt: '',
        });
    }

    return items;
}

async function fetchText(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8',
        },
        next: { revalidate: FETCH_REVALIDATE_SECONDS },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
}

async function collectArticles(keyword: string, cancerKeywords: string[]) {
    const nhisKeyword = keyword || '유방암';
    const nhisPressSearchUrls = [
        `https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do?mode=list&srSearchKey=article_title_text&srSearchVal=${encodeURIComponent(nhisKeyword)}&article.offset=0&articleLimit=10`,
        `https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do?mode=list&srSearchKey=article_title_text&srSearchVal=${encodeURIComponent(nhisKeyword)}&article.offset=10&articleLimit=10`,
    ];
    const cancerSearchRequests = [
        {
            source: '국가암정보센터 암정보나눔터(키워드 검색)',
            sectionName: '암정보나눔터',
            url: `https://www.cancer.go.kr/RSS/front/Search.jsp?qt=${encodeURIComponent(nhisKeyword)}&menu=${encodeURIComponent('암정보나눔터')}&st=1&nh=15`,
        },
        {
            source: '국가암정보센터 암정보나눔터(키워드 검색)',
            sectionName: '암정보나눔터',
            url: `https://www.cancer.go.kr/RSS/front/Search.jsp?qt=${encodeURIComponent(nhisKeyword)}&menu=${encodeURIComponent('암정보나눔터')}&st=2&nh=15`,
        },
        {
            source: '국가암정보센터 국가지원프로그램(키워드 검색)',
            sectionName: '국가지원프로그램',
            url: `https://www.cancer.go.kr/RSS/front/Search.jsp?qt=${encodeURIComponent(nhisKeyword)}&menu=${encodeURIComponent('국가지원프로그램')}&st=1&nh=15`,
        },
    ];
    const googleNewsUrls = buildGoogleNewsQueries(cancerKeywords).map(
        (query) =>
            `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`
    );

    const [cancerHtml, nhisHtml, kdcaRss, mfdsRss] = await Promise.allSettled([
        fetchText('https://www.cancer.go.kr/'),
        fetchText('https://www.nhis.or.kr/nhis/index.do'),
        fetchText('https://www.kdca.go.kr/bbs/kdca/41/rssList.do?row=100'),
        fetchText('https://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0003'),
    ]);
    const nhisPressSearchResults = await Promise.allSettled(nhisPressSearchUrls.map((url) => fetchText(url)));
    const cancerKeywordSearchResults = await Promise.allSettled(cancerSearchRequests.map((request) => fetchText(request.url)));
    const googleNewsResults = await Promise.allSettled(googleNewsUrls.map((url) => fetchText(url)));

    const allItems: AlertArticle[] = [];

    if (cancerHtml.status === 'fulfilled') {
        allItems.push(...parseCancerNotices(cancerHtml.value));
    }
    if (nhisHtml.status === 'fulfilled') {
        allItems.push(...parseNhisNotices(nhisHtml.value));
    }
    if (kdcaRss.status === 'fulfilled') {
        allItems.push(...parseRssItems(kdcaRss.value, '질병관리청 보도자료', 'https://www.kdca.go.kr'));
    }
    if (mfdsRss.status === 'fulfilled') {
        allItems.push(...parseRssItems(mfdsRss.value, '식품의약품안전처 공지', 'https://www.mfds.go.kr'));
    }
    for (const result of nhisPressSearchResults) {
        if (result.status === 'fulfilled') {
            allItems.push(
                ...parseNhisBoardSearch(
                    result.value,
                    '국민건강보험 보도자료(키워드 검색)',
                    'https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do'
                )
            );
        }
    }
    cancerKeywordSearchResults.forEach((result, index) => {
        if (result.status !== 'fulfilled') {
            return;
        }
        const request = cancerSearchRequests[index];
        allItems.push(...parseCancerSearchSection(result.value, request.source, request.sectionName));
    });
    googleNewsResults.forEach((result) => {
        if (result.status !== 'fulfilled') {
            return;
        }
        allItems.push(...parseRssItems(result.value, '구글 뉴스(키워드 검색)', 'https://news.google.com'));
    });

    return dedupeAndSort(allItems);
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const cancerType = (searchParams.get('cancerType') || '유방암').trim();
    const cancerStage = (searchParams.get('cancerStage') || '2기').trim();
    const stageType = (searchParams.get('stageType') || 'medication') as StageType;
    const stageLabel = STAGE_TYPE_LABELS[stageType] ?? STAGE_TYPE_LABELS.medication;
    const keyword = cancerType || '유방암';
    const cancerKeywords = buildCancerKeywords(keyword);

    try {
        const allItems = await collectArticles(keyword, cancerKeywords);
        const filtered = allItems.filter(
            (item) => KEYWORD_SEARCH_SOURCES.has(item.source) || matchAnyKeyword(`${item.title} ${item.source}`, cancerKeywords)
        );
        const matched = dedupeAndSort(filtered);
        const recentOnly = matched.filter((item) => isWithinRecentDays(item.publishedAt, RECENT_DAYS));
        const backfillWindow = matched.filter(
            (item) => !item.publishedAt || isWithinRecentDays(item.publishedAt, BACKFILL_DAYS)
        );
        const prioritized = dedupeAndSort([...recentOnly, ...backfillWindow, ...matched]);

        const bySourceCount = new Map<string, number>();
        const limitedBySource = prioritized.filter((item) => {
            const count = bySourceCount.get(item.source) ?? 0;
            if (count >= SOURCE_LIMIT) {
                return false;
            }
            bySourceCount.set(item.source, count + 1);
            return true;
        });

        const items = limitedBySource.slice(0, TOTAL_LIMIT);
        const fallbackPool = dedupeAndSort([...matched, ...allItems]);
        const ensuredItems = items.length >= MIN_ALERT_ITEMS ? items : ensureMinimumItems(items, fallbackPool, MIN_ALERT_ITEMS);

        return NextResponse.json({
            summary: `${keyword} / ${cancerStage} / ${stageLabel} 기준 최근 1개월 소식`,
            keyword,
            items: ensuredItems,
        });
    } catch (error) {
        console.error('custom-alerts api failed', error);
        return NextResponse.json(
            {
                summary: `${keyword} / ${cancerStage} / ${stageLabel} 기준 최근 1개월 소식`,
                keyword,
                items: [],
            },
            { status: 200 }
        );
    }
}
