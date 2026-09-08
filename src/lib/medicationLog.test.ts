import assert from 'node:assert/strict';
import test from 'node:test';

const { createSerialLogSaveQueue, isEditableMedicationDate, withMedicationTaken } = await import(new URL('./medicationLog.ts', import.meta.url).href) as typeof import('./medicationLog');

test('medication dates accept yesterday and today but reject future and invalid dates', () => {
    assert.equal(isEditableMedicationDate('2026-09-08', '2026-09-09'), true);
    assert.equal(isEditableMedicationDate('2026-09-09', '2026-09-09'), true);
    assert.equal(isEditableMedicationDate('2026-09-10', '2026-09-09'), false);
    assert.equal(isEditableMedicationDate('2026-02-30', '2026-09-09'), false);
    assert.equal(isEditableMedicationDate('2026-9-9', '2026-09-09'), false);
});

test('explicit medication values are idempotent, preserve other meals and distinguish same-name schedules', () => {
    const log = { meals: { breakfast: ['기록한 음식'] }, memo: '메모', medicationTakenIds: ['same-drug-evening'] };
    const checked = withMedicationTaken(log, 'same-drug-morning', true);
    assert.deepEqual(checked.medicationTakenIds, ['same-drug-evening', 'same-drug-morning']);
    assert.deepEqual(withMedicationTaken(checked, 'same-drug-morning', true), checked);
    const unchecked = withMedicationTaken(checked, 'same-drug-morning', false);
    assert.deepEqual(unchecked, log);
    assert.equal(checked.meals, log.meals);
    assert.deepEqual(log.medicationTakenIds, ['same-drug-evening']);
});

test('automatic, medication and manual saves run in order and read the latest state when their turn starts', async () => {
    const queue = createSerialLogSaveQueue();
    const order: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let latest = 'old';
    const automatic = queue.enqueue(async () => { order.push('auto-start'); await gate; order.push('auto-end'); });
    const medication = queue.enqueue(async () => { order.push(`med-${latest}`); latest = 'checked'; });
    const manual = queue.enqueue(async () => { order.push(`manual-${latest}`); });
    await Promise.resolve();
    assert.deepEqual(order, ['auto-start']);
    latest = 'new';
    release();
    await Promise.all([automatic, medication, manual]);
    assert.deepEqual(order, ['auto-start', 'auto-end', 'med-new', 'manual-checked']);
});

test('a failed save does not block a retry or let a queued stale-account task write', async () => {
    const queue = createSerialLogSaveQueue();
    let account = 'a';
    let writes = 0;
    const failure = queue.enqueue(async () => { throw new Error('offline'); });
    const oldAccount = queue.enqueue(async () => { if (account === 'a') writes += 1; });
    account = 'b';
    await assert.rejects(failure, /offline/);
    await oldAccount;
    await queue.enqueue(async () => { if (account === 'b') writes += 1; });
    assert.equal(writes, 1);
});
