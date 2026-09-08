export type DailyVerse = Readonly<{
    text: string;
    reference: string;
    sourceUrl: string;
}>;

// Verbatim Korean Revised Version (개역한글판), Korean Bible Society 1961.
// Checked against the official HAN text on 2026-09-09. Keep complete verses
// and original spelling; only verse numbers and editorial footnotes are omitted.
export const DAILY_VERSES: readonly DailyVerse[] = [
    { text: '그가 나를 푸른 초장에 누이시며 쉴만한 물 가으로 인도하시는도다 내 영혼을 소생시키시고 자기 이름을 위하여 의의 길로 인도하시는도다', reference: '시편 23:2–3', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=23&sec=2' },
    { text: '수고하고 무거운 짐진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라', reference: '마태복음 11:28', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=mat&chap=11&sec=28' },
    { text: '여호와의 자비와 긍휼이 무궁하시므로 우리가 진멸되지 아니함이니이다 이것이 아침마다 새로우니 주의 성실이 크도소이다', reference: '예레미야애가 3:22–23', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=lam&chap=3&sec=22' },
    { text: '내가 너를 보배롭고 존귀하게 여기고 너를 사랑하였은즉 내가 사람들을 주어 너를 바꾸며 백성들로 네 생명을 대신하리니', reference: '이사야 43:4', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=isa&chap=43&sec=4' },
    { text: '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라 내가 너희에게 주는 것은 세상이 주는 것 같지 아니하니라 너희는 마음에 근심도 말고 두려워하지도 말라', reference: '요한복음 14:27', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=jhn&chap=14&sec=27' },
    { text: '하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라', reference: '시편 46:1', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=46&sec=1' },
    { text: '너희 염려를 다 주께 맡겨 버리라 이는 저가 너희를 권고하심이니라', reference: '베드로전서 5:7', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=1pe&chap=5&sec=7' },
    { text: '주께서 나의 전후를 두르시며 내게 안수하셨나이다', reference: '시편 139:5', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=139&sec=5' },
    { text: '소망의 하나님이 모든 기쁨과 평강을 믿음 안에서 너희에게 충만케 하사 성령의 능력으로 소망이 넘치게 하시기를 원하노라', reference: '로마서 15:13', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=rom&chap=15&sec=13' },
    { text: '피곤한 자에게는 능력을 주시며 무능한 자에게는 힘을 더하시나니', reference: '이사야 40:29', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=isa&chap=40&sec=29' },
    { text: '나의 영혼이 잠잠히 하나님만 바람이여 나의 구원이 그에게서 나는도다', reference: '시편 62:1', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=62&sec=1' },
    { text: '찬송하리로다 그는 우리 주 예수 그리스도의 하나님이시요 자비의 아버지시요 모든 위로의 하나님이시며 우리의 모든 환난 중에서 우리를 위로하사 우리로 하여금 하나님께 받는 위로로써 모든 환난 중에 있는 자들을 능히 위로하게 하시는 이시로다', reference: '고린도후서 1:3–4', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=2co&chap=1&sec=3' },
    { text: '너의 하나님 여호와가 너의 가운데 계시니 그는 구원을 베푸실 전능자시라 그가 너로 인하여 기쁨을 이기지 못하여 하시며 너를 잠잠히 사랑하시며 너로 인하여 즐거이 부르며 기뻐하시리라 하리라', reference: '스바냐 3:17', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=zep&chap=3&sec=17' },
    { text: '아침에 나로 주의 인자한 말씀을 듣게 하소서 내가 주를 의뢰함이니이다 나의 다닐 길을 알게 하소서 내가 내 영혼을 주께 받듦이니이다', reference: '시편 143:8', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=143&sec=8' },
    { text: '그리하면 모든 지각에 뛰어난 하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라', reference: '빌립보서 4:7', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=php&chap=4&sec=7' },
    { text: '여호와 그가 네 앞서 행하시며 너와 함께하사 너를 떠나지 아니하시며 버리지 아니하시리니 너는 두려워 말라 놀라지 말라', reference: '신명기 31:8', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=deu&chap=31&sec=8' },
    { text: '내가 확신하노니 사망이나 생명이나 천사들이나 권세자들이나 현재 일이나 장래 일이나 능력이나 높음이나 깊음이나 다른 아무 피조물이라도 우리를 우리 주 그리스도 예수 안에 있는 하나님의 사랑에서 끊을 수 없으리라', reference: '로마서 8:38–39', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=rom&chap=8&sec=38' },
    { text: '나의 도움이 천지를 지으신 여호와에게서로다', reference: '시편 121:2', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=121&sec=2' },
    { text: '여인이 어찌 그 젖먹는 자식을 잊겠으며 자기 태에서 난 아들을 긍휼히 여기지 않겠느냐 그들은 혹시 잊을찌라도 나는 너를 잊지 아니할 것이라', reference: '이사야 49:15', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=isa&chap=49&sec=15' },
    { text: '여호와는 네게 복을 주시고 너를 지키시기를 원하며 여호와는 그 얼굴로 네게 비취사 은혜 베푸시기를 원하며 여호와는 그 얼굴을 네게로 향하여 드사 평강 주시기를 원하노라 할찌니라 하라', reference: '민수기 6:24–26', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=num&chap=6&sec=24' },
    { text: '두려워 말라 내가 너와 함께 함이니라 놀라지 말라 나는 네 하나님이 됨이니라 내가 너를 굳세게 하리라 참으로 너를 도와 주리라 참으로 나의 의로운 오른손으로 너를 붙들리라', reference: '이사야 41:10', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=isa&chap=41&sec=10' },
    { text: '아버지께서 나를 사랑하신 것 같이 나도 너희를 사랑하였으니 나의 사랑 안에 거하라', reference: '요한복음 15:9', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=jhn&chap=15&sec=9' },
    { text: '돈을 사랑치 말고 있는 바를 족한 줄로 알라 그가 친히 말씀하시기를 내가 과연 너희를 버리지 아니하고 과연 너희를 떠나지 아니하리라 하셨느니라', reference: '히브리서 13:5', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=heb&chap=13&sec=5' },
    { text: '내가 평안히 눕고 자기도 하리니 나를 안전히 거하게 하시는 이는 오직 여호와시니이다', reference: '시편 4:8', sourceUrl: 'https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book=psa&chap=4&sec=8' },
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
