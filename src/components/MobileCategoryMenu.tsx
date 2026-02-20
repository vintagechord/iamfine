'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ThemeToggle from '@/components/ThemeToggle';

type CategoryItem = {
    href: string;
    label: string;
};

type MobileCategoryMenuProps = {
    items: CategoryItem[];
};

export default function MobileCategoryMenu({ items }: MobileCategoryMenuProps) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const previousPathnameRef = useRef(pathname);
    const portalRoot = typeof window === 'undefined' ? null : document.body;

    const openMenu = () => {
        setMounted(true);
        window.requestAnimationFrame(() => {
            setOpen(true);
        });
    };

    const closeMenu = () => {
        setOpen(false);
    };

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenu();
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleEscape);
        };
    }, [mounted]);

    useEffect(() => {
        if (!mounted || open) {
            return;
        }

        const timer = window.setTimeout(() => {
            setMounted(false);
        }, 280);

        return () => window.clearTimeout(timer);
    }, [mounted, open]);

    useEffect(() => {
        const previousPathname = previousPathnameRef.current;
        previousPathnameRef.current = pathname;

        if (!mounted || previousPathname === pathname) {
            return;
        }

        const timer = window.setTimeout(() => {
            closeMenu();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [pathname, mounted]);

    return (
        <>
            <button
                type="button"
                onClick={openMenu}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 md:hidden"
                aria-label="카테고리 메뉴 열기"
            >
                <Menu className="h-4.5 w-4.5" />
            </button>

            {mounted && portalRoot && createPortal(
                <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="카테고리 메뉴">
                    <button
                        type="button"
                        onClick={closeMenu}
                        className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ease-out ${
                            open ? 'opacity-100' : 'opacity-0'
                        }`}
                        aria-label="카테고리 메뉴 닫기"
                    />
                    <aside
                        className={`absolute right-0 top-0 h-full w-72 max-w-[86vw] border-l border-gray-200 bg-white p-4 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-gray-800 dark:bg-gray-950 ${
                            open ? 'translate-x-0' : 'translate-x-full'
                        }`}
                    >
                        <nav className="grid gap-2 pt-1">
                            {items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={closeMenu}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200"
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </nav>
                        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
                            <ThemeToggle />
                        </div>
                    </aside>
                </div>,
                portalRoot
            )}
        </>
    );
}
