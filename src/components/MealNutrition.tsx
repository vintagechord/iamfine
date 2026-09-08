import type { MealSuggestion } from '@/lib/dietEngine';
import { estimateMealNutrition } from '@/lib/mealNutrition';

function formatAmount(value: number) {
    return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

export default function MealNutrition({ meal, portionsByFood }: { meal: MealSuggestion; portionsByFood?: Readonly<Record<string, number>> }) {
    const nutrition = estimateMealNutrition(meal, portionsByFood);
    const { totals, items, missingFoods, energyShares } = nutrition;
    const hasPortionOverrides = items.some((item) => portionsByFood && Object.hasOwn(portionsByFood, item.name));

    if (nutrition.status === 'unavailable' || !totals) {
        return (
            <div className="mealNutrition mealNutrition--empty">
                <p className="mealNutritionEyebrow">예상 열량</p>
                <p className="mealNutritionEnergy">—</p>
                <p className="mealNutritionNote">이 식단에 맞는 영양 정보를 아직 확인하지 못했어요.</p>
                {missingFoods.length > 0 && <p className="mealNutritionNote">확인할 음식 · {missingFoods.join(' · ')}</p>}
            </div>
        );
    }

    const isPartial = nutrition.status === 'partial';
    const nutrients = [
        { key: 'carb', label: '탄수화물', grams: totals.carbG, share: energyShares.carb },
        { key: 'protein', label: '단백질', grams: totals.proteinG, share: energyShares.protein },
        { key: 'fat', label: '지방', grams: totals.fatG, share: energyShares.fat },
    ] as const;

    return (
        <div className="mealNutrition">
            <div className="mealNutritionTop">
                <div>
                    <p className="mealNutritionEyebrow">{isPartial ? '확인된 음식의 예상 열량' : '예상 열량'}</p>
                    <p className="mealNutritionEnergy"><span>약</span> {Math.round(totals.energyKcal).toLocaleString('ko-KR')} <span>kcal</span></p>
                </div>
                <span className="mealNutritionEstimate">{isPartial ? '일부 음식 제외' : '추정치'}</span>
            </div>
            {isPartial && <p className="mealNutritionCoverage">{items.length + missingFoods.length}개 중 {items.length}개 음식 기준</p>}
            <p className="mealNutritionNote">{hasPortionOverrides
                ? '식사량 참고의 예시 분량 기준이며, 실제 섭취량이나 처방량은 아니에요.'
                : '계산용 분량 기준이며, 실제 섭취량이나 개인 권장량이 아니에요.'}</p>

            <p className="mealNutritionChartLabel">{isPartial ? '확인된 음식의 열량 구성' : '열량 구성'}</p>
            <div className="mealNutritionBar" aria-hidden="true">
                {nutrients.map(({ key, share }) => <span key={key} data-nutrient={key} style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />)}
            </div>
            <dl className="mealNutritionValues">
                {nutrients.map(({ key, label, grams, share }) => (
                    <div key={key}>
                        <dt><span className="mealNutritionSwatch" data-nutrient={key} aria-hidden="true" />{label}</dt>
                        <dd><strong>{formatAmount(grams)} g</strong><span>열량 {formatAmount(share)}%</span></dd>
                    </div>
                ))}
            </dl>

            <details className="mealNutritionSources">
                <summary>계산 기준량 · 출처</summary>
                <p className="mealNutritionNote">대표 음식·재료와 예시 분량으로 계산했어요. 조리법 안내가 아니며, 피하는 재료와 실제 먹는 양에 따라 달라질 수 있어요. 비율은 탄수화물·단백질 1 g당 4 kcal, 지방 1 g당 9 kcal로 환산한 열량 기준이에요.</p>
                <ul>
                    {items.map((item) => (
                        <li key={item.name}>
                            <div className="mealNutritionSourceHeading"><span>{item.name}</span><span>{formatAmount(item.grams)} g</span></div>
                            <p>{item.ingredients}</p>
                            {item.sources.length > 0 && (
                                <details>
                                    <summary>성분 자료 {item.sources.length}개</summary>
                                    {item.sources.map((source) => (
                                        <p key={source.foodCode}>
                                            <a href={source.url} target="_blank" rel="noopener noreferrer">
                                                {source.description.replaceAll('_', ' · ')} <span aria-hidden="true">↗</span>
                                            </a>
                                            <span> · {source.name} · {source.foodCode}</span>
                                        </p>
                                    ))}
                                </details>
                            )}
                        </li>
                    ))}
                </ul>
                {missingFoods.length > 0 && <p className="mealNutritionMissing">계산에서 제외한 음식 · {missingFoods.join(' · ')}</p>}
            </details>
        </div>
    );
}
