import Link from 'next/link';
import type { MealSlot } from '@/lib/dietEngine';
import type { PersonalizedPortions } from '@/lib/personalizedPortions';
import styles from './PersonalizedPortionGuide.module.css';

const amount = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

export default function PersonalizedPortionGuide({ guide, slot }: { guide: PersonalizedPortions; slot: MealSlot }) {
    const meal = guide.meals[slot];
    const ready = guide.status === 'ready';

    return (
        <div className={styles.guide}>
            {ready ? (
                <>
                    <div className={styles.heading}>
                        <p>나에게 맞춘 식사량 예시</p>
                        <span>참고량</span>
                    </div>
                    <dl className={styles.foods}>
                        {meal.items.map((item) => (
                            <div key={item.name}>
                                <dt>{item.name}</dt>
                                <dd>약 {amount(Math.round(item.exampleGrams))} <span>g</span></dd>
                            </div>
                        ))}
                    </dl>
                    <p className={styles.note}>먹기 편한 양부터 드시고, 정해진 치료식이나 식사량이 있다면 그 안내를 따라 주세요.</p>
                </>
            ) : (
                <div className={styles.empty}>
                    <p>{guide.reason}</p>
                    {guide.status === 'needs_profile' && <Link href="/profile" className="uiButton uiButton--secondary uiButton--small">내 정보 입력</Link>}
                </div>
            )}
            <details className={styles.basis}>
                <summary>내 정보와 참고 기준</summary>
                {guide.profileSummary.length > 0 && <p className={styles.profile}>{guide.profileSummary.join(' · ')}</p>}
                {guide.dailyEnergyRange && (
                    <p className={styles.target}>하루 열량 참고 <strong>{amount(guide.dailyEnergyRange.min)}–{amount(guide.dailyEnergyRange.max)} kcal</strong></p>
                )}
                {guide.dailyProteinRange && (
                    <p className={styles.note}>하루 단백질은 {amount(guide.dailyProteinRange.min)} g보다 많게, 가능하면 {amount(guide.dailyProteinRange.max)} g까지를 참고해요.</p>
                )}
                {ready && (
                    <>
                        <p className={styles.note}>세 끼와 간식을 함께 고려한 예시예요. 영양 그래프는 위 분량으로 계산해요. 양을 조절할 때는 아래 범위를 참고하세요.</p>
                        <dl className={styles.ranges}>
                            {meal.items.filter((item) => item.adjusted).map((item) => (
                                <div key={item.name}>
                                    <dt>{item.name}</dt>
                                    <dd>{amount(item.minGrams)}–{amount(item.maxGrams)} g</dd>
                                </div>
                            ))}
                        </dl>
                    </>
                )}
                {guide.notes.map((note) => <p className={styles.note} key={note}>{note}</p>)}
                <div className={styles.sources}>
                    {guide.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a>)}
                </div>
                <Link href="/profile" className={styles.profileLink}>내 정보 확인·수정</Link>
            </details>
        </div>
    );
}
