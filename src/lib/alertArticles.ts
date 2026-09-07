export type AlertArticle = {
    source: string;
    title: string;
    url: string;
    publishedAt: string;
    kind?: 'official' | 'news';
};

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export function parseArticleDate(raw: string): number | null {
    const dateOnly = raw.trim().match(/^(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})\.?$/);
    if (dateOnly) {
        const [, year, month, day] = dateOnly.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            return null;
        }
        return date.getTime() - SEOUL_OFFSET_MS;
    }
    // Date.parse accepts incomplete dates; require a year and a complete timestamp.
    if (!/\d{4}/.test(raw) || !/\d{1,2}:\d{2}/.test(raw)) return null;
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function articleCutoff(now = new Date()): number {
    // Include the whole Korean publication day, two calendar months ago.
    const seoul = new Date(now.getTime() + SEOUL_OFFSET_MS);
    const monthStart = new Date(Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth() - 2, 1));
    const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
    monthStart.setUTCDate(Math.min(seoul.getUTCDate(), lastDay));
    return monthStart.getTime() - SEOUL_OFFSET_MS;
}

export function normalizeArticleUrl(raw: string): string {
    try {
        const url = new URL(raw.trim().replace(/&amp;/g, '&'));
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
        url.hash = '';
        url.hostname = url.hostname.replace(/^www\./, '');
        for (const key of Array.from(url.searchParams.keys())) {
            if (/^(utm_.+|fbclid|gclid|oc|ref|referrer)$/i.test(key)) url.searchParams.delete(key);
        }
        if (/\.(?:ncc|do)$/.test(url.pathname) && ['nwsId', 'ntcId', 'articleNo'].some((key) => url.searchParams.has(key))) {
            for (const key of ['pageNum', 'pageIndex', 'searchKey', 'searchValue', 'srSearchKey', 'srSearchVal', 'article.offset', 'articleLimit']) {
                url.searchParams.delete(key);
            }
        }
        url.searchParams.sort();
        return url.toString();
    } catch {
        return '';
    }
}

function titleKey(title: string, source: string): string {
    let text = title.normalize('NFKC').toLowerCase().replace(/<[^>]*>/g, ' ');
    const separator = text.lastIndexOf(' - ');
    if (separator > 0 && (text.slice(separator + 3).trim() === source.toLowerCase().trim() || /구글 뉴스/.test(source))) {
        text = text.slice(0, separator);
    }
    return text
        .replace(/\[(?:속보|단독|종합\d*|보도자료|건강정보|건강칼럼)\]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');
}

function similarTitles(left: string, right: string, leftItem: AlertArticle, rightItem: AlertArticle): boolean {
    if (left === right) return true;
    if (Math.min(left.length, right.length) < 18) return false;
    const daysApart = Math.abs((parseArticleDate(leftItem.publishedAt) ?? 0) - (parseArticleDate(rightItem.publishedAt) ?? 0)) / 86_400_000;
    if (daysApart > 7) return false;
    const grams = (text: string) => new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
    const a = grams(left);
    const b = grams(right);
    const intersection = [...a].filter((gram) => b.has(gram)).length;
    const similarity = (2 * intersection) / (a.size + b.size);
    // A named event in quotes, or the same study marker plus overlapping content,
    // catches rewritten syndication without treating a cancer type as an event.
    const quotedNames = (title: string) => Array.from(title.matchAll(/['"‘“]([^'"’”]{6,60})['"’”]/g), (match) => titleKey(match[1], ''))
        .filter((name) => name.length >= 6 && !/^[a-z\d]+$/.test(name));
    const sameNamedEvent = [...quotedNames(leftItem.title), ...quotedNames(rightItem.title)]
        .some((name) => left.includes(name) && right.includes(name));
    const studyMarkers = left.match(/[a-z]{2,}\d+[a-z\d]*/g) ?? [];
    const sameStudyTopic = ['항암', '반응', '내성', '생존', '기전', '예측', '진단', '검사'].some((topic) => left.includes(topic) && right.includes(topic));
    const rightStudyMarkers = new Set(right.match(/[a-z]{2,}\d+[a-z\d]*/g) ?? []);
    const sameStudyMarker = sameStudyTopic && studyMarkers.some((marker) => marker.length >= 5 && rightStudyMarkers.has(marker));
    // A shared marker must not hide a different cohort size or treatment result.
    // Ignore digits inside marker names, and allow one headline to omit a figure.
    const numericClaims = (title: string) => title.replace(/[a-z]{2,}\d+[a-z\d]*/g, '').match(/\d+/g) ?? [];
    const leftClaims = numericClaims(left);
    const rightClaims = numericClaims(right);
    if (leftClaims.length && rightClaims.length && leftClaims.join(',') !== rightClaims.join(',')) return false;
    if (similarity >= 0.38 && (sameNamedEvent || sameStudyMarker)) return true;
    // Different study sizes, dates, or percentages may describe different news.
    if ((left.match(/\d+/g) ?? []).join(',') !== (right.match(/\d+/g) ?? []).join(',')) return false;
    if (Math.min(left.length, right.length) / Math.max(left.length, right.length) < 0.65) return false;
    return similarity >= 0.8;
}

/** Use this for both network responses and browser caches. Never backfill older items. */
export function filterAlertArticles(items: readonly AlertArticle[], now = new Date()): AlertArticle[] {
    const cutoff = articleCutoff(now);
    const valid = items.filter((item) => {
        if (!item || typeof item.title !== 'string' || typeof item.source !== 'string' || typeof item.url !== 'string' || typeof item.publishedAt !== 'string') return false;
        const timestamp = parseArticleDate(item.publishedAt);
        return item.title.trim().length > 0 && timestamp !== null && timestamp >= cutoff && timestamp <= now.getTime();
    }).sort((a, b) => {
        const official = Number(b.kind === 'official') - Number(a.kind === 'official');
        return official || (parseArticleDate(b.publishedAt) ?? 0) - (parseArticleDate(a.publishedAt) ?? 0);
    });
    const seenUrls = new Set<string>();
    const titles: Array<{ key: string; item: AlertArticle }> = [];
    const result: AlertArticle[] = [];
    for (const item of valid) {
        const url = normalizeArticleUrl(item.url);
        const key = titleKey(item.title, item.source);
        if (!url || !key || seenUrls.has(url) || titles.some((title) => similarTitles(title.key, key, title.item, item))) continue;
        seenUrls.add(url);
        titles.push({ key, item });
        result.push({ ...item, url });
    }
    return result.sort((a, b) => (parseArticleDate(b.publishedAt) ?? 0) - (parseArticleDate(a.publishedAt) ?? 0));
}
