'use client';

import { Clock3, Pill } from 'lucide-react';
import { useId } from 'react';
import styles from './MedicationChecklist.module.css';

export type MedicationChecklistItem = {
    id: string;
    name: string;
    timingLabel: string;
    taken: boolean;
    disabled?: boolean;
    pending?: boolean;
    scheduled?: boolean;
};

type MedicationChecklistProps = {
    medications: MedicationChecklistItem[];
    onTakenChange?: (id: string, taken: boolean) => void;
    notice?: string;
    error?: string;
};

export function MedicationProgress({ medications }: Pick<MedicationChecklistProps, 'medications'>) {
    if (medications.length === 0) return null;
    const takenCount = medications.filter((medication) => medication.taken).length;
    const scheduled = medications.every((medication) => medication.scheduled);
    const complete = !scheduled && takenCount === medications.length;

    return (
        <span className={styles.badge} data-complete={complete}>
            <Pill size={12} strokeWidth={1.8} aria-hidden="true" />
            <span aria-hidden="true">{scheduled ? '복약 예정' : `복약 ${takenCount}/${medications.length}`}</span>
            <span className={styles.srOnly}>
                {scheduled ? `복용 예정 약 ${medications.length}개` : `복약 체크 ${medications.length}개 중 ${takenCount}개 완료`}
            </span>
        </span>
    );
}

export default function MedicationChecklist({ medications, onTakenChange, notice, error }: MedicationChecklistProps) {
    const headingId = useId();
    const noticeId = useId();
    if (medications.length === 0) return null;
    const takenCount = medications.filter((medication) => medication.taken).length;
    const scheduled = medications.every((medication) => medication.scheduled);
    const hasPending = medications.some((medication) => medication.pending);

    return (
        <section className={styles.card} aria-labelledby={headingId}>
            <div className={styles.header}>
                <h3 id={headingId}><Pill size={18} strokeWidth={1.8} aria-hidden="true" />복약 체크</h3>
                <span className={styles.progress} role="status" aria-live="polite" aria-atomic="true">
                    {hasPending ? '저장 중' : scheduled ? `${medications.length}개 예정` : `${takenCount}/${medications.length} 완료`}
                </span>
            </div>
            <p id={noticeId} className={styles.notice}>
                {notice || (scheduled ? '복용 예정인 약이에요.' : '실제로 복용한 뒤 체크해 주세요.')}
            </p>
            <ul className={styles.list}>
                {medications.map((medication) => {
                    const disabled = medication.disabled || medication.pending || medication.scheduled || !onTakenChange;
                    return (
                        <li key={medication.id}>
                            <label className={styles.row} data-taken={medication.taken} data-disabled={disabled}>
                                <input
                                    type="checkbox"
                                    checked={medication.taken}
                                    disabled={disabled}
                                    aria-label={`${medication.name}, ${medication.timingLabel} 복용 체크`}
                                    aria-describedby={noticeId}
                                    onChange={(event) => onTakenChange?.(medication.id, event.currentTarget.checked)}
                                />
                                <span className={styles.details}>
                                    <span className={styles.timing}><Clock3 size={13} aria-hidden="true" />{medication.timingLabel}</span>
                                    <span className={styles.name}>{medication.name}</span>
                                </span>
                                <span className={styles.state}>
                                    {medication.pending ? '저장 중' : medication.scheduled ? '복용 예정' : medication.taken ? '완료' : '미완료'}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
            {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
    );
}
