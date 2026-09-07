import { FOOD_FAMILIES, type FoodFamily } from './foodCatalog.ts';

/** Names support finding and recording food; they are not a nutrient database. */
export type FoodMatchType = 'exact' | 'alias' | 'partial' | 'typo' | 'related';

export type FoodSearchResult = {
    name: string;
    matchType: FoodMatchType;
    reason: string;
};

const ALIASES: Array<[RegExp, string]> = [
    [/계란/g, '달걀'], [/야채/g, '채소'], [/쇠고기/g, '소고기'],
    [/돈까스|돈까츠|돈카츠/g, '돈가스'], [/자장/g, '짜장'],
    [/짜장(?!면|떡|소스)/g, '짜장면'], [/스프/g, '수프'],
    [/요구르트|요구트|요거르트/g, '요거트'], [/오믈레트/g, '오믈렛'],
    [/오무라이스/g, '오므라이스'], [/크로와상|크로아상/g, '크루아상'],
    [/카모마일/g, '캐모마일'], [/브리또|부리또/g, '부리토'],
    [/리소토/g, '리조또'], [/후라이/g, '프라이'], [/에그/g, '달걀'],
    [/포리지/g, '오트밀'], [/쭈꾸미/g, '주꾸미'], [/떡볶기/g, '떡볶이'],
    [/반세오/g, '반쎄오'], [/카라멜|카러멜/g, '캐러멜'], [/피낭시에/g, '휘낭시에'],
    [/카르보나라|카보나라/g, '까르보나라'], [/쉐이크/g, '셰이크'], [/뇨키/g, '뇨끼'],
    [/뱡뱡면/g, '비앙비앙면'], [/마라롱샤/g, '마라룽샤'], [/챵코/g, '찬코'],
];

function compact(input: string) {
    return input.normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

const WHOLE_NAME_ALIASES: Record<string, string> = {
    bibimbap: '비빔밥', kimchi: '김치', gimbap: '김밥', kimbap: '김밥', tteokbokki: '떡볶이',
    bulgogi: '불고기', japchae: '잡채', samgyetang: '삼계탕', ramen: '라멘',
    sushi: '초밥', udon: '우동', soba: '메밀소바', pho: '베트남쌀국수',
    padthai: '팟타이', tomyum: '똠얌꿍', tomyumgoong: '똠얌꿍', banhmi: '반미',
    butterchicken: '버터치킨', biryani: '비리야니', tikkamasala: '치킨티카마살라',
    hummus: '후무스', falafel: '팔라펠', shawarma: '샤와르마', kebab: '케밥',
    burrito: '부리토', taco: '타코', quesadilla: '퀘사디아',
    pizza: '피자', pasta: '파스타', hamburger: '햄버거', burger: '햄버거',
    sandwich: '샌드위치', yogurt: '요거트', yoghurt: '요거트',
    avocado: '아보카도', oatmeal: '오트밀', americano: '아메리카노', latte: '카페라떼',
    croissant: '크루아상', bagel: '베이글', tiramisu: '티라미수', boba: '버블티',
    '스크램블에그': '달걀스크램블', '똠양꿍': '똠얌꿍',
    '나시고랭': '나시고렝', '미고랭': '미고렝', '샤오롱바오': '샤오룽바오',
    '베트남샌드위치': '반미', '나가사키짬봉': '나가사키짬뽕',
};

function comparable(input: string) {
    const key = compact(input);
    const alias = Object.prototype.hasOwnProperty.call(WHOLE_NAME_ALIASES, key) ? WHOLE_NAME_ALIASES[key] : key;
    return ALIASES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), alias);
}

export function normalizeFoodQuery(input: string) {
    return input.trim().replace(/\s*·.*$/, '').replace(/\s*\(?\d+(?:\.\d+)?\s*(?:인분|그릇|공기|개|컵|조각|잔|g|ml)\)?\s*$/i, '').trim();
}

function distance(a: string, b: string) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const saved = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
            previous = saved;
        }
    }
    return row[b.length];
}

const DISH_TYPE_FAMILIES = new Set([
    '밥', '볶음밥·덮밥', '죽', '김밥·주먹밥', '비빔밥', '국·탕', '찌개·전골',
    '국수·면', '파스타·리조또', '샐러드', '수프', '분식·전', '빵·샌드위치', '피자·멕시코 요리', '김치',
]);

function familyStrength(query: string, family: Pick<FoodFamily, 'label' | 'keywords'>) {
    return Math.max(0, ...family.keywords.map((keyword) => {
        const key = keyword;
        // A single syllable only identifies a dish when it is its suffix, not e.g. 전 in 전복.
        const matches = key.length === 1 ? query.endsWith(key) : query.includes(key);
        if (!matches) return 0;
        // In 버섯죽, the dish (죽) matters more than the longer ingredient (버섯).
        // Longer dish endings still win: 덮밥 / 국밥 / 비빔밥 before the generic 밥.
        const dishPriority = DISH_TYPE_FAMILIES.has(family.label) && query.endsWith(key) ? 100 : 0;
        return dishPriority + key.length;
    }));
}

const CATALOG_NAMES = Array.from(new Set(FOOD_FAMILIES.flatMap((family) => family.names)));

type IndexedFood = { name: string; key: string; compactName: string };
const indexFood = (name: string): IndexedFood => ({ name, key: comparable(name), compactName: compact(name) });
// This normalized index is built once per module, not for every typed character.
const STATIC_INDEX = new Map<string, IndexedFood>();
for (const name of CATALOG_NAMES) {
    const entry = indexFood(name);
    if (!STATIC_INDEX.has(entry.key)) STATIC_INDEX.set(entry.key, entry);
}
export const FOOD_SEARCH_CATALOG = Array.from(STATIC_INDEX.values(), (entry) => entry.name);

