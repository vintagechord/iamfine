import { NextRequest, NextResponse } from 'next/server';

type KcdSearchRow = {
    strCategoryCode?: string | null;
    strCategoryCodeName?: string | null;
    strCategoryCodeEnglishName?: string | null;
};

type DiseaseSearchItem = {
    name: string;
    code: string;
    category: string;
    aliases: string[];
};

type SearchVariant = {
    query: string;
    source: 'input' | 'alias' | 'expanded';
};

type CandidateRow = {
    row: KcdSearchRow;
    variant: SearchVariant;
};

const KCD_PROXY_URL = 'https://kssc.mods.go.kr:8443/ksscNew_web/mobileProxy.do';
const MAX_QUERY_LENGTH = 80;
const MAX_RESULT_COUNT = 24;
const MAX_SEARCH_VARIANT_COUNT = 8;
const MAX_KCD_FETCH_COUNT = 150;
const REQUEST_TIMEOUT_MS = 12000;
const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const QUERY_EXPANSION_RULES: Array<{ pattern: RegExp; replacements: string[] }> = [
    {
        pattern: /뇌출혈/,
        replacements: ['뇌내출혈', '지주막하출혈', '두개내출혈', '뇌실내출혈', '출혈성뇌졸중'],
    },
    {
        pattern: /뇌졸중|중풍/,
        replacements: ['뇌졸중', '뇌경색', '뇌내출혈', '지주막하출혈'],
    },
    {
        pattern: /디스크/,
        replacements: ['추간판장애', '추간판전위', '경추간판장애', '요추및기타추간판장애'],
    },
    {
        pattern: /허리디스크|요추디스크/,
        replacements: ['요추및기타추간판장애', '요추간판장애', '요추추간판전위'],
    },
    {
        pattern: /목디스크|경추디스크/,
        replacements: ['경추간판장애', '경추간판전위'],
    },
];
const PERINATAL_PATTERN = /(출산손상|신생아|주산기|태아)/;
const CEREBRAL_HEMORRHAGE_PATTERN = /(뇌내출혈|지주막하출혈|두개내출혈|뇌실내출혈|출혈성뇌졸중)/;
const DISK_PATTERN = /(추간판|경추간판|요추간판|간판전위)/;

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()\-_/.,]/g, '')
        .trim();
}

function uniqueAliases(values: Array<string | null | undefined>) {
    return Array.from(
        new Set(
            values
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter(Boolean)
        )
    );
}

