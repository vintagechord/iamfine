'use client';

import { Moon, Sun, Sunrise, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { mealTypeLabel, type DayPlan, type MealSlot } from '@/lib/dietEngine';
import MealNutrition from '@/components/MealNutrition';
import MedicationChecklist, { MedicationProgress, type MedicationChecklistItem } from '@/components/MedicationChecklist';

type RecommendedMealsProps = {
    plan: DayPlan;
    dateLabel: string;
    medicationsBySlot: Partial<Record<MealSlot, MedicationChecklistItem[]>>;
    onMedicationTakenChange?: (id: string, taken: boolean) => void;
    medicationNotice?: string;
    medicationError?: string;
    renderPortions: (slot: MealSlot) => ReactNode;
    renderNutrition?: (slot: MealSlot) => ReactNode;
};

const MEALS = [
    { slot: 'breakfast', Icon: Sunrise },
    { slot: 'lunch', Icon: Sun },
    { slot: 'dinner', Icon: Moon },
] as const;

function isOutsideDialog(dialog: HTMLDialogElement, clientX: number, clientY: number) {
    const bounds = dialog.getBoundingClientRect();
    return clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom;
}

export default function RecommendedMeals({ plan, dateLabel, medicationsBySlot, onMedicationTakenChange, medicationNotice, medicationError, renderPortions, renderNutrition }: RecommendedMealsProps) {
    const [selectedSlot, setSelectedSlot] = useState<(typeof MEALS)[number]['slot']>('breakfast');
    const [isOpen, setIsOpen] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const openerRef = useRef<HTMLButtonElement | null>(null);
    const pointerStartedOnBackdropRef = useRef(false);
    const dialogId = useId();
    const titleId = useId();
    const meal = plan[selectedSlot];
    const medications = medicationsBySlot[selectedSlot] ?? [];
    const recipeSteps = Array.from(new Set(meal.recipeSteps.map((step) => step.trim()).filter(Boolean)));
    const seenFoods = new Set([meal.main.trim()]);
    const menu = [
        { label: '밥', foods: [meal.riceType] },
        { label: '국', foods: [meal.soup] },
        { label: '반찬', foods: meal.sides },
    ].map(({ label, foods }) => ({
        label,
        foods: foods.map((food) => food.trim()).filter((food) => {
            if (!food || seenFoods.has(food)) return false;
            seenFoods.add(food);
            return true;
        }),
    })).filter(({ foods }) => foods.length > 0);

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const bodyStyle = document.body.style;
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const previousStyles = (['position', 'top', 'left', 'right', 'width', 'overflow'] as const).map((property) => ({
            property,
            value: bodyStyle.getPropertyValue(property),
            priority: bodyStyle.getPropertyPriority(property),
        }));
        const opener = openerRef.current;
        pointerStartedOnBackdropRef.current = false;
        bodyStyle.position = 'fixed';
        bodyStyle.top = `${-scrollY}px`;
        bodyStyle.left = `${-scrollX}px`;
        bodyStyle.right = '0';
        bodyStyle.width = '100%';
        bodyStyle.overflow = 'hidden';
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
            pointerStartedOnBackdropRef.current = false;
            previousStyles.forEach(({ property, value, priority }) => {
                if (value) bodyStyle.setProperty(property, value, priority);
                else bodyStyle.removeProperty(property);
            });
            opener?.focus({ preventScroll: true });
            window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
        };
    }, [isOpen]);

    const openMeal = (slot: (typeof MEALS)[number]['slot'], opener: HTMLButtonElement) => {
        setSelectedSlot(slot);
        openerRef.current = opener;
        setIsOpen(true);
    };

    return (
        <>
            <div className="recommendationMealChoices" role="group" aria-label="추천 식사 선택">
                {MEALS.map(({ slot, Icon }) => (
                    <button
                        key={slot}
                        type="button"
                        className="recommendationMealChoice"
                        aria-haspopup="dialog"
                        aria-controls={dialogId}
                        aria-expanded={isOpen && selectedSlot === slot}
                        onClick={(event) => openMeal(slot, event.currentTarget)}
                    >
                        <span className="recommendationMealIcon"><Icon size={27} strokeWidth={1.6} aria-hidden="true" /></span>
                        <span>{mealTypeLabel(slot)}</span>
                        <MedicationProgress medications={medicationsBySlot[slot] ?? []} />
                    </button>
                ))}
            </div>

            <dialog
                ref={dialogRef}
                id={dialogId}
                className="mealDialog"
                aria-labelledby={titleId}
                onClose={(event) => {
                    if (!event.currentTarget.open) setIsOpen(false);
                }}
                onCancel={(event) => {
                    event.preventDefault();
                    event.currentTarget.close();
                }}
                onPointerDown={(event) => {
                    pointerStartedOnBackdropRef.current = event.target === event.currentTarget
                        && isOutsideDialog(event.currentTarget, event.clientX, event.clientY);
                }}
                onPointerCancel={() => {
                    pointerStartedOnBackdropRef.current = false;
                }}
                onClick={(event) => {
                    const startedOnBackdrop = pointerStartedOnBackdropRef.current;
                    pointerStartedOnBackdropRef.current = false;
                    if (!startedOnBackdrop || event.target !== event.currentTarget) return;
                    if (isOutsideDialog(event.currentTarget, event.clientX, event.clientY)) {
                        event.currentTarget.close();
                    }
                }}
            >
                <div className="mealDialogInner">
                    <header className="mealDialogHeader">
                        <div>
                            <p>{dateLabel}</p>
                            <h2 id={titleId}>{mealTypeLabel(selectedSlot)} 추천 식단</h2>
                        </div>
                        <button type="button" className="uiIconButton" aria-label="닫기" onClick={() => dialogRef.current?.close()}>
                            <X size={21} aria-hidden="true" />
                        </button>
                    </header>
                    <div className="mealDialogTabs" role="group" aria-label="팝업에서 식사 선택">
                        {MEALS.map(({ slot }) => (
                            <button key={slot} type="button" aria-pressed={selectedSlot === slot} onClick={() => setSelectedSlot(slot)}>
                                {mealTypeLabel(slot)}
                            </button>
                        ))}
                    </div>
                    <div key={`${selectedSlot}-${isOpen}`} className="mealDialogBody">
                        <MedicationChecklist
                            medications={medications}
                            onTakenChange={onMedicationTakenChange}
                            notice={medicationNotice}
                            error={medicationError}
                        />
                        <h3 className="mealDialogMain">{meal.main || '식사 구성 확인 필요'}</h3>
                        {menu.length > 0 && (
                            <dl className="mealDialogMenu">
                                {menu.map(({ label, foods }) => (
                                    <div key={label}>
                                        <dt>{label}</dt>
                                        <dd>{foods.join(' · ')}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                        <details className="mealDialogDetail">
                            <summary>조리법</summary>
                            {recipeSteps.length > 0 ? (
                                <ol className="list-decimal space-y-3 pl-5">
                                    {recipeSteps.map((step) => <li key={step}>{step}</li>)}
                                </ol>
                            ) : <p>조리법을 준비하고 있어요.</p>}
                        </details>
                        <details className="mealDialogDetail">
                            <summary>식사량 참고</summary>
                            {renderPortions(selectedSlot)}
                        </details>
                        <details className="mealDialogDetail">
                            <summary>영양 구성</summary>
                            {renderNutrition ? renderNutrition(selectedSlot) : <MealNutrition meal={meal} />}
                        </details>
                    </div>
                </div>
            </dialog>
        </>
    );
}
