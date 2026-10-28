import assert from 'node:assert/strict';
import test from 'node:test';
import type { NewsSnapshot } from './healthNews';

const { parseNewsSnapshot, readNewsSnapshot, isNewsSnapshotFresh, shouldRefreshNews, mergeNewsSnapshot, requestNewsSnapshot } = await import(new URL('./healthNews.ts', import.meta.url).href) as typeof import('./healthNews');
const now = new Date('2026-10-28T03:00:00Z');
const article = (id: number, publishedAt = '2026-10-20') => ({
    source: '국립암센터', title: `환자 교육 일정 ${id}`, url: `https://ncc.re.kr/notice/${id}`, publishedAt,
});
const snapshot = (minutesOld: number, partial = false): NewsSnapshot => ({
    items: [article(1)], updatedAt: new Date(now.getTime() - minutesOld * 60_000).toISOString(), partial,
});

test('news cache rejects malformed payloads and future timestamps, and reapplies the Korean two-month window', () => {
    for (const value of [null, [], {}, { items: [], updatedAt: 'not a date' }, { items: null, updatedAt: now.toISOString() }, { ...snapshot(1), partial: 'false' }, snapshot(-6)]) {
        assert.equal(parseNewsSnapshot(value, now), null);
    }
    assert.equal(readNewsSnapshot('{broken', now), null);
    const cache = parseNewsSnapshot({ ...snapshot(1), items: [article(1), article(2, '2026-08-27'), article(3, '2026-08-28')] }, now);
    assert.deepEqual(cache?.items.map((item) => item.url), ['https://ncc.re.kr/notice/1', 'https://ncc.re.kr/notice/3']);
});

test('malformed article rows cannot replace a valid cache with a fresh empty feed', async () => {
    const previous = snapshot(120);
    let current = previous;
    for (const item of [null, { title: 'missing required fields' }, { ...article(2), source: '' }, { ...article(2), url: 'javascript:alert(1)' }, { ...article(2), publishedAt: '2026-02-30' }, { ...article(2), kind: 'unknown' }]) {
        const malformed = { ...snapshot(0), items: [item] };
        assert.equal(parseNewsSnapshot(malformed, now), null);
        await assert.rejects(async () => {
            const incoming = await requestNewsSnapshot('/news', {
                signal: new AbortController().signal, now: () => now,
                fetcher: async () => Response.json(malformed),
            });
            current = mergeNewsSnapshot(current, incoming, now);
        }, /Invalid news response/);
        assert.deepEqual(current, previous);
    }
    assert.deepEqual(parseNewsSnapshot({ ...snapshot(0), items: [] }, now)?.items, []);
    assert.deepEqual(parseNewsSnapshot({ ...snapshot(0), items: [article(1, '2026-08-27'), article(2, '2026-10-29')] }, now)?.items, []);
});

test('partial news is retried after five minutes; complete results after one hour', () => {
    assert.equal(isNewsSnapshotFresh(snapshot(59), now), true);
    assert.equal(isNewsSnapshotFresh(snapshot(60), now), false);
    assert.equal(isNewsSnapshotFresh(snapshot(4, true), now), true);
    assert.equal(isNewsSnapshotFresh(snapshot(5, true), now), false);
    assert.equal(isNewsSnapshotFresh(snapshot(-1), now), true);
    assert.equal(isNewsSnapshotFresh(snapshot(-6), now), false);
});

test('verified empty results use the normal TTL while empty partial results retry sooner', () => {
    assert.equal(isNewsSnapshotFresh({ ...snapshot(59), items: [] }, now), true);
    assert.equal(isNewsSnapshotFresh({ ...snapshot(60), items: [] }, now), false);
    assert.equal(isNewsSnapshotFresh({ ...snapshot(4, true), items: [] }, now), true);
    assert.equal(isNewsSnapshotFresh({ ...snapshot(5, true), items: [] }, now), false);
});