async function fetchKcdRows(query: string) {
    const form = new URLSearchParams({
        CALL_ID: '9',
        CATEGORY_NAME_CODE: '004',
        CATEGORY_DEGREE: '09',
        SEARCH_KEY: query,
        SEARCH_COND: 'KCD',
        SEARCH_COND2: '0',
        firstIndex: '1',
        lastIndex: String(MAX_KCD_FETCH_COUNT),
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(KCD_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Accept: 'application/json, text/plain, */*',
                'User-Agent': USER_AGENT,
            },
            body: form.toString(),
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) {
            return [] as KcdSearchRow[];
        }

        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) {
            return [] as KcdSearchRow[];
        }

        return payload as KcdSearchRow[];
    } catch {
        return [] as KcdSearchRow[];
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildSearchVariants(query: string) {
    const trimmed = query.trim();
    const normalized = normalizeText(trimmed);
    const variants: SearchVariant[] = [];
    const seen = new Set<string>();

    const pushVariant = (value: string, source: SearchVariant['source']) => {
        const next = value.trim();
        if (!next) {
            return;
        }
        const key = normalizeText(next);
        if (!key || seen.has(key)) {
            return;
        }
        seen.add(key);
        variants.push({
            query: next,
            source,
        });
    };

    pushVariant(trimmed, 'input');
    if (/\s/.test(trimmed)) {
        pushVariant(trimmed.replace(/\s+/g, ''), 'expanded');
    }
    if (trimmed.includes('/')) {
        pushVariant(trimmed.replace(/\//g, ' '), 'expanded');
    }

    QUERY_EXPANSION_RULES.forEach((rule) => {
        if (!rule.pattern.test(normalized)) {
            return;
        }
        rule.replacements.forEach((replacement) => {
            pushVariant(replacement, 'alias');
        });
    });

    if (normalized.endsWith('질환') && normalized.length > 2) {
        pushVariant(trimmed.replace(/질환$/u, ''), 'expanded');
    }

    return variants.slice(0, MAX_SEARCH_VARIANT_COUNT);
}

async function fetchRowsByVariants(variants: SearchVariant[]) {
    const settled = await Promise.allSettled(
        variants.map(async (variant) => ({
            variant,
            rows: await fetchKcdRows(variant.query),
        }))
    );

    const candidates: CandidateRow[] = [];
    settled.forEach((result) => {
        if (result.status !== 'fulfilled') {
            return;
        }
        result.value.rows.forEach((row) => {
            candidates.push({
                row,
                variant: result.value.variant,
            });
        });
    });

    return candidates;
}

function scoreCandidate(query: string, candidate: CandidateRow) {
    const code = (candidate.row.strCategoryCode ?? '').trim();
    const name = (candidate.row.strCategoryCodeName ?? '').trim();
    const englishName = (candidate.row.strCategoryCodeEnglishName ?? '').trim();
    const normalizedQuery = normalizeText(query);
    const normalizedVariant = normalizeText(candidate.variant.query);
    const normalizedName = normalizeText(name);
    const normalizedCode = normalizeText(code);
    const normalizedEnglish = normalizeText(englishName);

    let score = 0;
    if (normalizedName === normalizedQuery || normalizedCode === normalizedQuery) {
        score += 260;
    }
    if (normalizedName.startsWith(normalizedQuery) || normalizedCode.startsWith(normalizedQuery)) {
        score += 120;
    }
    if (normalizedName.includes(normalizedQuery) || normalizedCode.includes(normalizedQuery)) {
        score += 90;
    }
    if (normalizedQuery.length >= 2 && normalizedEnglish.includes(normalizedQuery)) {
        score += 30;
    }

    if (normalizedVariant === normalizedQuery) {
        score += 70;
    }
    if (normalizedName === normalizedVariant || normalizedCode === normalizedVariant) {
        score += 90;
    }
    if (normalizedName.includes(normalizedVariant) || normalizedCode.includes(normalizedVariant)) {
        score += 60;
    }
    if (normalizedVariant.length >= 2 && normalizedEnglish.includes(normalizedVariant)) {
        score += 20;
    }

    if (candidate.variant.source === 'input') {
        score += 20;
    } else if (candidate.variant.source === 'alias') {
        score += 12;
    } else {
        score += 7;
    }

    if (normalizedQuery.includes('뇌출혈')) {
        if (PERINATAL_PATTERN.test(normalizedName)) {
            score -= 360;
        } else if (CEREBRAL_HEMORRHAGE_PATTERN.test(normalizedName)) {
            score += 180;
        }
        if (/출산손상/u.test(normalizedName)) {
            score -= 220;
        }
    }
    if (normalizedQuery.includes('디스크')) {
        if (DISK_PATTERN.test(normalizedName)) {
            score += 140;
        }
        if (/감염|염증/u.test(normalizedName)) {
            score -= 35;
        }
    }

    return score;
}

function mapKcdRowsToItems(query: string, candidates: CandidateRow[]) {
    const normalizedQuery = normalizeText(query);
    const merged = new Map<
        string,
        {
            name: string;
            code: string;
            category: string;
            aliases: Set<string>;
            baseScore: number;
            hitCount: number;
            variantKeys: Set<string>;
        }
    >();

    candidates.forEach((candidate) => {
        const code = (candidate.row.strCategoryCode ?? '').trim();
        const name = (candidate.row.strCategoryCodeName ?? '').trim();
        const englishName = (candidate.row.strCategoryCodeEnglishName ?? '').trim();
        if (!code || !name) {
            return;
        }
        if (!/[A-Z][0-9]/i.test(code)) {
            return;
        }

        const key = `${code}::${name}`;
        const nextScore = scoreCandidate(query, candidate);
        if (nextScore <= 0) {
            return;
        }
        const variantKey = normalizeText(candidate.variant.query);
        const candidateAliases = uniqueAliases([englishName, candidate.variant.query]);
        if (nextScore >= 220 && normalizeText(candidate.variant.query) !== normalizedQuery) {
            candidateAliases.push(query.trim());
        }

        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, {
                name,
                code,
                category: 'KCD',
                aliases: new Set(candidateAliases),
                baseScore: nextScore,
                hitCount: 1,
                variantKeys: new Set([variantKey]),
            });
            return;
        }

        candidateAliases.forEach((alias) => existing.aliases.add(alias));
        existing.baseScore = Math.max(existing.baseScore, nextScore);
        existing.hitCount += 1;
        existing.variantKeys.add(variantKey);
    });

    return Array.from(merged.values())
        .map((entry) => {
            const hitBonus = Math.min(40, (entry.hitCount - 1) * 8);
            const variantBonus = Math.min(24, (entry.variantKeys.size - 1) * 6);
            return {
                name: entry.name,
                code: entry.code,
                category: entry.category,
                aliases: Array.from(entry.aliases),
                score: entry.baseScore + hitBonus + variantBonus,
            };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'))
        .slice(0, MAX_RESULT_COUNT)
        .map((item) => ({
            name: item.name,
            code: item.code,
            category: item.category,
            aliases: item.aliases,
        }));
}

export async function GET(request: NextRequest) {
    const queryRaw = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (!queryRaw) {
        return NextResponse.json({
            items: [] as DiseaseSearchItem[],
        });
    }

    const query = queryRaw.slice(0, MAX_QUERY_LENGTH);
    const variants = buildSearchVariants(query);
    const candidates = await fetchRowsByVariants(variants);
    const items = mapKcdRowsToItems(query, candidates);

    return NextResponse.json({
        items,
    });
}
