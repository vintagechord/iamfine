import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { MapPinned, NotebookPen, ShoppingCart, Utensils } from 'lucide-react';
import AuthActionButton from '@/components/AuthActionButton';
import MobileCategoryMenu from '@/components/MobileCategoryMenu';
import TextSizeToggle from '@/components/TextSizeToggle';
import ThemeToggle from '@/components/ThemeToggle';
import './globals.css';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: '암 치료 식단 기록',
    description: '치료 단계와 식단을 기록하는 도구',
};

const CATEGORY_LINKS = [
    { href: '/diet', label: '오늘 식단', icon: Utensils },
    { href: '/diet?view=record#today-record-section', label: '오늘 기록', icon: NotebookPen },
    { href: '/shopping', label: '장보기', icon: ShoppingCart },
    { href: '/restaurants', label: '건강식당', icon: MapPinned },
];
const MOBILE_CATEGORY_LINKS = CATEGORY_LINKS.map(({ href, label }) => ({ href, label }));

const TEXT_SCALE_KEY = 'iamfine:text-scale:v1';

const themeInitScript = `(() => {
  try {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const storedTextScale = localStorage.getItem('${TEXT_SCALE_KEY}');
    if (storedTextScale === 'large') {
      document.documentElement.classList.add('ui-text-large');
    } else {
      document.documentElement.classList.remove('ui-text-large');
    }
  } catch (_error) {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('ui-text-large');
  }
})();`;

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100`}
            >
                <div className="appShell min-h-screen">
                    <header className="appHeader sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/96">
                        <div className="mx-auto flex min-h-14 w-full max-w-4xl items-center justify-between px-4 py-2">
                            <Link
                                href="/"
                                className="inline-flex shrink-0 items-center gap-2 no-underline"
                            >
                                <span className="brandMark inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white shadow-sm">
                                    I
                                </span>
                                <span className="hidden min-[360px]:inline">
                                    <span className="block text-base font-black leading-none text-gray-900 dark:text-gray-100">
                                        Iam<span className="text-emerald-600 dark:text-emerald-300">Fine</span>
                                    </span>
                                    <span className="hidden text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400 sm:block">
                                        Care meal
                                    </span>
                                </span>
                            </Link>
                            <div className="min-w-0 flex flex-1 items-center justify-end">
                                <div className="galaxySafeActions max-w-full pl-2">
                                    <TextSizeToggle />
                                    <AuthActionButton showSignUpWhenLoggedOut showProfileWhenLoggedIn />
                                    <div className="hidden md:block">
                                        <ThemeToggle />
                                    </div>
                                    <MobileCategoryMenu items={MOBILE_CATEGORY_LINKS} />
                                </div>
                            </div>
                        </div>
                        <nav className="hidden border-t border-gray-200/70 px-4 dark:border-gray-800/70 md:block">
                            <div className="mx-auto w-full max-w-4xl">
                                <div className="flex overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="inline-flex gap-2 pl-2 lg:pl-3">
                                    {CATEGORY_LINKS.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="navPill whitespace-nowrap rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-[0_6px_14px_rgba(16,185,129,0.18)] active:translate-y-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200 dark:hover:shadow-[0_8px_18px_rgba(16,185,129,0.22)] sm:text-sm"
                                        >
                                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                            {item.label}
                                        </Link>
                                    );
                                    })}
                                    </div>
                                </div>
                            </div>
                        </nav>
                    </header>

                    <main className="mx-auto w-full max-w-4xl px-4 py-5">{children}</main>
                </div>
            </body>
        </html>
    );
}
