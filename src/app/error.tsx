'use client';

type GlobalErrorProps = {
    error: Error & { digest?: string };
    reset: () => void;
};

export default function GlobalError({ reset }: GlobalErrorProps) {
    return (
        <main className="space-y-4">
            <section
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
                <h1 className="text-lg font-semibold">문제가 생겼어요.</h1>
                <p className="mt-2 text-sm">새로고침하거나 다시 시도해 주세요.</p>
                <button
                    type="button"
                    onClick={reset}
                    className="uiButton uiButton--secondary mt-4"
                >
                    다시 시도
                </button>
            </section>
        </main>
    );
}
