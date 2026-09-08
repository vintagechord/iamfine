/** Serialize full-day writes so an older automatic save cannot finish last. */
export function createSerialLogSaveQueue() {
    let pending: Promise<void> = Promise.resolve();
    return {
        enqueue<T>(task: () => Promise<T>): Promise<T> {
            const result = pending.then(task);
            pending = result.then(() => undefined, () => undefined);
            return result;
        },
    };
}

export function isEditableMedicationDate(dateKey: string, todayKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || dateKey > todayKey) return false;
    const parsed = new Date(`${dateKey}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
}

/** Apply an explicit checkbox value; retries must not invert the saved value. */
export function withMedicationTaken<T extends { medicationTakenIds?: string[] }>(log: T, medicationId: string, taken: boolean): T {
    const ids = new Set(log.medicationTakenIds ?? []);
    if (taken) ids.add(medicationId);
    else ids.delete(medicationId);
    return { ...log, medicationTakenIds: [...ids] };
}
