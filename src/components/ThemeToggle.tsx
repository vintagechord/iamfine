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
        localStorage.setItem(THEME_KEY, nextMode);
        applyTheme(nextMode);
    };

    return (
        <button
            type="button"
            className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            onClick={toggleTheme}
            aria-label={mode === 'dark' ? '라이트 모드로 변경' : '다크 모드로 변경'}
        >
            <span suppressHydrationWarning>{mode === 'light' ? '다크 모드' : '라이트 모드'}</span>
        </button>
    );
}
