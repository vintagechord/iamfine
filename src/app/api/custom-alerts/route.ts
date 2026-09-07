import { NextRequest, NextResponse } from 'next/server';
import { filterAlertArticles, normalizeArticleUrl, type AlertArticle } from '@/lib/alertArticles';

const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_REVALIDATE_SECONDS = 60 * 60 * 24;
const SOURCE_LIMIT = 20;
const TOTAL_LIMIT = 60;
const GENERAL_ALERT_KEYWORDS = ['암환자', '암 환자', '암생존자', '암 생존자', '항암', '영양', '식단', '식사', '돌봄', '환아'];

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

function absoluteUrl(base: string, href: string) {
    try {
        const resolved = new URL(cleanHref(href), base).toString();
        return normalizeArticleUrl(resolved);
    } catch {
        return '';
    }
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

    if (compact.endsWith('암') && compact.length > 2) {
        keywords.push(compact.slice(0, -1));
    }

    const normalized = compact.toLowerCase();
    CANCER_PROFILE_KEYWORDS.forEach((profile) => {
        if (profile.pattern.test(normalized)) {
            keywords.push(...profile.keywords);
        }
    });

    return uniqueNonEmpty(keywords).filter((keyword) => keyword.length >= 2);
}

function buildGoogleNewsQueries(keyword: string) {
    return [
        `${keyword} (식단 OR 영양 OR 치료) when:70d`,
        `${keyword} (환자 OR 건강) when:70d`,
        `${keyword} (site:amc.seoul.kr OR site:snuh.org OR site:samsunghospital.com) when:70d`,
    ];
}

function matchAnyKeyword(text: string, keywords: string[]) {
    return keywords.some((keyword) => matchKeyword(text, keyword));
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
        let title = extractRssTag(block, 'title');
        const href = extractRssTag(block, 'link');
        const description = extractRssTag(block, 'description') || extractRssTag(block, 'content:encoded');
        const publishedAt = extractRssTag(block, 'pubDate') || extractRssTag(block, 'dc:date');
        const publisher = extractRssTag(block, 'source') || source;
        const publisherSuffix = ` - ${publisher}`;
        if (title.endsWith(publisherSuffix)) title = title.slice(0, -publisherSuffix.length).trim();
        if (title.length < 8 || /^(영양팀|의공팀|건강정보|건강이야기|암정보|공지사항|뉴스룸|서울대학교암병원)$/.test(title)) continue;
        const publisherUrl = block.match(/<source\b[^>]*url=["']([^"']+)["']/i)?.[1] ?? '';
        let isOfficial = source !== '구글 뉴스';
        try {
            const hostname = new URL(publisherUrl).hostname;
            isOfficial ||= ['amc.seoul.kr', 'snuh.org', 'samsunghospital.com', 'ncc.re.kr', 'cancer.go.kr'].some((host) => hostname === host || hostname.endsWith(`.${host}`));
        } catch {
            // A feed without a verified institution URL remains labelled as news.
        }
        const url = absoluteUrl(baseUrl, href);

        if (!title || !url) {
            continue;
        }

        items.push({
            source: publisher,
            kind: isOfficial ? 'official' : 'news',
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
            kind: 'official',
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
                kind: 'official',
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
            kind: 'official',
            title,
            url,
            publishedAt,
        });
    }

    return items;
}

