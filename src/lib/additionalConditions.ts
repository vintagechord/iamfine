export type ConditionCatalogItem = {
    name: string;
    code: string;
    category: string;
    aliases: string[];
};

export type AdditionalCondition = {
    id: string;
    name: string;
    code: string;
    category: string;
    addedAt: string;
};

const CONDITION_CATALOG: ConditionCatalogItem[] = [
    {
        name: '감기',
        code: 'J00',
        category: '호흡기',
        aliases: ['급성 비인두염', 'common cold', 'cold'],
    },
    {
        name: '독감',
        code: 'J10',
        category: '호흡기',
        aliases: ['인플루엔자', 'flu'],
    },
    {
        name: '간 질환',
        code: 'K76.9',
        category: '간/담도',
        aliases: ['간질환', '간질환증', '간 관련 질환', 'liver disease'],
    },
    {
        name: '지방간',
        code: 'K76.0',
        category: '간/담도',
        aliases: ['비알코올성 지방간', 'fatty liver'],
    },
    {
        name: '간염',
        code: 'K75.9',
        category: '간/담도',
        aliases: ['hepatitis'],
    },
    {
        name: '고혈압',
        code: 'I10',
        category: '심혈관',
        aliases: ['혈압 높음', 'hypertension'],
    },
    {
        name: '고콜레스테롤혈증',
        code: 'E78.0',
        category: '대사',
        aliases: ['콜레스테롤', '고콜레스테롤', 'high cholesterol'],
    },
    {
        name: '고지혈증',
        code: 'E78.5',
        category: '대사',
        aliases: ['지질이상증', '고지질혈증', 'hyperlipidemia'],
    },
    {
        name: '당뇨병',
        code: 'E14.9',
        category: '대사',
        aliases: ['당뇨', 'diabetes'],
    },
    {
        name: '만성 신장질환',
        code: 'N18.9',
        category: '신장',
        aliases: ['신장질환', '신부전', 'ckd', 'chronic kidney disease'],
    },
];

function normalizeConditionText(value: string) {
    return value
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[()\-_/.,]/g, '')
        .trim();
}

function buildSearchIndex(item: ConditionCatalogItem) {
    return [item.name, item.code, ...item.aliases]
        .map((value) => normalizeConditionText(value))
        .filter(Boolean);
}

const CONDITION_INDEX = CONDITION_CATALOG.map((item) => ({
    item,
    normalizedName: normalizeConditionText(item.name),
    tokens: buildSearchIndex(item),
}));

export function conditionCatalog() {
    return CONDITION_CATALOG;
}

export function matchConditionByName(input: string) {
    const normalizedInput = normalizeConditionText(input);
    if (!normalizedInput) {
        return null;
    }

    const exact = CONDITION_INDEX.find(
        ({ normalizedName, tokens }) => normalizedName === normalizedInput || tokens.includes(normalizedInput)
    );
    return exact?.item ?? null;
}

export function searchConditionCatalog(input: string, limit = 8) {
    const normalizedInput = normalizeConditionText(input);
    if (!normalizedInput) {
        return CONDITION_CATALOG.slice(0, limit);
    }

    const ranked = CONDITION_INDEX.map(({ item, normalizedName, tokens }) => {
        let score = 0;
        if (normalizedName === normalizedInput) {
            score += 100;
        }
        if (tokens.includes(normalizedInput)) {
            score += 80;
        }
        if (normalizedName.startsWith(normalizedInput)) {
            score += 30;
        }
        if (tokens.some((token) => token.startsWith(normalizedInput))) {
            score += 20;
        }
        if (tokens.some((token) => token.includes(normalizedInput))) {
            score += 10;
        }
        return { item, score };
    })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko'))
        .slice(0, limit)
        .map((entry) => entry.item);

    return ranked;
}

export function parseAdditionalConditionsFromUnknown(raw: unknown): AdditionalCondition[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter((item): item is AdditionalCondition => {
            if (!item || typeof item !== 'object') {
                return false;
            }

            const candidate = item as Partial<AdditionalCondition>;
            return (
                typeof candidate.id === 'string' &&
                typeof candidate.name === 'string' &&
                typeof candidate.code === 'string' &&
                typeof candidate.category === 'string' &&
                typeof candidate.addedAt === 'string'
            );
        })
        .map((item) => ({
            id: item.id,
            name: item.name.trim(),
            code: item.code.trim(),
            category: item.category.trim(),
            addedAt: item.addedAt,
        }))
        .filter((item) => item.name.length > 0 && item.code.length > 0 && item.category.length > 0);
}
