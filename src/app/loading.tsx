export default function GlobalLoading() {
    return (
        <div className="space-y-4" role="status" aria-busy="true">
            <section className="uiCard p-6">
                <h1 className="text-lg font-semibold">불러오는 중…</h1>
                <div className="mt-4 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--ui-surface-muted)]" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--ui-surface-muted)]" />
                </div>
            </section>
        </div>
    );
}
