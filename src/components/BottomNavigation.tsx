'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Home, NotebookPen, UserRound, Utensils } from 'lucide-react';

const ITEMS = [
    { href: '/', label: '홈', icon: Home, key: 'home' },
    { href: '/diet', label: '식단', icon: Utensils, key: 'diet' },
    { href: '/diet?view=record#today-record-section', label: '기록', icon: NotebookPen, key: 'record' },
    { href: '/profile', label: '내 정보', icon: UserRound, key: 'profile' },
];

export default function BottomNavigation() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const active = pathname === '/'
        ? 'home'
        : pathname === '/profile'
            ? 'profile'
            : pathname === '/diet' && searchParams.get('view') === 'record'
                ? 'record'
                : pathname === '/diet' ? 'diet' : '';

    return (
        <nav className="bottomNavigation md:hidden" aria-label="주요 메뉴">
            {ITEMS.map(({ href, label, icon: Icon, key }) => (
                <Link key={key} href={href} aria-current={active === key ? 'page' : undefined}>
                    <Icon size={22} strokeWidth={active === key ? 2.3 : 1.8} aria-hidden="true" />
                    <span>{label}</span>
                </Link>
            ))}
        </nav>
    );
}
