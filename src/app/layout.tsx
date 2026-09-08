import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { Leaf, UserRound } from 'lucide-react';
import BottomNavigation from '@/components/BottomNavigation';
import TextSizeToggle from '@/components/TextSizeToggle';
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
    title: 'IamFine · 나를 위한 식사',
    description: '내 치료 상태에 맞는 식단, 간편한 식사 기록과 새로운 건강 정보',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: '#f5f3ed',
};

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
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <div className="appShell min-h-screen">
                    <a href="#main-content" className="skipLink">본문으로 이동</a>
                    <header className="appHeader">
                        <div className="appHeaderInner">
                            <Link
                                href="/diet"
                                aria-label="IamFine 식단 제안"
                                className="appBrand"
                            >
                                <span className="brandMark">
                                    <Leaf size={23} strokeWidth={1.8} aria-hidden="true" />
                                </span>
                                <span>IamFine</span>
                            </Link>
                            <Suspense fallback={null}><BottomNavigation placement="desktop" /></Suspense>
                            <div className="appHeaderActions">
                                <TextSizeToggle />
                                <Link href="/profile" className="uiIconButton" aria-label="내 정보">
                                    <UserRound size={21} strokeWidth={1.7} aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </header>

                    <main id="main-content" tabIndex={-1} className="appMain">{children}</main>
                    <Suspense fallback={null}><BottomNavigation /></Suspense>
                </div>
            </body>
        </html>
    );
}
