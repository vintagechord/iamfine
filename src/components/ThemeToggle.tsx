'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'theme';

function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;

    if (mode === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

export default function ThemeToggle() {
    const [mode, setMode] = useState<ThemeMode>('light');

    useEffect(() => {
        let nextMode: ThemeMode = 'light';
        try {
            const storedTheme = localStorage.getItem(THEME_KEY);
            nextMode = storedTheme === 'dark' ? 'dark' : 'light';
        } catch {
            nextMode = 'light';
        }

        applyTheme(nextMode);
        const timer = window.setTimeout(() => {
            setMode(nextMode);
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    const toggleTheme = () => {
        const isDarkNow = document.documentElement.classList.contains('dark');
        const nextMode: ThemeMode = isDarkNow ? 'light' : 'dark';

        setMode(nextMode);
        try {
            localStorage.setItem(THEME_KEY, nextMode);
        } catch {
            // The current theme still works when browser storage is unavailable.
        }
        applyTheme(nextMode);
    };

    return (
        <button
            type="button"
            className="uiButton uiButton--secondary uiButton--small"
            onClick={toggleTheme}
            aria-label={mode === 'dark' ? '라이트 모드로 변경' : '다크 모드로 변경'}
            aria-pressed={mode === 'dark'}
        >
            <span suppressHydrationWarning>{mode === 'light' ? '어둡게 보기' : '밝게 보기'}</span>
        </button>
    );
}
