import type { MealSuggestion } from './dietEngine';
import { NUTRITION_INGREDIENTS, type NutritionSource, type NutritionValues } from './nutritionIngredients.ts';
import { NUTRITION_DISHES } from './nutritionDishes.ts';
import { MEAL_NUTRITION_RECIPES, normalizeNutritionFoodName } from './mealNutritionRecipes.ts';

export type EstimatedFood = {
    name: string;
    grams: number;
    ingredients: string;
    sourceUrl: string;
    sources: NutritionSource[];
    nutrients: NutritionValues;
};

export type MealNutritionEstimate = {
    status: 'complete' | 'partial' | 'unavailable';
    totals: NutritionValues | null;
    energyShares: { carb: number; protein: number; fat: number };
    items: EstimatedFood[];
    missingFoods: string[];
};

const emptyValues = (): NutritionValues => ({ energyKcal: 0, carbG: 0, proteinG: 0, fatG: 0 });

function hasValidValues(values: NutritionValues) {
    return [values.energyKcal, values.carbG, values.proteinG, values.fatG]
        .every((value) => Number.isFinite(value) && value >= 0);
}

function addValues(target: NutritionValues, values: NutritionValues, factor: number) {
    target.energyKcal += values.energyKcal * factor;
    target.carbG += values.carbG * factor;
    target.proteinG += values.proteinG * factor;
    target.fatG += values.fatG * factor;
}

function estimateFood(name: string): EstimatedFood | null {
    const key = normalizeNutritionFoodName(name);
    const recipe = MEAL_NUTRITION_RECIPES[key];
    if (!recipe) return null;
    const grams = recipe.ingredients.reduce((sum, [, amount]) => sum + amount, 0);
    if (!(grams > 0) || !Number.isFinite(grams)) return null;

    const prepared = Object.hasOwn(NUTRITION_DISHES, key) ? NUTRITION_DISHES[key] : undefined;
    if (prepared) {
        if (!hasValidValues(prepared.per100g)) return null;
        const nutrients = emptyValues();
        addValues(nutrients, prepared.per100g, grams / 100);
        return {
            name, grams, nutrients,
            ingredients: `${prepared.source.description.replaceAll('_', ' · ')}의 대표 성분값 × 계산용 ${grams} g`,
            sourceUrl: prepared.source.url,
            sources: [prepared.source],
        };
    }

    const nutrients = emptyValues();
    const ingredients: string[] = [];
    const sources = new Map<string, NutritionSource>();
    for (const [ingredientKey, amount] of recipe.ingredients) {
        const ingredient = NUTRITION_INGREDIENTS[ingredientKey];
        if (!ingredient || !Number.isFinite(amount) || amount <= 0
            || !hasValidValues(ingredient.per100g)) return null;
        addValues(nutrients, ingredient.per100g, amount / 100);
        ingredients.push(`${ingredient.label} ${amount} g`);
        if (ingredient.source.url) sources.set(ingredient.source.foodCode, ingredient.source);
    }
    const sourceList = [...sources.values()];
    return {
        name, grams, nutrients,
        ingredients: `계산 예시 · ${ingredients.join(' + ')}`,
        sourceUrl: sourceList[0]?.url ?? '',
        sources: sourceList,
    };
}

/** A composition estimate for the final displayed menu, independent of legacy
 * nutrient percentages and nutritionUnavailable. Never changes the plan,
 * patient portions, meal recommendations, or clinical nutrient limits.
 */
export function estimateMealNutrition(meal: Pick<MealSuggestion, 'main' | 'riceType' | 'soup' | 'sides'>): MealNutritionEstimate {
    // Match the popup's exact-name de-duplication; integrated rice is included
    // only in its recipe, and no grain is invented when riceType is empty.
    const names = [...new Set([meal.main, meal.riceType, meal.soup, ...meal.sides].map((name) => name.trim()).filter(Boolean))];
    const items: EstimatedFood[] = [];
    const missingFoods: string[] = [];
    for (const name of names) {
        // Explicit omissions contribute neither food count nor a fabricated 0.
        if (/^(?:없음|생략|국\s*생략|밥\s*생략|해당\s*없음)$/.test(name)) continue;
        const item = estimateFood(name);
        if (item) items.push(item);
        else missingFoods.push(name);
    }
    if (!meal.main.trim() || /^(?:없음|생략)$/.test(meal.main.trim())) missingFoods.unshift('주메뉴 미정');
    if (items.length === 0) return { status: 'unavailable', totals: null, energyShares: { carb: 0, protein: 0, fat: 0 }, items, missingFoods };

    const totals = emptyValues();
    for (const item of items) addValues(totals, item.nutrients, 1);
    // This is an energy composition, not gram shares or daily target progress.
    // General Atwater factors; database total energy can differ with fibre and
    // food-specific conversion factors. Details explain the denominator.
    const energy = [totals.carbG * 4, totals.proteinG * 4, totals.fatG * 9];
    const macroEnergy = energy.reduce((sum, value) => sum + value, 0);
    const shares = macroEnergy > 0 ? energy.map((value) => value / macroEnergy * 100) : [0, 0, 0];
    return {
        status: missingFoods.length > 0 ? 'partial' : 'complete', totals, items, missingFoods,
        energyShares: { carb: shares[0], protein: shares[1], fat: shares[2] },
    };
}
