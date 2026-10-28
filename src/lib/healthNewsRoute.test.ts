import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import type { NextRequest as NextRequestType } from 'next/server';

const { NextRequest, NextResponse } = createRequire(import.meta.url)('next/server') as typeof import('next/server');
const articles = await import(new URL('./alertArticles.ts', import.meta.url).href) as typeof import('./alertArticles');
const compiledRoute = transpileModule(readFileSync(new URL('../app/api/custom-alerts/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
type FetchSource = (url: string, init: RequestInit & { next?: { revalidate: number } }) => Promise<Response>;
type Route = { GET: (request: NextRequestType) => Promise<Response> };

// Load the actual route with isolated upstream transport; Next responses and parsers stay real.
function loadRoute(fetcher: FetchSource): Route {
    const route = {} as Route;
    runInNewContext(compiledRoute, {
        exports: route, fetch: fetcher, AbortSignal, URL,
        require: (name: string) => {
            if (name === 'next/server') return { NextResponse };
            if (name === '@/lib/alertArticles') return articles;
            throw new Error(`Unexpected route dependency: ${name}`);
        },
    });
    return route;
}

const publishedAt = new Date(Date.now() - 60_000).toISOString();
const publicationDay = publishedAt.slice(0, 10);
const rss = (title: string, url = 'https://ncc.re.kr/test-news') => `<rss><channel><item><title>${title}</title><link>${url}</link><pubDate>${publishedAt}</pubDate><source url="https://ncc.re.kr">국립암센터</source></item></channel></rss>`;

function sourceBody(url: string, title: string): string {
    if (url === 'https://www.cancer.go.kr/') {
        return `<div class="slide__wrap"><a href="/test-news" class="txt">${title}</a><span class="date">${publicationDay}</span></div>`;
    }
    if (url === 'https://www.nhis.or.kr/nhis/index.do') {
        return `<section id="newsTabpanel01"><li><a href="/test-news" class="tit">${title}</a><span class="date">${publicationDay}</span></li></section>`;
    }
    if (url.includes('wbhaea01600m01.do')) {
        return `<tr><td>${publicationDay.replaceAll('-', '.')}</td><a href="?mode=view&amp;articleNo=42" class="a-link">${title}</a></tr>`;
    }
    if (url.includes('www.ncc.re.kr')) {
        return `<tr><td>${publicationDay.replaceAll('-', '.')}</td><a onclick="fncView(42)">${title}</a></tr>`;
    }
    return rss(title);
}

test('health news route preserves personalized selection and returns a private, current successful snapshot', async () => {
    let sourceCount = 0;
    const route = loadRoute(async (url, init) => {
        sourceCount += 1;
        assert.equal(init.next?.revalidate, 3600);
        assert.equal(init.signal?.aborted, false);
        let body = sourceBody(url, '유방암 환자 교육 일정');
        if (url.includes('news.google.com')) {
            body = body.replace('</channel>', `<item><title>폐암 환자 교육 일정</title><link>https://ncc.re.kr/other-profile</link><pubDate>${publishedAt}</pubDate><source url="https://ncc.re.kr">국립암센터</source></item></channel>`);
        }
        return new Response(body);
    });
    const response = await route.GET(new NextRequest('http://localhost/api/custom-alerts?cancerType=유방암'));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(payload.keyword, '유방암');
    assert.equal(payload.partial, false);
    assert.ok(payload.items.length > 0);
    assert.ok(payload.items.every((item: { title: string }) => item.title.includes('유방암')));
    assert.ok(Number.isFinite(Date.parse(payload.updatedAt)));
    assert.equal(sourceCount, 12);
});

test('health news partial-source failure keeps confirmed items and explicitly reports partial status', async () => {
    const route = loadRoute(async (url) => {
        if (!url.includes('news.google.com')) throw new Error('Source unavailable');
        return new Response(rss('암환자 교육 일정 안내'));
    });
    const response = await route.GET(new NextRequest('http://localhost/api/custom-alerts?mode=general'));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.partial, true);
    assert.equal(payload.items.length, 1);
});

test('health news verified empty results remain distinct from an all-source outage', async () => {
    const emptyRoute = loadRoute(async (url) => new Response(sourceBody(url, '도서관 행사 일정 안내')));
    const empty = await emptyRoute.GET(new NextRequest('http://localhost/api/custom-alerts?mode=general'));
    const emptyPayload = await empty.json();
    assert.equal(empty.status, 200);
    assert.equal(emptyPayload.partial, false);
    assert.deepEqual(emptyPayload.items, []);
    assert.ok(emptyPayload.updatedAt);

    const unavailableRoute = loadRoute(async () => new Response('Service unavailable', { status: 503 }));
    const unavailable = await unavailableRoute.GET(new NextRequest('http://localhost/api/custom-alerts?mode=general'));
    const unavailablePayload = await unavailable.json();
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get('cache-control'), 'private, no-store');
    assert.ok(unavailablePayload.error);
    assert.equal(unavailablePayload.updatedAt, undefined);
});

test('health news cancellation propagates to every upstream and never returns a successful partial snapshot', async () => {
    const signals: AbortSignal[] = [];
    const controller = new AbortController();
    const route = loadRoute(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        assert.ok(init.signal);
        signals.push(init.signal);
        init.signal.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const pending = route.GET(new NextRequest('http://localhost/api/custom-alerts?mode=general', { signal: controller.signal }));
    assert.equal(signals.length, 11);
    controller.abort();
    const response = await pending;
    assert.equal(response.status, 503);
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal((await response.json()).updatedAt, undefined);
});
