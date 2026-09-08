'use client';

import { BookOpen } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { getDailyVerse, millisecondsUntilNextSeoulDay } from '@/lib/dailyVerse';

function getSnapshot() {
    return getDailyVerse(new Date());
}

function getServerSnapshot() {
    return null;
}

function subscribeToDayChange(onDayChange: () => void) {
    const schedule = () => window.setTimeout(refresh, millisecondsUntilNextSeoulDay(new Date()) + 25);
    let timer = schedule();

    function refresh() {
        onDayChange();
        window.clearTimeout(timer);
        timer = schedule();
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') refresh();
    }

    // Background tabs can suspend timers; returning to the app also checks today.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', refresh);

    return () => {
        window.clearTimeout(timer);
        window.removeEventListener('focus', refresh);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pageshow', refresh);
    };
}

export default function DailyVerse() {
    // The same neutral server snapshot is used during hydration. The client then
    // selects today's verse, including when a cached page is opened on a new day.
    const verse = useSyncExternalStore(subscribeToDayChange, getSnapshot, getServerSnapshot);

    return (
        <div className="dailyVerse">
            <p className="dailyVerseLabel"><BookOpen size={16} aria-hidden="true" /> 오늘의 말씀</p>
            <p className="dailyVerseText">{verse?.text ?? '마음을 위한 오늘의 말씀'}</p>
            <p className="dailyVerseMeta">
                {verse && (
                    <a
                        className="dailyVerseReference"
                        href={verse.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${verse.reference} 본문 확인 (영문, 새 창)`}
                    >
                        {verse.reference}
                    </a>
                )}
                <span className="dailyVerseNote">쉬운 말로 풀어 쓴 말씀</span>
            </p>
        </div>
    );
}
