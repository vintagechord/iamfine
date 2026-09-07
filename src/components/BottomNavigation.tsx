'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Ellipsis, NotebookPen, Utensils } from 'lucide-react';

const ITEMS = [
    { href: '/diet', label: '식단 제안', icon: Utensils, key: 'diet' },
    { href: '/diet?view=record#today-record-section', label: '식단 관리', icon: NotebookPen, key: 'record' },
    { href: '/more', label: '더보기', icon: Ellipsis, key: 'more' },
];

export default function BottomNavigation({ placement = 'mobile' }: { placement?: 'mobile' | 'desktop' }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const active = (pathname === '/diet' && searchParams.get('view') === 'record') || pathname.startsWith('/diet/')
        ? 'record'
        : pathname === '/' || pathname === '/diet' ? 'diet' : pathname === '/auth' ? '' : 'more';

    return (
        <nav className={placement === 'desktop' ? 'desktopNavigation' : 'bottomNavigation'} aria-label="주요 메뉴">
            {ITEMS.map(({ href, label, icon: Icon, key }) => (
                <Link key={key} href={href} aria-current={active === key ? 'page' : undefined}>
                    <Icon size={placement === 'desktop' ? 18 : 22} strokeWidth={active === key ? 2 : 1.7} aria-hidden="true" />
                    <span>{label}</span>
                </Link>
            ))}
        </nav>
    );
}