const NORMALIZED_FAMILIES = FOOD_FAMILIES.map((family) => ({
    label: family.label,
    keywords: family.keywords.map(comparable),
    keys: new Set(family.names.map(comparable)),
}));
const INGREDIENT_FAMILIES = new Set(['과일', '채소·곡물', '우유·요거트·콩', '일상 가공식품']);
const INGREDIENT_FOOD_KEYS = new Set(NORMALIZED_FAMILIES
    .filter((family) => INGREDIENT_FAMILIES.has(family.label))
    .flatMap((family) => Array.from(family.keys)));
const INGREDIENT_KEYWORDS = Array.from(new Set(NORMALIZED_FAMILIES
    .filter((family) => !DISH_TYPE_FAMILIES.has(family.label))
    .flatMap((family) => family.keywords)));
const EMPTY_HISTORY: readonly string[] = [];
const HISTORY_INDEXES = new WeakMap<readonly string[], IndexedFood[]>();

function historyIndex(names: readonly string[]) {
    const cached = HISTORY_INDEXES.get(names);
    if (cached) return cached;
    const entries = new Map<string, IndexedFood>();
    for (const rawName of names) {
        const name = normalizeFoodQuery(rawName);
        if (!name) continue;
        const entry = indexFood(name);
        if (entry.key && !STATIC_INDEX.has(entry.key) && !entries.has(entry.key)) entries.set(entry.key, entry);
    }
    const result = Array.from(entries.values());
    HISTORY_INDEXES.set(names, result);
    return result;
}

const MATCH_REASONS: Record<Exclude<FoodMatchType, 'related'>, string> = {
    exact: '이름 일치', alias: '다른 표기의 음식', partial: '검색어 포함', typo: '비슷한 이름',
};

export function searchFoods(query: string, additionalNames: readonly string[] = EMPTY_HISTORY, maxResults = 12): FoodSearchResult[] {
    const cleaned = normalizeFoodQuery(query).slice(0, 80);
    const normalizedQuery = comparable(cleaned);
    if (!normalizedQuery || maxResults <= 0) return [];

    const compactQuery = compact(cleaned);
    const families = NORMALIZED_FAMILIES.map((family) => ({ family, strength: familyStrength(normalizedQuery, family) }));
    const strongestFamily = Math.max(0, ...families.map(({ strength }) => strength));
    const relatedFamilies = families.filter(({ strength }) => strength > 0 && strength >= strongestFamily);
    const hasSpecificDish = relatedFamilies.some(({ family, strength }) => strength >= 100 && DISH_TYPE_FAMILIES.has(family.label));
    const relatedKeys = new Map<string, { label: string; strength: number }>();
    for (const { family, strength } of relatedFamilies) {
        for (const key of family.keys) relatedKeys.set(key, { label: family.label, strength });
    }
    const ingredientKeywords = INGREDIENT_KEYWORDS.filter((keyword) => normalizedQuery.includes(keyword));
    const candidates = [...STATIC_INDEX.values(), ...historyIndex(additionalNames)];

    const ranked = candidates.map(({ key, name, compactName }) => {
        const related = relatedKeys.get(key);
        // Once a dish type is recognizable, an unrelated ingredient or a different
        // dish is not an appropriate typo/substitution (e.g. 굴국 for 매생이굴죽).
        const compatibleDish = Boolean(related) || (!hasSpecificDish && !INGREDIENT_FOOD_KEYS.has(key));
        let matchType: FoodMatchType | null = null;
        let score = 0;
        let familyLabel = '';
        if (compactName === compactQuery) {
            matchType = 'exact'; score = 1000;
        } else if (key === normalizedQuery) {
            matchType = 'alias'; score = 950;
        } else if (key.includes(normalizedQuery)) {
            matchType = 'partial'; score = 800 + normalizedQuery.length / key.length;
        } else if (compatibleDish && key.length >= 2 && normalizedQuery.includes(key)) {
            matchType = 'related'; score = 650 + key.length / normalizedQuery.length;
            familyLabel = related?.label ?? '';
        } else if (compatibleDish && normalizedQuery.length >= 3 && key.length >= 3 && Math.abs(key.length - normalizedQuery.length) <= 2) {
            const edits = distance(key, normalizedQuery);
            if (edits <= (normalizedQuery.length >= 6 ? 2 : 1) && edits / Math.max(key.length, normalizedQuery.length) <= 0.34) {
                // A longer named variation in the same recognized dish family is
                // a related recipe, not necessarily a misspelling (매생이굴죽 / 매생이죽).
                matchType = hasSpecificDish && key.length !== normalizedQuery.length ? 'related' : 'typo';
                familyLabel = related?.label ?? '';
                score = matchType === 'typo' ? 700 - edits : 600 - edits;
            }
        }
        if (!matchType) {
            if (related) {
                matchType = 'related';
                familyLabel = related.label;
                // Within the chosen dish family, keep the user's ingredient first.
                const sharedIngredient = Math.max(0, ...ingredientKeywords.filter((keyword) => key.includes(keyword)).map((keyword) => keyword.length));
                score = 300 + related.strength + sharedIngredient * 10;
            }
        }
        if (!matchType) return null;
        return {
            name, matchType, score,
            reason: matchType === 'related' ? (familyLabel ? `${familyLabel} 종류` : '비슷한 종류') : MATCH_REASONS[matchType],
        };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    return ranked.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko'))
        .slice(0, Math.min(maxResults, 30))
        .map(({ name, matchType, reason }) => ({ name, matchType, reason }));
}
