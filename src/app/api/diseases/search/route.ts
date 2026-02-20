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

const KCD_PROXY_URL = 'https://kssc.mods.go.kr:8443/ksscNew_web/mobileProxy.do';
const MAX_QUERY_LENGTH = 80;
const MAX_RESULT_COUNT = 24;
const REQUEST_TIMEOUT_MS = 8000;

function normalizeText(value: string) {
    return value.toLowerCase().replace(/\s+/g, '').trim();
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
        lastIndex: '150',
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(KCD_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
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

function mapKcdRowsToItems(query: string, rows: KcdSearchRow[]) {
    const normalizedQuery = normalizeText(query);
    const seen = new Set<string>();
    const ranked: Array<DiseaseSearchItem & { score: number }> = [];

    rows.forEach((row) => {
        const code = (row.strCategoryCode ?? '').trim();
        const name = (row.strCategoryCodeName ?? '').trim();
        const englishName = (row.strCategoryCodeEnglishName ?? '').trim();

        if (!code || !name) {
            return;
        }
        if (!/[A-Z][0-9]/i.test(code)) {
            return;
        }

        const dedupeKey = `${code}::${name}`;
        if (seen.has(dedupeKey)) {
            return;
        }
        seen.add(dedupeKey);

        const normalizedName = normalizeText(name);
        const normalizedCode = normalizeText(code);
        const normalizedEnglish = normalizeText(englishName);

        let score = 0;
        if (normalizedName === normalizedQuery || normalizedCode === normalizedQuery) {
            score += 120;
        }
        if (normalizedName.startsWith(normalizedQuery) || normalizedCode.startsWith(normalizedQuery)) {
            score += 60;
        }
        if (normalizedName.includes(normalizedQuery) || normalizedCode.includes(normalizedQuery)) {
            score += 35;
        }
        if (normalizedEnglish.includes(normalizedQuery) && normalizedQuery.length >= 2) {
            score += 20;
        }

        ranked.push({
            name,
            code,
            category: 'KCD',
            aliases: uniqueAliases([englishName]),
            score,
        });
    });

    return ranked
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
    const rows = await fetchKcdRows(query);
    const items = mapKcdRowsToItems(query, rows);

    return NextResponse.json({
        items,
    });
}
