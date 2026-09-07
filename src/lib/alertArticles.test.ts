import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AlertArticle } from './alertArticles';
const { articleCutoff, filterAlertArticles, normalizeArticleUrl, parseArticleDate } = await import(new URL('./alertArticles.ts', import.meta.url).href) as typeof import('./alertArticles');

const now = new Date('2026-09-07T03:00:00Z');
function article(title: string, url: string, publishedAt = '2026.08.10', extra: Partial<AlertArticle> = {}): AlertArticle {
    return { title, url, publishedAt, source: '언론사', ...extra };
}

test('two calendar months includes the cutoff day, rejects old, future, missing and invalid dates', () => {
    const dates = ['2026.07.07', '2026.07.06', '2026.09.08', '', '2026.02.31', '2026.08.12'];
    const result = filterAlertArticles(dates.map((date, index) => article(`독립 소식 ${index}`, `https://example.com/${index}`, date)), now);
    assert.deepEqual(result.map((item) => item.publishedAt), ['2026.08.12', '2026.07.07']);
    assert.equal(parseArticleDate('2026'), null);
    assert.equal(parseArticleDate('2026. 08. 12.'), Date.parse('2026-08-12T00:00:00+09:00'));
    assert.equal(parseArticleDate('Mon, 07 Sep 2026 01:00:00 GMT'), Date.parse('2026-09-07T01:00:00Z'));
});

test('month-end cutoff clamps to the last day of February including leap years', () => {
    assert.equal(articleCutoff(new Date('2026-04-30T05:00:00Z')), Date.parse('2026-02-28T00:00:00+09:00'));
    assert.equal(articleCutoff(new Date('2024-04-30T05:00:00Z')), Date.parse('2024-02-29T00:00:00+09:00'));
});

test('tracking URLs and alternate board search URLs collapse without removing article IDs', () => {
    assert.equal(normalizeArticleUrl('https://www.ncc.re.kr/prBoardView1.ncc?nwsId=12&pageNum=2&utm_source=feed#top'), 'https://ncc.re.kr/prBoardView1.ncc?nwsId=12');
    const result = filterAlertArticles([
        article('같은 기사 첫 제목', 'https://example.com/a?id=1&utm_source=feed'),
        article('바뀐 기사 제목', 'https://www.example.com/a?id=1&fbclid=abc'),
        article('다른 소식', 'https://example.com/a?id=2'),
        article('잘못된 링크', 'javascript:alert(1)'),
    ], now);
    assert.equal(result.length, 2);
});

test('syndicated headlines and small title changes collapse; original institution wins', () => {
    const title = '국립암센터, 암 생존자를 위한 새로운 영양 교육 프로그램 운영';
    const result = filterAlertArticles([
        article(`${title} - 건강신문`, 'https://news.google.com/rss/articles/123', '2026.08.11', { source: '건강신문', kind: 'news' }),
        article('[보도자료] 국립암센터 암생존자를 위한 새로운 영양교육 프로그램 운영', 'https://ncc.re.kr/prBoardView1.ncc?nwsId=1', '2026.08.10', { source: '국립암센터', kind: 'official' }),
        article('국립암센터, 암 생존자를 위한 새로운 영양 교육 프로그램 운영한다', 'https://example.com/reprint'),
    ], now);
    assert.equal(result.length, 1);
    assert.equal(result[0].source, '국립암센터');
});

test('related but distinct reports with different figures stay separate and cache filtering is idempotent', () => {
    const items = [article('국립암센터 암환자 영양 연구 대상 환자 120명 분석', 'https://example.com/1'), article('국립암센터 암환자 영양 연구 대상 환자 180명 분석', 'https://example.com/2')];
    const result = filterAlertArticles(items, now);
    assert.equal(result.length, 2);
    assert.deepEqual(filterAlertArticles(result, now), result);
    assert.equal(filterAlertArticles(result, new Date('2027-01-01T00:00:00Z')).length, 0);
});


test('live rewritten camping and RAD51D reports collapse by a distinctive event, not cancer type', () => {
    const result = filterAlertArticles([
        article('국립암센터, 소아청소년암 환아·가족을 위한 ‘새봄힐링캠핑’ 개최', 'https://ncc.re.kr/1', '2026.09.07', { kind: 'official' }),
        article('국립암센터, 소아청소년암 환자·가족 위한 ‘새봄 힐링캠핑’ 개최', 'https://example.com/1', '2026.09.07'),
        article('국립암센터, 소아청소년암 환자 ‘새봄힐링캠핑’ 개최', 'https://example.com/2', '2026.09.07'),
        article('유방암 유전자 ‘RAD51D’ 변이, 항암 치료 반응 예측 단서 가능성 확인', 'https://example.com/3', '2026.08.25'),
        article('유방암 유전자 변이 ‘RAD51D’, 공격적이지만 항암엔 더 잘 반응', 'https://example.com/4', '2026.08.25'),
        article('유방암 예후 좋지만 까다로운 삼중음성유방암 치료 어쩌나', 'https://example.com/5', '2026.08.25'),
        article('유방암 유전자 RAD51D 보유자 임신과 출산 상담 안내', 'https://example.com/6', '2026.08.25'),
    ], now);
    assert.equal(result.length, 4);
    assert.equal(result[0].kind, 'official');
});


test('shared study markers do not override conflicting figures or match a different full marker', () => {
    for (const titles of [
        ['RAD51D 유방암 항암반응 연구 대상 환자 120명 분석', 'RAD51D 유방암 항암반응 연구 대상 환자 180명 분석'],
        ['RAD51D 유방암 항암 치료 반응 예측 연구 발표', 'RAD51D2 유방암 항암 치료 반응 예측 연구 발표'],
    ]) {
        const result = filterAlertArticles(titles.map((title, index) => article(title, `https://example.com/${index}`, '2026.08.25')), now);
        assert.equal(result.length, 2);
    }
});
