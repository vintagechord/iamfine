export type DailyVerse = Readonly<{
    text: string;
    reference: string;
    sourceUrl: string;
}>;

// Original Korean paraphrases, checked against the public-domain Bible text at
// eBible.org. These are not quotations from a named Korean Bible translation.
export const DAILY_VERSES: readonly DailyVerse[] = [
    { text: '주님은 잔잔한 물가로 이끄시고, 지친 마음을 새롭게 하십니다.', reference: '시편 23:2–3', sourceUrl: 'https://ebible.org/study/content/texts/eng-web/PS23.html' },
    { text: '수고하고 무거운 짐을 진 여러분, 예수님께 와서 쉬세요.', reference: '마태복음 11:28', sourceUrl: 'https://ebible.org/engwebp/MAT11.htm' },
    { text: '하나님의 한결같은 사랑과 자비는 아침마다 새롭습니다.', reference: '예레미야애가 3:22–23', sourceUrl: 'https://ebible.org/engwebp/LAM03.htm' },
    { text: '하나님께 여러분은 소중하고 귀하며, 사랑받는 존재입니다.', reference: '이사야 43:4', sourceUrl: 'https://ebible.org/engwebp/ISA43.htm' },
    { text: '예수님은 우리에게 자신의 평안을 선물로 주십니다.', reference: '요한복음 14:27', sourceUrl: 'https://ebible.org/engwebp/JHN14.htm' },
    { text: '하나님은 어려운 순간에 의지할 피난처이며 우리의 힘이십니다.', reference: '시편 46:1', sourceUrl: 'https://ebible.org/study/content/texts/engwebp/PS46.html' },
    { text: '하나님이 여러분을 돌보시니, 마음의 걱정을 맡겨 보세요.', reference: '베드로전서 5:7', sourceUrl: 'https://ebible.org/engwebp/1PE05.htm' },
    { text: '주님은 앞에서도 뒤에서도 나를 감싸고 손을 얹어 주십니다.', reference: '시편 139:5', sourceUrl: 'https://ebible.org/engwebp/PSA139.htm' },
    { text: '소망의 하나님이 믿음 안에 기쁨과 평안을 가득 주시기를 바랍니다.', reference: '로마서 15:13', sourceUrl: 'https://ebible.org/engwebp/ROM15.htm' },
    { text: '하나님은 지친 이에게 힘을 주시고, 힘없는 이를 북돋아 주십니다.', reference: '이사야 40:29', sourceUrl: 'https://ebible.org/engwebp/ISA40.htm' },
    { text: '나의 마음은 하나님 안에서 고요히 쉽니다.', reference: '시편 62:1', sourceUrl: 'https://ebible.org/engwebp/PSA062.htm' },
    { text: '하나님은 모든 어려움 속에서 우리를 위로해 주십니다.', reference: '고린도후서 1:3–4', sourceUrl: 'https://ebible.org/engwebp/2CO01.htm' },
    { text: '하나님은 여러분과 함께하시며, 기쁨과 사랑으로 품어 주십니다.', reference: '스바냐 3:17', sourceUrl: 'https://ebible.org/engwebp/ZEP03.htm' },
    { text: '주님의 사랑을 아침에 듣고, 오늘 걸어갈 길을 알게 해 주세요.', reference: '시편 143:8', sourceUrl: 'https://ebible.org/engwebp/PSA143.htm' },
    { text: '하나님의 평안이 예수님 안에서 여러분의 마음과 생각을 지켜 줍니다.', reference: '빌립보서 4:7', sourceUrl: 'https://ebible.org/engwebp/PHP04.htm' },
    { text: '하나님은 여러분보다 앞서 가시며, 곁에서 함께하십니다.', reference: '신명기 31:8', sourceUrl: 'https://ebible.org/engwebp/DEU31.htm' },
    { text: '그 무엇도 예수님 안에 있는 하나님의 사랑에서 우리를 떼어 놓을 수 없습니다.', reference: '로마서 8:38–39', sourceUrl: 'https://ebible.org/engwebp/ROM08.htm' },
    { text: '나를 돕는 손길은 하늘과 땅을 지으신 주님에게서 옵니다.', reference: '시편 121:2', sourceUrl: 'https://ebible.org/engwebp/PSA121.htm' },
    { text: '하나님은 여러분을 잊지 않으십니다.', reference: '이사야 49:15', sourceUrl: 'https://ebible.org/engwebp/ISA49.htm' },
    { text: '주님이 여러분을 돌보시고, 은혜와 평안을 주시기를 바랍니다.', reference: '민수기 6:24–26', sourceUrl: 'https://ebible.org/engwebu/NUM06.htm' },
    { text: '하나님이 함께하시며, 여러분에게 힘을 주고 붙들어 주십니다.', reference: '이사야 41:10', sourceUrl: 'https://ebible.org/engwebp/ISA41.htm' },
    { text: '예수님이 여러분을 사랑하십니다. 그 사랑 안에 머무르세요.', reference: '요한복음 15:9', sourceUrl: 'https://ebible.org/engwebp/JHN15.htm' },
    { text: '하나님은 여러분을 떠나거나 버리지 않겠다고 말씀하십니다.', reference: '히브리서 13:5', sourceUrl: 'https://ebible.org/engwebp/HEB13.htm' },
    { text: '주님이 나를 지켜 주시니, 평안히 누워 잠듭니다.', reference: '시편 4:8', sourceUrl: 'https://ebible.org/engwebp/PSA004.htm' },
];

const DAY_MS = 86_400_000;
const seoulDateFormatter = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function getSeoulDateKey(now: Date): string {
    const parts = seoulDateFormatter.formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function getDailyVerse(now: Date): DailyVerse {
    // A full-date ordinal keeps the rotation continuous at month/year boundaries.
    const dayNumber = Math.floor(Date.parse(`${getSeoulDateKey(now)}T00:00:00Z`) / DAY_MS);
    const index = ((dayNumber % DAILY_VERSES.length) + DAILY_VERSES.length) % DAILY_VERSES.length;
    return DAILY_VERSES[index];
}

export function millisecondsUntilNextSeoulDay(now: Date): number {
    // Modern Asia/Seoul uses UTC+09:00 without daylight saving time.
    const todayStart = Date.parse(`${getSeoulDateKey(now)}T00:00:00+09:00`);
    return todayStart + DAY_MS - now.getTime();
}
