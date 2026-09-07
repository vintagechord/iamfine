import type { DayPlan, MealSlot, RecentDietPattern } from './dietEngine';

export type MealRecordItem = Readonly<{
    name: string;
    eaten: boolean;
    notEaten?: boolean;
    isManual?: boolean;
    servings?: number;
}>;

export type MealRecordLog = Readonly<{
    meals: Readonly<Partial<Record<MealSlot, readonly MealRecordItem[]>>>;
    memo?: string;
    medicationTakenIds?: readonly string[];
}>;

type MealRecordLogs = Readonly<Record<string, MealRecordLog>>;
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAIN_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const LOOKBACK_DAYS = 14;
const PROTEIN_NAMES = [
    '고기', '닭', '오리', '생선', '연어', '고등어', '대구', '명태', '동태', '갈치', '삼치', '참치', '멸치', '장어',
    '가자미', '두부', '달걀', '계란', '콩', '요거트', '두유', '우유', '치즈', '새우', '조개', '굴', '전복', '오징어',
    '낙지', '홍합', '게살', '불고기', '제육', '스테이크', '치킨', '돈가스', '돈까스',
];
const VEGETABLE_NAMES = ['브로콜리', '양배추', '배추', '시금치', '오이', '당근', '버섯', '샐러드', '채소', '야채', '나물', '호박', '가지', '청경채', '상추', '깻잎', '미나리', '무국', '뭇국'];

function offsetDateKey(referenceDateKey: string, offset: number) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(referenceDateKey);
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.toISOString().slice(0, 10) !== referenceDateKey) return '';
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function foodName(item: MealRecordItem) {
    return item.name.split(' · ')[0].trim().toLowerCase().replace(/\(1인분\)\s*$/, '');
}

function eatenItems(log: MealRecordLog) {
    return SLOTS.flatMap((slot) => (log.meals[slot] ?? []).filter((item) => item.eaten));
}

function includesKeyword(item: MealRecordItem, keywords: readonly string[]) {
    const name = foodName(item);
    return keywords.some((keyword) => name.includes(keyword));
}

// Keep the existing preference-hint weighting. It is not an intake measurement.
function preferenceKeywordCount(items: readonly MealRecordItem[], keywords: readonly string[]) {
    return items.reduce((count, item) => {
        if (!includesKeyword(item, keywords)) return count;
        const servings = typeof item.servings === 'number' && Number.isFinite(item.servings) ? item.servings : 1;
        return count + Math.max(1, Math.round(servings));
    }, 0);
}

function explicitlySkipped(log: MealRecordLog, slot: MealSlot) {
    const items = log.meals[slot] ?? [];
    return items.length > 0 && items.every((item) => item.notEaten === true && !item.eaten);
}

function allMainMealsRecorded(log: MealRecordLog) {
    return MAIN_SLOTS.every((slot) => explicitlySkipped(log, slot) || (log.meals[slot] ?? []).some((item) => item.eaten));
}

function buildRecentDietSignals(logs: MealRecordLogs, referenceDateKey: string) {
    const items = Array.from({ length: LOOKBACK_DAYS }, (_, index) => {
        const dateKey = offsetDateKey(referenceDateKey, -index);
        const log = dateKey ? logs[dateKey] : undefined;
        return log ? eatenItems(log) : [];
    }).flat();
    if (items.length === 0) return [] as string[];

    const count = (keywords: string[]) => preferenceKeywordCount(items, keywords);
    const signals: string[] = [];
    const add = (signal: string) => { if (!signals.includes(signal)) signals.push(signal); };
    const proteinCount = count(['닭', '생선', '연어', '두부', '달걀', '콩', '요거트', '두유']);
    const fishCount = count(['생선', '연어', '고등어', '대구', '참치']);
    const flourCount = count(['빵', '라면', '면', '파스타', '피자', '도넛']);
    const sweetCount = count(['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림']);
    const spicyCount = count(['매운', '떡볶이', '불닭', '짬뽕']);
    const pizzaCount = count(['피자', '치즈피자', '페퍼로니피자', '불고기피자']);
    const friedChickenCount = count(['치킨', '후라이드치킨', '양념치킨', '간장치킨', '닭강정']);
    const sandwichCount = count(['샌드위치', '햄버거', '치즈버거', '토스트']);
    const beefCount = count(['소고기', '불고기', '스테이크', '안심']);
    const porkCount = count(['돼지고기', '삼겹살', '목살', '제육', '돈가스']);
    const chickenCount = count(['닭고기', '닭가슴살', '닭다리', '닭안심']);
    const duckCount = count(['오리고기', '오리', '훈제오리']);

    if (pizzaCount >= 2) add('피자');
    if (friedChickenCount >= 2) add('치킨');
    if (sandwichCount >= 2) add('샌드위치');
    if (beefCount >= 2) add('소고기');
    if (porkCount >= 2) add('돼지고기');
    if (chickenCount >= 3 && friedChickenCount < 2) add('닭고기');
    if (duckCount >= 2) add('오리고기');
    if (proteinCount < 6) add('단백질 보강');
    if (fishCount < 3) add('생선/해산물');
    if (flourCount + sweetCount >= 6) { add('건강식'); add('소화 편한 식사'); }
    if (spicyCount >= 4) add('담백한 맛');
    if (signals.length < 3) add('채소 보강');
    if (signals.length < 3) add('따뜻한 음식');
    return signals.slice(0, 8);
}