test('repeated focus and network recovery events respect the refresh backoff', () => {
    assert.equal(shouldRefreshNews(null, 0, now), true);
    // An all-source failure has no successful snapshot; focus events still wait a minute.
    assert.equal(shouldRefreshNews(null, now.getTime(), now), false);
    assert.equal(shouldRefreshNews(null, now.getTime() - 59_999, now), false);
    assert.equal(shouldRefreshNews(null, now.getTime() - 60_000, now), true);
    assert.equal(shouldRefreshNews(snapshot(70), now.getTime() - 59_999, now), false);
    assert.equal(shouldRefreshNews(snapshot(70), now.getTime() - 60_000, now), true);
    assert.equal(shouldRefreshNews(snapshot(1), 0, now), false);
});

test('partial refresh preserves recent cached articles but a complete empty result clears them', () => {
    const previous = { ...snapshot(120), items: [article(1), article(2, '2026-08-27')] };
    const incoming = { ...snapshot(0, true), items: [article(3)] };
    const before = JSON.stringify([previous, incoming]);
    assert.deepEqual(mergeNewsSnapshot(previous, incoming, now).items.map((item) => item.url), ['https://ncc.re.kr/notice/3', 'https://ncc.re.kr/notice/1']);
    assert.deepEqual(mergeNewsSnapshot(previous, { ...incoming, partial: false, items: [] }, now).items, []);
    assert.equal(JSON.stringify([previous, incoming]), before);
});

test('repeated partial refreshes and oversized caches retain at most 60 articles in newest-first order', () => {
    let current: NewsSnapshot = { ...snapshot(0), items: [] };
    for (let batch = 0; batch < 5; batch += 1) {
        const incoming = { ...snapshot(0, true), items: Array.from({ length: 40 }, (_, index) => article(batch * 40 + index, `2026-10-${20 + batch}`)) };
        current = mergeNewsSnapshot(current, incoming, now);
        assert.ok(current.items.length <= 60);
    }
    assert.equal(current.items.length, 60);
    assert.equal(current.items[0].publishedAt, '2026-10-24');
    assert.equal(current.items.at(-1)?.publishedAt, '2026-10-23');
    const oversized = parseNewsSnapshot({ ...snapshot(0), items: Array.from({ length: 100 }, (_, index) => article(index)) }, now);
    assert.equal(oversized?.items.length, 60);
});

test('network responses are validated and not mistaken for a valid empty feed', async () => {
    const signal = new AbortController().signal;
    const options = { signal, now: () => now };
    assert.deepEqual(await requestNewsSnapshot('/news', { ...options, fetcher: async () => Response.json(snapshot(0)) }), snapshot(0));
    await assert.rejects(requestNewsSnapshot('/news', { ...options, fetcher: async () => Response.json({ error: 'unavailable' }) }), /Invalid news response/);
    await assert.rejects(requestNewsSnapshot('/news', { ...options, fetcher: async () => new Response('', { status: 503 }) }), /unavailable/);
});

test('request timeout aborts the fetch and parent cancellation prevents a stale response', async () => {
    const waitingFetch = async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
    await assert.rejects(requestNewsSnapshot('/news', { signal: new AbortController().signal, fetcher: waitingFetch, timeoutMs: 10 }), { name: 'TimeoutError' });
    const parent = new AbortController();
    const pending = requestNewsSnapshot('/news', { signal: parent.signal, fetcher: waitingFetch });
    parent.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    let calls = 0;
    await assert.rejects(requestNewsSnapshot('/news', { signal: parent.signal, fetcher: async () => { calls += 1; return Response.json(snapshot(0)); } }), { name: 'AbortError' });
    assert.equal(calls, 0);
});

test('an aborted account request cannot publish a late body even if its transport ignores cancellation', async () => {
    const parent = new AbortController();
    const result = requestNewsSnapshot('/news', {
        signal: parent.signal, now: () => now,
        fetcher: async () => { parent.abort(); return Response.json(snapshot(0)); },
    });
    await assert.rejects(result, { name: 'AbortError' });
});
