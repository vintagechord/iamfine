export default function GlobalLoading() {
    return (
        <main className="space-y-4">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">불러오는 중…</h1>
                <div className="mt-4 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
                </div>
            </section>
        </main>
    );
}
