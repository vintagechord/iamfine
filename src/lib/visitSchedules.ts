export type VisitScheduleItem = {
    id: string;
    visitDate: string;
    visitTime: string;
    hospitalName: string;
    treatmentNote: string;
    preparationNote: string;
    createdAt: string;
};

const VISIT_SCHEDULE_PREFIX = 'visit-schedule-v1';
const USER_METADATA_NAMESPACE = 'iamfine';

export function getVisitScheduleKey(userId: string | null) {
    return `${VISIT_SCHEDULE_PREFIX}:${userId ?? 'guest'}`;
}

export function normalizeVisitScheduleList(items: VisitScheduleItem[]) {
    return [...items]
        .map((item) => ({
            ...item,
            hospitalName: item.hospitalName?.trim() ?? '',
        }))
        .sort((a, b) => {
            const aKey = `${a.visitDate} ${a.visitTime}`;
            const bKey = `${b.visitDate} ${b.visitTime}`;
            return aKey.localeCompare(bKey);
        });
}

function visitScheduleTimestamp(raw: string) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeVisitScheduleLists(...lists: VisitScheduleItem[][]) {
    const byId = new Map<string, VisitScheduleItem>();

    lists.forEach((list) => {
        list.forEach((item) => {
            const current = byId.get(item.id);
            if (!current) {
                byId.set(item.id, item);
                return;
            }

            if (visitScheduleTimestamp(item.createdAt) >= visitScheduleTimestamp(current.createdAt)) {
                byId.set(item.id, item);
            }
        });
    });

    return normalizeVisitScheduleList(Array.from(byId.values()));
}

export function areVisitScheduleListsSame(left: VisitScheduleItem[], right: VisitScheduleItem[]) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((item, index) => {
        const compare = right[index];
        return (
            item.id === compare.id &&
            item.visitDate === compare.visitDate &&
            item.visitTime === compare.visitTime &&
            item.hospitalName === compare.hospitalName &&
            item.treatmentNote === compare.treatmentNote &&
            item.preparationNote === compare.preparationNote &&
            item.createdAt === compare.createdAt
        );
    });
}

export function parseVisitScheduleListFromUnknown(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as VisitScheduleItem[];
    }

    const readString = (record: Record<string, unknown>, keys: string[]) => {
        for (const key of keys) {
            const value = record[key];
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed) {
                    return trimmed;
                }
            }
        }
        return '';
    };

    const parsed = raw
        .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                return null;
            }

            const candidate = item as Record<string, unknown>;
            const visitDate = readString(candidate, ['visitDate', 'date', 'appointmentDate']);
            if (!visitDate) {
                return null;
            }

            const visitTime = readString(candidate, ['visitTime', 'time', 'appointmentTime']);
            const treatmentNote = readString(candidate, ['treatmentNote', 'treatment', 'note']);
            if (!treatmentNote) {
                return null;
            }

            const hospitalName = readString(candidate, ['hospitalName', 'hospital']);
            const preparationNote = readString(candidate, ['preparationNote', 'preparation']);
            const createdAtRaw = readString(candidate, ['createdAt', 'updatedAt', 'timestamp']);
            const createdAt =
                createdAtRaw && Number.isFinite(Date.parse(createdAtRaw))
                    ? createdAtRaw
                    : `${visitDate}T${visitTime || '00:00'}:00`;
            const idRaw = readString(candidate, ['id', 'visitId']);
            const fallbackIdBase = `${visitDate}-${visitTime || 'na'}-${treatmentNote}`
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, '-');
            const id = idRaw || `visit-legacy-${index}-${fallbackIdBase}`;

            return {
                id,
                visitDate,
                visitTime,
                hospitalName,
                treatmentNote,
                preparationNote,
                createdAt,
            } satisfies VisitScheduleItem;
        })
        .filter((item): item is VisitScheduleItem => item !== null);

    return normalizeVisitScheduleList(parsed);
}

export function parseVisitScheduleList(raw: string | null) {
    if (!raw) {
        return [] as VisitScheduleItem[];
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        return parseVisitScheduleListFromUnknown(parsed);
    } catch {
        return [] as VisitScheduleItem[];
    }
}

export function readIamfineVisitSchedules(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return [] as VisitScheduleItem[];
    }

    const root = raw as Record<string, unknown>;
    const namespaced = root[USER_METADATA_NAMESPACE];
    if (!namespaced || typeof namespaced !== 'object' || Array.isArray(namespaced)) {
        return [] as VisitScheduleItem[];
    }

    const scoped = namespaced as Record<string, unknown>;
    return parseVisitScheduleListFromUnknown(scoped.visitSchedules);
}

export function hasSavedVisitSchedules(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const scoped = (raw as Record<string, unknown>).iamfine;
    return Boolean(scoped && typeof scoped === 'object' && !Array.isArray(scoped)
        && Array.isArray((scoped as Record<string, unknown>).visitSchedules));
}

/** A saved account list, including an empty list, wins over stale device caches. */
export function resolveVisitSchedules(metadata: unknown, local: VisitScheduleItem[]): VisitScheduleItem[] {
    return hasSavedVisitSchedules(metadata) ? readIamfineVisitSchedules(metadata) : normalizeVisitScheduleList(local);
}

export function formatVisitScheduleDate(rawDate: string) {
    if (!rawDate) {
        return '날짜 미정';
    }

    const [year, month, day] = rawDate.split('-').map(Number);
    if (!year || !month || !day) {
        return rawDate;
    }

    const date = new Date(year, month - 1, day);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${weekday})`;
}

export function formatVisitScheduleTime(rawTime: string) {
    if (!rawTime) {
        return '시간 미정';
    }

    const [hour, minute] = rawTime.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return rawTime;
    }

    const period = hour >= 12 ? '오후' : '오전';
    const normalizedHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${period} ${normalizedHour}:${String(minute).padStart(2, '0')}`;
}

function visitDayTimestamp(dateKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const timestamp = Date.parse(`${dateKey}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === dateKey ? timestamp : null;
}

function koreaDateKey(now: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

export function formatVisitScheduleDday(rawDate: string, now = new Date()) {
    const target = visitDayTimestamp(rawDate);
    const today = visitDayTimestamp(koreaDateKey(now));
    if (target === null || today === null) return '';
    const days = Math.round((target - today) / 86400000);
    return days > 0 ? `D-${days}` : days === 0 ? '오늘' : `D+${Math.abs(days)}`;
}

/** Hospital appointments are shown in Korean time, including undated-time visits for the whole day. */
export function getUpcomingVisit(items: readonly VisitScheduleItem[], now = new Date()): VisitScheduleItem | null {
    const candidates = items.flatMap((item) => {
        if (visitDayTimestamp(item.visitDate) === null) return [];
        if (item.visitTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.visitTime)) return [];
        const time = item.visitTime ? `${item.visitTime}:00` : '23:59:59';
        const timestamp = Date.parse(`${item.visitDate}T${time}+09:00`);
        return timestamp >= now.getTime() ? [{ item, timestamp }] : [];
    });
    candidates.sort((a, b) => a.timestamp - b.timestamp || a.item.id.localeCompare(b.item.id));
    return candidates[0]?.item ?? null;
}
