import { strict as assert } from 'node:assert';
import test from 'node:test';
import { formatVisitScheduleDday, getUpcomingVisit, mergeVisitScheduleLists, parseVisitScheduleCache, parseVisitScheduleList, readIamfineVisitSchedules, resolveVisitSchedules, type VisitScheduleItem } from './visitSchedules.ts';

const visit = (id: string, visitDate: string, visitTime = ''): VisitScheduleItem => ({
    id, visitDate, visitTime, hospitalName: '검수 병원', treatmentNote: '정기 진료', preparationNote: '', createdAt: '2026-09-01T00:00:00Z',
});

test('next visit selects the nearest future appointment in Korean time without mutating the list', () => {
    const items = [visit('later', '2026-09-08', '09:00'), visit('past', '2026-09-07', '12:00'), visit('next', '2026-09-07', '15:00')];
    const before = structuredClone(items);
    assert.equal(getUpcomingVisit(items, new Date('2026-09-07T04:00:00Z'))?.id, 'next');
    assert.deepEqual(items, before);
});

test('today without a time stays visible until the day ends; invalid and past visits are excluded', () => {
    const items = [visit('invalid-day', '2026-02-30', '15:00'), visit('invalid-time', '2026-09-09', '25:30'), visit('today', '2026-09-07')];
    assert.equal(getUpcomingVisit(items, new Date('2026-09-07T14:59:58Z'))?.id, 'today');
    assert.equal(getUpcomingVisit(items, new Date('2026-09-07T15:00:00Z')), null);
    assert.equal(getUpcomingVisit([], new Date('2026-09-07')), null);
});

test('D-day switches at midnight in Korea and supports month boundaries', () => {
    assert.equal(formatVisitScheduleDday('2026-10-01', new Date('2026-09-30T14:59:00Z')), 'D-1');
    assert.equal(formatVisitScheduleDday('2026-10-01', new Date('2026-09-30T15:00:00Z')), '오늘');
    assert.equal(formatVisitScheduleDday('2026-02-30'), '');
});

test('metadata and local legacy appointments keep compatible names and deduplicate by newest version', () => {
    const old = visit('same', '2026-09-08', '09:00');
    const updated = { ...old, hospitalName: '변경 병원', createdAt: '2026-09-02T00:00:00Z' };
    const metadata = readIamfineVisitSchedules({ iamfine: { visitSchedules: [old] } });
    const local = parseVisitScheduleList(JSON.stringify([updated, { date: '2026-09-10', time: '10:00', hospital: '검수 병원', note: '외래' }]));
    const merged = mergeVisitScheduleLists(metadata, local);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].hospitalName, '변경 병원');
    assert.equal(merged[1].treatmentNote, '외래');
    assert.deepEqual(parseVisitScheduleList('broken'), []);
    assert.deepEqual(readIamfineVisitSchedules(null), []);
});

test('saved account appointments prevent stale local edits and deletions from reappearing', () => {
    const stale = visit('same', '2026-09-08', '09:00');
    const updated = { ...stale, visitTime: '14:00', hospitalName: '변경 병원' };
    assert.deepEqual(resolveVisitSchedules({ iamfine: { visitSchedules: [] } }, [stale]), []);
    assert.deepEqual(resolveVisitSchedules({ iamfine: { visitSchedules: [updated] } }, [stale]), [updated]);
    assert.deepEqual(resolveVisitSchedules({ iamfine: {} }, [stale]), [stale]);
    assert.deepEqual(resolveVisitSchedules(null, [stale]), [stale]);
});

test('offline session snapshots preserve confirmed device edits and deletions until a fresh server read', () => {
    const old = visit('same', '2026-09-08', '09:00');
    const updated = { ...old, visitTime: '14:00', hospitalName: '변경 병원' };
    const oldMetadata = { iamfine: { visitSchedules: [old] } };
    const editedCache = parseVisitScheduleCache(JSON.stringify([updated]));
    const deletedCache = parseVisitScheduleCache('[]');
    assert.deepEqual(resolveVisitSchedules(oldMetadata, editedCache, 'session'), [updated]);
    assert.deepEqual(resolveVisitSchedules(oldMetadata, deletedCache, 'session'), []);
    assert.deepEqual(resolveVisitSchedules(oldMetadata, editedCache, 'server'), [old]);
    for (const raw of [null, 'broken', '{}', 'null']) {
        const unavailableCache = parseVisitScheduleCache(raw);
        assert.equal(unavailableCache, null);
        assert.deepEqual(resolveVisitSchedules(oldMetadata, unavailableCache, 'session'), [old]);
    }
});
