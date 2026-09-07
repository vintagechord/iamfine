/** Names support finding and recording food; they are not a nutrient database. */
export type FoodMatchType = 'exact' | 'alias' | 'partial' | 'typo' | 'related';

export type FoodSearchResult = {
    name: string;
    matchType: FoodMatchType;
    reason: string;
};

type FoodFamily = { label: string; keywords: string[]; names: string[] };

const FOOD_FAMILIES: FoodFamily[] = [
    { label: '밥', keywords: ['쌀밥', '잡곡', '밥'], names: ['쌀밥', '현미밥', '잡곡밥', '보리밥', '귀리밥', '흑미밥', '기장밥', '완두콩밥', '곤드레밥', '콩나물밥', '강낭콩밥', '밤밥', '누룽지', '솥밥'] },
    { label: '볶음밥·덮밥', keywords: ['볶음밥', '덮밥', '카레', '오므라이스'], names: ['달걀볶음밥', '새우볶음밥', '김치볶음밥', '소고기볶음밥', '닭가슴살볶음밥', '채소볶음밥', '파인애플볶음밥', '참치볶음밥', '불고기덮밥', '제육덮밥', '오징어덮밥', '버섯덮밥', '두부덮밥', '가지덮밥', '장어덮밥', '연어덮밥', '닭고기덮밥', '마파두부덮밥', '카레라이스', '닭고기카레', '채소카레', '오므라이스', '가츠동', '규동', '텐동'] },
    { label: '죽', keywords: ['죽', '미음', '오트밀'], names: ['흰죽', '쌀미음', '누룽지죽', '채소죽', '소고기채소죽', '소고기버섯죽', '참치채소죽', '닭죽', '닭안심채소죽', '전복죽', '전복내장죽', '새우죽', '게살죽', '흰살생선죽', '달걀죽', '두부채소죽', '버섯들깨죽', '잣죽', '흑임자죽', '단호박죽', '팥죽', '녹두죽', '고구마죽', '오트밀', '오트밀닭죽'] },
    { label: '김밥·주먹밥', keywords: ['김밥', '주먹밥', '초밥'], names: ['채소김밥', '참치김밥', '달걀김밥', '불고기김밥', '닭가슴살김밥', '멸치김밥', '치즈김밥', '우엉김밥', '돈가스김밥', '꼬마김밥', '키토김밥', '충무김밥', '참치주먹밥', '소고기주먹밥', '김가루주먹밥', '유부초밥', '달걀초밥', '새우초밥', '연어초밥', '삼각김밥'] },
    { label: '비빔밥', keywords: ['비빔밥', '비빔밥류'], names: ['비빔밥', '돌솥비빔밥', '산채비빔밥', '새싹비빔밥', '보리비빔밥', '육회비빔밥', '두부비빔밥', '곤드레비빔밥', '꼬막비빔밥', '낙지비빔밥'] },
    { label: '국·탕', keywords: ['국밥', '국', '탕', '곰탕', '설렁탕', '해장국'], names: ['소고기미역국', '조개미역국', '들깨미역국', '소고기무국', '콩나물국', '황태국', '북엇국', '달걀국', '배추된장국', '시금치된장국', '아욱국', '시래기국', '감자국', '오이냉국', '삼계탕', '닭곰탕', '곰탕', '설렁탕', '갈비탕', '도가니탕', '추어탕', '대구맑은탕', '동태탕', '알탕', '매운탕', '감자탕', '육개장', '순대국', '돼지국밥', '콩나물국밥', '소머리국밥', '황태해장국', '선지해장국', '마라탕', '떡국', '떡만둣국', '만둣국'] },
    { label: '찌개·전골', keywords: ['찌개', '전골', '짜글이', '샤브샤브'], names: ['돼지고기김치찌개', '참치김치찌개', '꽁치김치찌개', '두부김치찌개', '차돌된장찌개', '해물된장찌개', '된장찌개', '바지락순두부찌개', '해물순두부찌개', '달걀순두부찌개', '맑은순두부탕', '청국장찌개', '비지찌개', '부대찌개', '애호박찌개', '두부전골', '소고기버섯전골', '불고기전골', '만두전골', '곱창전골', '밀푀유나베', '샤브샤브'] },
    { label: '국수·면', keywords: ['국수', '칼국수', '수제비', '우동', '라면', '짜장', '짬뽕', '쌀국수', '메밀', '소바', '면'], names: ['잔치국수', '비빔국수', '멸치국수', '들깨칼국수', '바지락칼국수', '닭칼국수', '장칼국수', '팥칼국수', '감자수제비', '들깨수제비', '콩국수', '메밀국수', '온메밀국수', '냉모밀', '물냉면', '비빔냉면', '회냉면', '쫄면', '우동', '어묵우동', '카레우동', '볶음우동', '소고기쌀국수', '닭고기쌀국수', '분짜', '팟타이', '라면', '달걀라면', '떡라면', '비빔면', '짜장면', '간짜장', '삼선짜장', '짬뽕', '백짬뽕', '잡채', '메밀막국수'] },
    { label: '파스타·리조또', keywords: ['파스타', '스파게티', '리조또', '리소토', '뇨끼', '라자냐'], names: ['토마토파스타', '해산물토마토파스타', '로제파스타', '새우로제파스타', '크림파스타', '버섯크림파스타', '까르보나라', '알리오올리오', '봉골레파스타', '바질페스토파스타', '볼로네제파스타', '투움바파스타', '토마토리조또', '버섯크림리조또', '해산물리조또', '단호박리조또', '라자냐', '감자뇨끼'] },
    { label: '닭·오리 요리', keywords: ['닭', '치킨', '삼계', '오리'], names: ['닭가슴살구이', '닭안심찜', '닭다리구이', '닭봉구이', '닭갈비', '간장닭갈비', '치즈닭갈비', '찜닭', '간장찜닭', '닭볶음탕', '닭백숙', '닭한마리', '닭가슴살수육', '후라이드치킨', '양념치킨', '간장치킨', '오븐구이치킨', '닭강정', '치킨너겟', '훈제오리', '오리로스', '오리주물럭', '오리백숙'] },
    { label: '소·돼지고기 요리', keywords: ['소고기', '쇠고기', '돼지', '삼겹', '목살', '갈비', '불고기', '제육', '보쌈', '족발', '스테이크', '돈가스', '탕수육'], names: ['소불고기', '돼지불고기', '소고기채소찜', '소고기장조림', '소고기버섯볶음', '안심스테이크', '함박스테이크', '미트볼', '소갈비찜', '돼지갈비찜', '등갈비구이', '제육볶음', '고추장불고기', '돼지안심수육', '보쌈', '족발', '삼겹살구이', '목살구이', '대패삼겹살', '차돌박이구이', '돈가스', '안심돈가스', '등심돈가스', '치즈돈가스', '고구마돈가스', '탕수육', '꿔바로우'] },
    { label: '생선·해산물 요리', keywords: ['생선', '해물', '연어', '고등어', '대구', '갈치', '조기', '삼치', '가자미', '새우', '오징어', '낙지', '장어', '조개', '전복', '꼬막', '회'], names: ['연어구이', '연어찜', '고등어구이', '고등어무조림', '고등어찜', '삼치구이', '갈치구이', '갈치조림', '가자미구이', '가자미찜', '조기구이', '굴비구이', '대구살찜', '흰살생선찜', '장어구이', '임연수구이', '꽁치조림', '코다리조림', '아귀찜', '해물찜', '새우구이', '새우찜', '오징어숙회', '오징어볶음', '낙지볶음', '주꾸미볶음', '전복찜', '꼬막무침', '바지락찜', '광어회', '연어회'] },
    { label: '두부·달걀 요리', keywords: ['두부', '달걀', '계란', '오믈렛', '오믈레트'], names: ['두부조림', '두부부침', '두부구이', '두부스테이크', '두부버섯조림', '두부달걀찜', '연두부', '연두부찜', '순두부달걀찜', '두부김치', '마파두부', '달걀찜', '달걀말이', '채소달걀말이', '달걀프라이', '스크램블에그', '삶은달걀', '구운달걀', '수란', '달걀장조림', '오믈렛', '치즈오믈렛', '두부오믈렛'] },
    { label: '채소 반찬', keywords: ['나물', '채소', '버섯', '브로콜리', '시금치', '호박', '양배추', '오이', '가지', '당근', '무침', '조림'], names: ['시금치나물', '콩나물무침', '숙주나물', '고사리나물', '취나물', '고구마순나물', '미역줄기볶음', '애호박볶음', '가지나물', '가지구이', '가지볶음', '버섯볶음', '새송이버섯구이', '표고버섯볶음', '양배추찜', '배추찜', '브로콜리찜', '청경채볶음', '당근볶음', '무나물', '오이무침', '도라지무침', '연근조림', '우엉조림', '감자조림', '단호박찜', '깻잎찜', '콩자반', '멸치볶음', '진미채볶음', '어묵볶음', '배추김치', '백김치', '깍두기', '동치미'] },
    { label: '샐러드', keywords: ['샐러드', '포케', '월남쌈'], names: ['그린샐러드', '닭가슴살샐러드', '닭안심샐러드', '두부샐러드', '연어샐러드', '새우샐러드', '참치샐러드', '달걀샐러드', '리코타치즈샐러드', '단호박샐러드', '감자샐러드', '양배추샐러드', '토마토샐러드', '병아리콩샐러드', '콥샐러드', '시저샐러드', '닭고기포케', '연어포케', '두부포케', '월남쌈'] },
    { label: '수프', keywords: ['수프', '스프', '포타주'], names: ['채소수프', '단호박수프', '감자수프', '양송이수프', '브로콜리수프', '당근수프', '토마토수프', '양배추수프', '옥수수수프', '완두콩수프', '들깨버섯수프', '닭고기채소수프', '렌틸콩수프', '미네스트로네', '클램차우더'] },
    { label: '분식·전', keywords: ['떡볶이', '만두', '전', '튀김', '순대', '분식'], names: ['떡볶이', '로제떡볶이', '궁중떡볶이', '짜장떡볶이', '라볶이', '순대', '어묵탕', '고기만두', '김치만두', '새우만두', '찐만두', '군만두', '물만두', '김치전', '해물파전', '부추전', '감자전', '녹두전', '동그랑땡', '동태전', '호박전', '새우튀김', '고구마튀김', '오징어튀김', '김말이'] },
    { label: '빵·샌드위치', keywords: ['빵', '샌드위치', '토스트', '베이글', '바게트', '크루아상', '햄버거', '버거', '랩'], names: ['식빵', '통밀빵', '호밀빵', '쌀빵', '모닝빵', '소금빵', '단팥빵', '크림빵', '치아바타', '바게트', '크루아상', '베이글', '달걀샌드위치', '닭가슴살샌드위치', '참치샌드위치', '햄치즈샌드위치', '채소샌드위치', '클럽샌드위치', '리코타샌드위치', '달걀토스트', '프렌치토스트', '치킨랩', '불고기버거', '치즈버거', '치킨버거', '새우버거', '핫도그'] },
    { label: '피자·멕시코 요리', keywords: ['피자', '타코', '부리토', '브리또', '퀘사디아'], names: ['치즈피자', '고구마피자', '불고기피자', '콤비네이션피자', '페퍼로니피자', '마르게리타피자', '고르곤졸라피자', '채소피자', '닭고기타코', '소고기타코', '새우타코', '치킨부리토', '콩부리토', '치킨퀘사디아'] },
    { label: '과일', keywords: ['과일', '사과', '바나나', '딸기', '포도', '망고', '베리', '키위'], names: ['사과', '바나나', '배', '귤', '오렌지', '키위', '골드키위', '딸기', '블루베리', '라즈베리', '포도', '청포도', '샤인머스캣', '수박', '참외', '멜론', '복숭아', '천도복숭아', '자두', '살구', '망고', '파인애플', '감', '홍시', '곶감', '체리', '자몽', '아보카도', '방울토마토'] },
    { label: '우유·요거트·콩', keywords: ['우유', '요거트', '요구르트', '두유', '치즈', '견과', '콩'], names: ['우유', '저지방우유', '무지방우유', '락토프리우유', '무가당두유', '검은콩두유', '귀리음료', '아몬드음료', '플레인요거트', '무가당요거트', '그릭요거트', '딸기요거트', '마시는요구르트', '리코타치즈', '코티지치즈', '모차렐라치즈', '아몬드', '호두', '땅콩', '캐슈넛', '피스타치오', '병아리콩', '렌틸콩', '찐고구마', '군고구마', '찐감자', '찐옥수수'] },
    { label: '간식·디저트', keywords: ['떡', '케이크', '쿠키', '아이스크림', '과자', '푸딩', '디저트', '와플', '도넛'], names: ['백설기', '인절미', '송편', '가래떡', '절편', '꿀떡', '약식', '카스텔라', '치즈케이크', '생크림케이크', '초콜릿케이크', '티라미수', '달걀푸딩', '우유푸딩', '젤리', '초콜릿', '버터쿠키', '오트밀쿠키', '마카롱', '도넛', '와플', '팬케이크', '붕어빵', '호떡', '아이스크림', '팥빙수', '과일빙수', '팝콘', '감자칩', '크래커'] },
    { label: '음료', keywords: ['음료', '차', '커피', '라떼', '주스', '스무디', '에이드', '아메리카노'], names: ['물', '보리차', '옥수수차', '루이보스차', '캐모마일차', '생강차', '유자차', '녹차', '홍차', '아메리카노', '디카페인아메리카노', '카페라떼', '디카페인라떼', '바닐라라떼', '콜드브루', '카푸치노', '밀크티', '말차라떼', '코코아', '오렌지주스', '사과주스', '토마토주스', '포도주스', '당근주스', '망고스무디', '딸기스무디', '요거트스무디', '레몬에이드', '자몽에이드', '콜라', '사이다', '탄산수'] },
];