function parseNccBoard(html: string, source: string, press: boolean) {
    const items: AlertArticle[] = [];
    for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
        const link = row.match(/<a\b[^>]*onclick=["'][^"']*fncView\(\s*(\d+)\s*\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
        const date = row.match(/<td\b[^>]*>\s*(\d{4}\.\d{2}\.\d{2})\s*<\/td>/i);
        if (!link || !date) continue;
        const title = cleanText(link[2]);
        if (!title) continue;
        items.push({
            source, kind: 'official', title, publishedAt: date[1],
            url: press
                ? `https://www.ncc.re.kr/prBoardView1.ncc?nwsId=${link[1]}`
                : `https://www.ncc.re.kr/boardView.ncc?uri=notice02&ntcId=${link[1]}`,
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
        signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
}

async function collectArticles(keyword: string) {
    const sources: Array<{ url: string; parse: (body: string) => AlertArticle[] }> = [
        { url: 'https://www.cancer.go.kr/', parse: parseCancerNotices },
        { url: 'https://www.nhis.or.kr/nhis/index.do', parse: parseNhisNotices },
        { url: 'https://www.kdca.go.kr/bbs/kdca/41/rssList.do?row=100', parse: (body) => parseRssItems(body, '질병관리청', 'https://www.kdca.go.kr') },
        { url: 'https://www.mfds.go.kr/www/rss/brd.do?brdId=ntc0003', parse: (body) => parseRssItems(body, '식품의약품안전처', 'https://www.mfds.go.kr') },
        { url: 'https://www.ncc.re.kr/board.ncc?uri=notice02&pageNum=1', parse: (body) => parseNccBoard(body, '국립암센터 · 환자 교육·행사', false) },
    ];
    // Fetch dated original publications, including institution notices outside news RSS.
    for (const page of [1, 2]) {
        sources.push({
            url: `https://www.ncc.re.kr/pr_list1.ncc?pageNum=${page}&searchKey=total&searchValue=`,
            parse: (body) => parseNccBoard(body, '국립암센터', true),
        });
    }
    if (keyword !== '암환자') {
        sources.push({
            url: `https://www.ncc.re.kr/pr_list1.ncc?pageNum=1&searchKey=total&searchValue=${encodeURIComponent(keyword)}`,
            parse: (body) => parseNccBoard(body, '국립암센터', true),
        });
    }
    sources.push({
        url: `https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do?mode=list&srSearchKey=article_title_text&srSearchVal=${encodeURIComponent(keyword)}&article.offset=0&articleLimit=20`,
        parse: (body) => parseNhisBoardSearch(body, '국민건강보험', 'https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do'),
    });
    for (const query of buildGoogleNewsQueries(keyword)) {
        sources.push({
            url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`,
            parse: (body) => parseRssItems(body, '구글 뉴스', 'https://news.google.com'),
        });
    }
    const results = await Promise.allSettled(sources.map(async (source) => {
        const body = await fetchText(source.url);
        const items = source.parse(body);
        // HTML error pages and changed board layouts should not masquerade as a successful empty feed.
        if (!items.length && !/<(?:rss|feed)\b/i.test(body)) throw new Error('Source layout unavailable');
        return items;
    }));
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    if (!fulfilled.length) throw new Error('All alert sources unavailable');
    return {
        items: filterAlertArticles(fulfilled.flatMap((result) => result.value)),
        partial: fulfilled.length < results.length,
    };
}

export async function GET(request: NextRequest) {
    const cancerType = (request.nextUrl.searchParams.get('cancerType') || '').trim().slice(0, 80);
    const isGeneralMode = request.nextUrl.searchParams.get('mode') === 'general' || !cancerType;
    const keyword = isGeneralMode ? '암환자' : cancerType;
    const cancerKeywords = isGeneralMode ? GENERAL_ALERT_KEYWORDS : buildCancerKeywords(keyword);
    const summary = isGeneralMode ? '최근 2개월의 암 건강 소식' : `${keyword} 관련 소식과 공통 건강 정보 · 최근 2개월`;

    try {
        const collected = await collectArticles(keyword);
        const matched = collected.items.filter((item) => {
            if (/채용|입찰|구매공고|업무협약|개인정보|이노베이션|직원 모집/.test(item.title)) return false;
            const title = item.title.replace(/국립암센터|국가암정보센터/g, '');
            const personalized = matchAnyKeyword(title, cancerKeywords);
            const common = matchAnyKeyword(title, GENERAL_ALERT_KEYWORDS);
            const commonCare = matchAnyKeyword(title, ['암환자', '암 생존자', '영양', '식단', '식사', '돌봄']);
            const otherCancer = /유방암|갑상선암|신장암|자궁경부암|폐암|간암|담도(?:계)?암|대장암|위암|췌장암|혈액암|전립선암|소아청소년암/.test(title);
            return isGeneralMode ? common || /암|종양/.test(title) : personalized || (item.kind === 'official' && commonCare && !otherCancer);
        });
        const bySourceCount = new Map<string, number>();
        const items = filterAlertArticles(matched).filter((item) => {
            const count = bySourceCount.get(item.source) ?? 0;
            if (count >= SOURCE_LIMIT) return false;
            bySourceCount.set(item.source, count + 1);
            return true;
        }).slice(0, TOTAL_LIMIT);
        return NextResponse.json({ summary, keyword, items, partial: collected.partial, updatedAt: new Date().toISOString() });
    } catch {
        return NextResponse.json(
            { summary, keyword, items: [], error: '소식을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' },
            { status: 503 }
        );
    }
}
