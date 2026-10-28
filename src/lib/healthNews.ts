import { filterAlertArticles, normalizeArticleUrl, parseArticleDate, type AlertArticle } from './alertArticles.ts';

export type NewsSnapshot = {
    items: AlertArticle[];
    updatedAt: string;
    partial: boolean;
};

export const NEWS_CACHE_TTL_MS = 60 * 60 * 1000;
export const NEWS_PARTIAL_CACHE_TTL_MS = 5 * 60 * 1000;
export const NEWS_RETRY_DELAY_MS = 60 * 1000;
export const NEWS_ITEM_LIMIT = 60;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Validate network data and storage identically, including publication-age limits. */
export function parseNewsSnapshot(value: unknown, now = new Date()): NewsSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const candidate = value as Partial<NewsSnapshot>;
    if (!Array.isArray(candidate.items) || typeof candidate.updatedAt !== 'string') return null;
    if (candidate.partial !== undefined && typeof candidate.partial !== 'boolean') return null;
    // A broken response is different from a valid feed with no recent articles.
    const validItems = candidate.items.every((item) => item && typeof item === 'object'
        && typeof item.source === 'string' && item.source.trim().length > 0
        && typeof item.title === 'string' && item.title.trim().length > 0
        && typeof item.url === 'string' && normalizeArticleUrl(item.url) !== ''
        && typeof item.publishedAt === 'string' && parseArticleDate(item.publishedAt) !== null
        && (item.kind === undefined || item.kind === 'official' || item.kind === 'news'));
    if (!validItems) return null;
    const updatedAt = Date.parse(candidate.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < 0 || updatedAt > now.getTime() + MAX_CLOCK_SKEW_MS) return null;
    return {
        items: filterAlertArticles(candidate.items, now).slice(0, NEWS_ITEM_LIMIT),
        updatedAt: new Date(updatedAt).toISOString(),
        partial: candidate.partial === true,
    };
}

export function readNewsSnapshot(raw: string | null, now = new Date()): NewsSnapshot | null {
    if (!raw) return null;
    try { return parseNewsSnapshot(JSON.parse(raw), now); } catch { return null; }
}

export function isNewsSnapshotFresh(snapshot: NewsSnapshot | null, now = new Date()): boolean {
    if (!snapshot) return false;
    const age = now.getTime() - Date.parse(snapshot.updatedAt);
    const ttl = snapshot.partial ? NEWS_PARTIAL_CACHE_TTL_MS : NEWS_CACHE_TTL_MS;
    return Number.isFinite(age) && age >= -MAX_CLOCK_SKEW_MS && age < ttl;
}

/** Retry failed/partial refreshes sooner without a focus/online-event request storm. */
export function shouldRefreshNews(snapshot: NewsSnapshot | null, lastAttemptAt: number, now = new Date()): boolean {
    return !isNewsSnapshotFresh(snapshot, now)
        && (lastAttemptAt === 0 || now.getTime() - lastAttemptAt >= NEWS_RETRY_DELAY_MS);
}

/** A partial outage must not erase still-recent articles already fetched for this context. */
export function mergeNewsSnapshot(previous: NewsSnapshot | null, incoming: NewsSnapshot, now = new Date()): NewsSnapshot {
    return {
        ...incoming,
        items: filterAlertArticles(incoming.partial ? [...incoming.items, ...(previous?.items ?? [])] : incoming.items, now).slice(0, NEWS_ITEM_LIMIT),
    };
}

type NewsRequestOptions = {
    signal: AbortSignal;
    fetcher?: (url: string, init: RequestInit) => Promise<Response>;
    timeoutMs?: number;
    now?: () => Date;
};

export async function requestNewsSnapshot(url: string, {
    signal, fetcher = fetch, timeoutMs = 15_000, now = () => new Date(),
}: NewsRequestOptions): Promise<NewsSnapshot> {
    const controller = new AbortController();
    const relayAbort = () => controller.abort(signal.reason);
    if (signal.aborted) relayAbort();
    else signal.addEventListener('abort', relayAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('News request timed out', 'TimeoutError')), timeoutMs);
    try {
        controller.signal.throwIfAborted();
        const response = await fetcher(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('News sources unavailable');
        const payload: unknown = await response.json();
        controller.signal.throwIfAborted();
        const snapshot = parseNewsSnapshot(payload, now());
        if (!snapshot) throw new Error('Invalid news response');
        return snapshot;
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', relayAbort);
    }
}
