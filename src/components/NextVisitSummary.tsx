'use client';

import Link from 'next/link';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getAuthSessionUser, hasSupabaseEnv, supabase } from '@/lib/supabaseClient';
import { formatVisitScheduleDate, formatVisitScheduleDday, formatVisitScheduleTime, getUpcomingVisit, getVisitScheduleKey, hasSavedVisitSchedules, parseVisitScheduleCache, resolveVisitSchedules, type VisitScheduleItem } from '@/lib/visitSchedules';

export default function NextVisitSummary() {
    const [visits, setVisits] = useState<VisitScheduleItem[]>([]);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let disposed = false;
        let requestId = 0;
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;

        const refresh = async () => {
            const currentRequest = ++requestId;
            try {
                const result = hasSupabaseEnv && supabase ? await getAuthSessionUser() : { user: null, error: null, metadataSource: 'server' as const };
                if (disposed || currentRequest !== requestId) return;
                const missingSession = result.error?.name === 'AuthSessionMissingError'
                    || /auth session missing/i.test(result.error?.message ?? '');
                if (result.error && !missingSession) throw result.error;
                let local: VisitScheduleItem[] | null = null;
                let localUnavailable = false;
                try {
                    local = parseVisitScheduleCache(localStorage.getItem(getVisitScheduleKey(result.user?.id ?? null)));
                } catch {
                    localUnavailable = true;
                }
                const resolved = resolveVisitSchedules(result.user?.user_metadata, local, result.metadataSource);
                setVisits(resolved);
                if (result.user && result.metadataSource === 'server' && hasSavedVisitSchedules(result.user.user_metadata)) {
                    try {
                        localStorage.setItem(getVisitScheduleKey(result.user.id), JSON.stringify(resolved));
                    } catch {
                        // A fresh server result remains usable without a device cache.
                    }
                }
                setFailed(localUnavailable && !result.user);
                setNow(new Date());
            } catch {
                if (disposed || currentRequest !== requestId) return;
                setVisits([]);
                setFailed(true);
            } finally {
                if (!disposed && currentRequest === requestId) setReady(true);
            }
        };
        const queueRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => { void refresh(); }, 0);
        };
        const onStorage = (event: StorageEvent) => {
            if (event.key === null || event.key.startsWith('visit-schedule-v1:')) queueRefresh();
        };

        void refresh();
        const subscription = supabase?.auth.onAuthStateChange((event) => {
            // Clear the old account's summary before any asynchronous session lookup.
            if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
                requestId += 1;
                setVisits([]);
                setReady(false);
            }
            if (event !== 'INITIAL_SESSION') queueRefresh();
        }).data.subscription;
        const clock = setInterval(() => setNow(new Date()), 60_000);
        window.addEventListener('focus', queueRefresh);
        window.addEventListener('storage', onStorage);
        window.addEventListener('iamfine:visits-changed', queueRefresh);
        return () => {
            disposed = true;
            requestId += 1;
            if (refreshTimer) clearTimeout(refreshTimer);
            clearInterval(clock);
            subscription?.unsubscribe();
            window.removeEventListener('focus', queueRefresh);
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('iamfine:visits-changed', queueRefresh);
        };
    }, []);

    const upcoming = getUpcomingVisit(visits, now);
    return (
        <Link href="/more#visit-schedules" className="nextVisitSummary" aria-label="다음 병원 진료 일정 확인 및 관리">
            <span className="nextVisitSummary__label"><CalendarClock size={16} aria-hidden="true" /> 다음 병원 진료</span>
            {!ready ? <span className="nextVisitSummary__empty" role="status">일정 확인 중…</span> : upcoming ? (
                <>
                    <span className="nextVisitSummary__date">{formatVisitScheduleDate(upcoming.visitDate)} <span className="nextVisitSummary__dday">{formatVisitScheduleDday(upcoming.visitDate, now)}</span></span>
                    <span className="nextVisitSummary__time">{formatVisitScheduleTime(upcoming.visitTime)}</span>
                    <span className="nextVisitSummary__hospital">{upcoming.hospitalName || '예정된 진료'}</span>
                </>
            ) : (
                <span className="nextVisitSummary__empty">{failed ? '일정 확인하기' : '일정 등록하기'} <ChevronRight size={14} aria-hidden="true" /></span>
            )}
        </Link>
    );
}