const ALIASES: Array<[RegExp, string]> = [
    [/계란/g, '달걀'], [/야채/g, '채소'], [/쇠고기/g, '소고기'],
    [/돈까스|돈까츠|돈카츠/g, '돈가스'], [/자장/g, '짜장'],
    [/짜장(?!면|떡|소스)/g, '짜장면'], [/스프/g, '수프'],
    [/요구르트|요구트|요거르트/g, '요거트'], [/오믈레트/g, '오믈렛'],
    [/오무라이스/g, '오므라이스'], [/크로와상|크로아상/g, '크루아상'],
    [/카모마일/g, '캐모마일'], [/브리또|부리또/g, '부리토'],
    [/리소토/g, '리조또'], [/후라이/g, '프라이'], [/에그/g, '달걀'],
    [/포리지/g, '오트밀'], [/프라이드치킨/g, '프라이드치킨'],
];

function compact(input: string) {
    return input.normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}

function comparable(input: string) {
    return ALIASES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), compact(input));
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
    '국수·면', '파스타·리조또', '샐러드', '수프', '분식·전', '빵·샌드위치', '피자·멕시코 요리',
]);

function familyStrength(query: string, family: FoodFamily) {
    return Math.max(0, ...family.keywords.map((keyword) => {
        const key = comparable(keyword);
        // A single syllable only identifies a dish when it is its suffix, not e.g. 전 in 전복.
        const matches = key.length === 1 ? query.endsWith(key) : query.includes(key);
        if (!matches) return 0;
        // In 버섯죽, the dish (죽) matters more than the longer ingredient (버섯).
        // Longer dish endings still win: 덮밥 / 국밥 / 비빔밥 before the generic 밥.
        const dishPriority = DISH_TYPE_FAMILIES.has(family.label) && query.endsWith(key) ? 100 : 0;
        return dishPriority + key.length;
    }));
}

