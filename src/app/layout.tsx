import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import AuthActionButton from '@/components/AuthActionButton';
import MobileCategoryMenu from '@/components/MobileCategoryMenu';
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
    { href: '/diet', label: '오늘 식단' },
    { href: '/diet?view=record#today-record-section', label: '오늘 기록' },
    { href: '/shopping', label: '장보기' },
    { href: '/restaurants', label: '건강식당' },
];

const themeInitScript = `(() => {
  try {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (_error) {
    document.documentElement.classList.remove('dark');
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
                <div className="min-h-screen">
                    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/96">
                        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4">
                            <Link
                                href="/"
                                className="inline-flex items-center gap-2 no-underline"
                            >
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-black text-white shadow-sm">
                                    I
                                </span>
                                <span className="text-base font-black tracking-tight text-gray-900 dark:text-gray-100">
                                    Iam<span className="text-emerald-500 dark:text-emerald-400">Fine</span>
                                </span>
                            </Link>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <AuthActionButton showSignUpWhenLoggedOut showProfileWhenLoggedIn />
                                <div className="hidden md:block">
                                    <ThemeToggle />
                                </div>
                                <MobileCategoryMenu items={CATEGORY_LINKS} />
                            </div>
                        </div>
                        <nav className="hidden border-t border-gray-200/70 px-4 dark:border-gray-800/70 md:block">
                            <div className="mx-auto w-full max-w-4xl">
                                <div className="flex overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    <div className="inline-flex gap-2 pl-2 lg:pl-3">
                                    {CATEGORY_LINKS.map((item) => (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className="whitespace-nowrap rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-[0_6px_14px_rgba(16,185,129,0.18)] active:translate-y-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200 dark:hover:shadow-[0_8px_18px_rgba(16,185,129,0.22)] sm:text-sm"
                                        >
                                            {item.label}
                                        </Link>
                                    ))}
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