function buildRecentDietPattern(logs: MealRecordLogs, referenceDateKey: string): RecentDietPattern {
    const pattern: RecentDietPattern = {
        analyzedDays: 0, skippedMealDays: 0, lowProteinDays: 0, lowVegetableDays: 0,
        highFlourSugarDays: 0, highSodiumDays: 0, spicyHeavyDays: 0,
    };
    const flourSugar = ['빵', '라면', '면', '파스타', '피자', '도넛', '햄버거', '케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림', '시럽', '주스'];
    const sodium = ['라면', '찌개', '국밥', '젓갈', '장아찌', '햄', '소시지', '가공육', '짠'];
    const spicyHeavy = ['매운', '불닭', '짬뽕', '떡볶이', '튀김', '치킨', '야식', '술', '맥주', '소주'];
    for (let index = 1; index <= LOOKBACK_DAYS; index += 1) {
        const dateKey = offsetDateKey(referenceDateKey, -index);
        const log = dateKey ? logs[dateKey] : undefined;
        if (!log || !SLOTS.some((slot) => (log.meals[slot] ?? []).some((item) => item.eaten || item.notEaten))) continue;
        pattern.analyzedDays += 1;
        if (MAIN_SLOTS.some((slot) => explicitlySkipped(log, slot))) pattern.skippedMealDays += 1;
        const items = eatenItems(log);
        // These fields describe names absent from a fully recorded day, not
        // clinical protein/vegetable deficiency inferred from missing records.
        if (allMainMealsRecorded(log)) {
            if (!items.some((item) => includesKeyword(item, PROTEIN_NAMES))) pattern.lowProteinDays += 1;
            if (!items.some((item) => includesKeyword(item, VEGETABLE_NAMES))) pattern.lowVegetableDays += 1;
        }
        const count = (keywords: string[]) => items.filter((item) => includesKeyword(item, keywords)).length;
        // Count marked food entries once; guessed portions are not frequency.
        if (count(flourSugar) >= 2) pattern.highFlourSugarDays += 1;
        if (count(sodium) >= 2) pattern.highSodiumDays += 1;
        if (count(spicyHeavy) >= 2) pattern.spicyHeavyDays += 1;
    }
    return pattern;
}

/** The signals are food-preference hints, not a symptom diagnosis. */
export function buildDietRecordContext(logs: MealRecordLogs, referenceDateKey: string) {
    return {
        recentDietPattern: buildRecentDietPattern(logs, referenceDateKey),
        recentDietSignals: buildRecentDietSignals(logs, referenceDateKey),
    };
}

/** Records cannot establish gram amounts or justify compensatory meal changes. */
export function applyMealRecordGuidance(plan: DayPlan, yesterdayLog?: MealRecordLog) {
    const notes: string[] = [];
    if (!yesterdayLog) return { plan, notes };
    if (MAIN_SLOTS.some((slot) => explicitlySkipped(yesterdayLog, slot))) {
        notes.push('전날 먹지 않았다고 남긴 끼니가 있어요. 식사가 계속 어렵다면 의료진·영양사와 상의해 주세요.');
    }
    const items = eatenItems(yesterdayLog);
    if (items.length > 0 && allMainMealsRecorded(yesterdayLog) && !items.some((item) => includesKeyword(item, PROTEIN_NAMES))) {
        notes.push('전날 기록에는 단백질 식품 이름이 없어요. 빠진 기록을 확인하고, 먹을 수 있는 식품은 의료진·영양사와 정해 주세요.');
    }
    const sweetOrFried = ['케이크', '쿠키', '과자', '초콜릿', '탄산', '아이스크림', '시럽', '도넛', '튀김', '후라이드', '양념치킨', '닭강정', '돈가스', '돈까스'];
    if (items.filter((item) => includesKeyword(item, sweetOrFried)).length >= 3) {
        notes.push('전날 기록에 단 음식이나 튀긴 음식이 여러 번 보여요. 오늘도 끼니를 거르지 말고, 먹기 편한 다양한 음식을 살펴보세요.');
    }
    return { plan, notes };
}