export const FOOD_SEARCH_CATALOG = Array.from(new Set(FOOD_FAMILIES.flatMap((family) => family.names)));

const MATCH_REASONS: Record<Exclude<FoodMatchType, 'related'>, string> = {
    exact: '이름 일치', alias: '다른 표기의 음식', partial: '검색어 포함', typo: '비슷한 이름',
};

export function searchFoods(query: string, additionalNames: readonly string[] = [], maxResults = 12): FoodSearchResult[] {
    const cleaned = normalizeFoodQuery(query).slice(0, 80);
    const normalizedQuery = comparable(cleaned);
    if (!normalizedQuery || maxResults <= 0) return [];

    const families = FOOD_FAMILIES.map((family) => ({ family, strength: familyStrength(normalizedQuery, family) }));
    const strongestFamily = Math.max(0, ...families.map(({ strength }) => strength));
    const relatedFamilies = families.filter(({ strength }) => strength > 0 && strength >= strongestFamily);
    const ingredientKeywords = Array.from(new Set(FOOD_FAMILIES
        .filter((family) => !DISH_TYPE_FAMILIES.has(family.label))
        .flatMap((family) => family.keywords.map(comparable))
        .filter((keyword) => normalizedQuery.includes(keyword))));
    const candidates = new Map<string, string>();
    for (const rawName of [...FOOD_SEARCH_CATALOG, ...additionalNames]) {
        const name = normalizeFoodQuery(rawName);
        const key = comparable(name);
        if (key && !candidates.has(key)) candidates.set(key, name);
    }

    const ranked = Array.from(candidates, ([key, name]) => {
        let matchType: FoodMatchType | null = null;
        let score = 0;
        let familyLabel = '';
        if (compact(name) === compact(cleaned)) {
            matchType = 'exact'; score = 1000;
        } else if (key === normalizedQuery) {
            matchType = 'alias'; score = 950;
        } else if (key.includes(normalizedQuery)) {
            matchType = 'partial'; score = 800 + normalizedQuery.length / key.length;
        } else if (key.length >= 2 && normalizedQuery.includes(key)) {
            matchType = 'related'; score = 650 + key.length / normalizedQuery.length;
        } else if (normalizedQuery.length >= 3 && key.length >= 3 && Math.abs(key.length - normalizedQuery.length) <= 2) {
            const edits = distance(key, normalizedQuery);
            if (edits <= (normalizedQuery.length >= 6 ? 2 : 1) && edits / Math.max(key.length, normalizedQuery.length) <= 0.34) {
                matchType = 'typo'; score = 700 - edits;
            }
        }
        if (!matchType) {
            const related = relatedFamilies.find(({ family }) => family.names.includes(name));
            if (related) {
                matchType = 'related';
                familyLabel = related.family.label;
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
