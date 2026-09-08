import type { NutritionIngredientKey } from './nutritionIngredients';

/**
 * Explicit example recipes used only to explain a calculated nutrition estimate.
 * These ingredient weights are modelling assumptions, not measured recipes,
 * prescribed portions, nutrient-equivalent exchanges, or medical recommendations.
 * Ingredient nutrition and raw/cooked state come from nutritionIngredients.ts.
 * Water is included so the example's total weight is the sum of all ingredients.
 * Names must match this catalogue; unknown foods must never use a generic fallback.
 */
type ExampleRecipe = { ingredients: Array<[NutritionIngredientKey, number]> };

export function normalizeNutritionFoodName(name: string): string {
    return name.normalize('NFKC').trim().toLowerCase()
        .replace(/\s+/g, '')
        .replace(/계란/g, '달걀')
        .replace(/야채/g, '채소')
        .replace(/\((?:저염|무염|담백한맛)\)/g, '');
}

export const MEAL_NUTRITION_RECIPES: Record<string, ExampleRecipe> = Object.create(null);

function register(names: string[], ingredients: ExampleRecipe['ingredients']) {
    const recipe = { ingredients };
    for (const name of names) {
        MEAL_NUTRITION_RECIPES[normalizeNutritionFoodName(name)] = recipe;
    }
}

// All aliases are named explicitly. Different preparation names may share the
// same disclosed example, without claiming that real preparations are identical.
function soup(names: string[], ingredients: ExampleRecipe['ingredients']) {
    const solids = ingredients.reduce((sum, [, grams]) => sum + grams, 0);
    register(names, [...ingredients, ['water', 200 - solids]]);
}

function porridge(names: string[], ingredients: ExampleRecipe['ingredients']) {
    const solids = ingredients.reduce((sum, [, grams]) => sum + grams, 0);
    register(names, [...ingredients, ['water', 300 - solids]]);
}

function vegetable(names: string[], ingredient: NutritionIngredientKey, method: 'plain' | 'oil' = 'plain') {
    register(names, method === 'oil' ? [[ingredient, 47], ['oil', 3]] : [[ingredient, 50]]);
}

// Rice examples. Each compound grain dish explicitly includes its white-rice base.
register(['쌀밥', '흰쌀밥'], [['whiteRice', 150]]);
register(['현미밥'], [['brownRice', 150]]);
register(['잡곡밥'], [['whiteRice', 90], ['brownRice', 30], ['barley', 30]]);
register(['보리밥'], [['whiteRice', 105], ['barley', 45]]);
register(['귀리밥'], [['whiteRice', 120], ['oats', 30]]);
register(['기장밥'], [['whiteRice', 120], ['millet', 30]]);
register(['수수밥'], [['whiteRice', 120], ['sorghum', 10], ['water', 20]]);
register(['렌틸콩밥'], [['whiteRice', 120], ['lentils', 30]]);
register(['퀴노아잡곡밥'], [['whiteRice', 100], ['brownRice', 25], ['quinoa', 25]]);
register(['진밥'], [['whiteRice', 120], ['water', 30]]);
// Black rice uses a raw-grain record, with cooking water represented separately.
register(['흑미밥'], [['whiteRice', 120], ['blackRice', 10], ['water', 20]]);
// Gondre uses a Korean record for the complete prepared gondre rice dish.
register(['곤드레밥'], [['gondre', 150]]);

// Egg, tofu, and mixed main dishes: examples are generally 100–150 g.
register(['달걀찜'], [['egg', 60], ['water', 40]]);
register(['달걀채소찜'], [['egg', 60], ['carrot', 15], ['zucchini', 15], ['water', 30]]);
register(['버섯달걀찜'], [['egg', 60], ['mushroom', 30], ['water', 30]]);
register(['단호박달걀찜'], [['egg', 60], ['pumpkin', 40], ['water', 20]]);
register(['달걀두부찜', '두부달걀찜'], [['egg', 50], ['tofu', 60], ['water', 20]]);
register(['연두부달걀찜', '순두부달걀찜'], [['egg', 50], ['silkenTofu', 60], ['water', 20]]);
register(['두부달걀오믈렛'], [['egg', 60], ['tofu', 50], ['carrot', 15], ['oil', 3]]);
register(['계란말이'], [['egg', 80], ['carrot', 15], ['onion', 10], ['oil', 3]]);
register(['스크램블에그'], [['egg', 80], ['milk', 20], ['oil', 3]]);
register(['연두부찜'], [['silkenTofu', 120]]);
register(['연두부버섯찜'], [['silkenTofu', 90], ['mushroom', 30], ['water', 10]]);
register(['두부버섯찜'], [['tofu', 90], ['mushroom', 30], ['water', 10]]);
register(['단호박두부찜'], [['tofu', 80], ['pumpkin', 50]]);
register(['두부구이'], [['tofu', 117], ['oil', 3]]);
register(['두부조림'], [['tofu', 100], ['soySauce', 3], ['oil', 2], ['water', 15]]);
register(['두부버섯조림'], [['tofu', 80], ['mushroom', 30], ['soySauce', 3], ['oil', 2], ['water', 15]]);
register(['두부채소볶음(저염)', '채소두부볶음(저염)'], [['tofu', 80], ['zucchini', 20], ['carrot', 20], ['oil', 3], ['soySauce', 2]]);
register(['두부스테이크'], [['tofu', 90], ['egg', 20], ['onion', 15], ['flour', 10], ['oil', 3]]);
register(['버섯두부스테이크'], [['tofu', 80], ['mushroom', 30], ['egg', 15], ['flour', 10], ['oil', 3]]);
register(['병아리콩두부볼'], [['chickpeas', 60], ['tofu', 50], ['carrot', 15], ['flour', 10], ['oil', 3]]);
register(['콩불고기', '콩불고기(저염)'], [['soyProtein', 25], ['water', 60], ['onion', 20], ['mushroom', 20], ['soySauce', 3], ['sugar', 2], ['oil', 3]]);

// Poultry and meat examples use the documented database form of each meat.
register(['닭가슴살구이', '닭가슴살오븐구이', '닭안심구이'], [['chicken', 110], ['oil', 3]]);
register(['닭안심찜', '닭안심수육', '잘게 다진 닭안심찜'], [['chicken', 110]]);
register(['닭가슴살채소찜'], [['chicken', 90], ['zucchini', 20], ['carrot', 20]]);
register(['닭안심버섯찜'], [['chicken', 90], ['mushroom', 30], ['water', 10]]);
register(['닭가슴살채소볶음(저염)'], [['chicken', 90], ['zucchini', 20], ['carrot', 20], ['oil', 3], ['soySauce', 2]]);
register(['저지방 소고기볶음'], [['beef', 90], ['onion', 20], ['carrot', 15], ['oil', 3], ['soySauce', 2]]);
register(['소고기채소찜'], [['beef', 90], ['cabbage', 20], ['carrot', 20]]);
register(['돼지안심수육'], [['pork', 110]]);
register(['돼지안심구이'], [['pork', 110], ['oil', 3]]);
register(['돼지고기채소찜'], [['pork', 90], ['cabbage', 20], ['carrot', 20]]);
register(['오리고기구이'], [['duck', 110]]);
register(['오리고기채소볶음'], [['duck', 90], ['cabbage', 20], ['onion', 20], ['oil', 3]]);
register(['치킨'], [['chicken', 100], ['flour', 15], ['oil', 10]]);

// Fish species are explicit examples: unspecified white fish uses cod.
register(['연어구이', '연어구이(저염)'], [['salmon', 110], ['oil', 3]]);
register(['연어채소찜'], [['salmon', 90], ['zucchini', 20], ['carrot', 20]]);
register(['연어두부찜'], [['salmon', 70], ['tofu', 50], ['water', 10]]);
register(['연어두부샐러드'], [['salmon', 60], ['tofu', 50], ['lettuce', 20], ['tomato', 15], ['oil', 3]]);
register(['대구살찜', '흰살생선찜', '익힌 생선 숙회'], [['cod', 110]]);
register(['흰살생선구이', '흰살생선구이(저염)'], [['cod', 110], ['oil', 3]]);
register(['대구살채소찜'], [['cod', 90], ['zucchini', 20], ['carrot', 20]]);
register(['흰살생선두부찜'], [['cod', 70], ['tofu', 50], ['water', 10]]);
register(['고등어구이'], [['mackerel', 110], ['oil', 3]]);
register(['고등어찜(저염)'], [['mackerel', 100], ['radish', 25], ['water', 15]]);
register(['익힌 새우 숙회'], [['shrimp', 110]]);
register(['익힌 오징어 숙회'], [['squid', 110]]);

// A porridge main already contains its grain. No extra rice is implied.
porridge(['부드러운 죽', '흰죽', '쌀죽', '쌀미음'], [['whiteRice', 100]]);
porridge(['채소죽'], [['whiteRice', 90], ['carrot', 15], ['zucchini', 15]]);
porridge(['두부죽'], [['whiteRice', 90], ['tofu', 50]]);
porridge(['두부채소죽'], [['whiteRice', 90], ['tofu', 40], ['carrot', 15], ['zucchini', 15]]);
porridge(['달걀죽'], [['whiteRice', 90], ['egg', 50]]);
porridge(['채소달걀죽'], [['whiteRice', 90], ['egg', 40], ['carrot', 15], ['zucchini', 15]]);
porridge(['닭죽'], [['whiteRice', 90], ['chicken', 45]]);
porridge(['닭안심채소죽'], [['whiteRice', 90], ['chicken', 40], ['carrot', 15], ['zucchini', 15]]);
porridge(['귀리닭죽'], [['whiteRice', 60], ['oats', 60], ['chicken', 40], ['carrot', 10]]);
porridge(['흰살생선죽'], [['whiteRice', 90], ['cod', 45], ['carrot', 15]]);
porridge(['고구마두부죽'], [['whiteRice', 50], ['sweetPotato', 70], ['tofu', 40]]);
porridge(['오트밀죽'], [['oats', 180]]);

// Integrated rice bowls, soup rice, sushi, noodles, pizzas and sandwiches.
register(['연두부덮밥'], [['whiteRice', 150], ['silkenTofu', 90], ['carrot', 20], ['onion', 20], ['soySauce', 3], ['oil', 3]]);
register(['두부덮밥'], [['whiteRice', 150], ['tofu', 90], ['carrot', 20], ['onion', 20], ['soySauce', 3], ['oil', 3]]);
register(['달걀두부덮밥', '두부달걀덮밥'], [['whiteRice', 150], ['tofu', 60], ['egg', 40], ['carrot', 20], ['soySauce', 3], ['oil', 3]]);
register(['두부버섯덮밥(저염)'], [['whiteRice', 150], ['tofu', 80], ['mushroom', 40], ['soySauce', 3], ['oil', 3]]);
register(['달걀채소덮밥'], [['whiteRice', 150], ['egg', 60], ['carrot', 25], ['zucchini', 25], ['soySauce', 3], ['oil', 3]]);
register(['콩불고기덮밥(저염)'], [['whiteRice', 150], ['soyProtein', 25], ['water', 60], ['onion', 20], ['mushroom', 20], ['soySauce', 3], ['sugar', 2], ['oil', 3]]);
register(['콩나물두부국밥(저염)'], [['whiteRice', 130], ['soySprouts', 40], ['tofu', 50], ['soySauce', 3], ['water', 177]]);
register(['달걀 초밥'], [['whiteRice', 130], ['egg', 60], ['sugar', 4], ['soySauce', 2]]);
register(['익힌 생선 초밥'], [['whiteRice', 130], ['cod', 60], ['sugar', 4], ['soySauce', 2]]);
register(['익힌 새우 초밥'], [['whiteRice', 130], ['shrimp', 60], ['sugar', 4], ['soySauce', 2]]);
// The pasta key is the explicitly disclosed cooked-noodle example until
// separate noodle records are supplied; it is not an ingredient-equality claim.
register(['잔치국수(저염)'], [['pasta', 150], ['egg', 30], ['zucchini', 20], ['carrot', 20], ['soySauce', 3], ['water', 177]]);
register(['달걀우동(저염)'], [['pasta', 150], ['egg', 60], ['mushroom', 20], ['soySauce', 3], ['water', 167]]);
register(['닭고기쌀국수(저염)'], [['riceNoodles', 150], ['chicken', 60], ['beanSprouts', 30], ['soySauce', 3], ['water', 157]]);
register(['채소피자'], [['flour', 60], ['water', 35], ['ricotta', 40], ['tomato', 35], ['pepper', 20], ['onion', 15], ['oil', 5]]);
register(['닭고기피자'], [['flour', 60], ['water', 35], ['ricotta', 35], ['tomato', 30], ['chicken', 50], ['onion', 15], ['oil', 5]]);
register(['버섯피자'], [['flour', 60], ['water', 35], ['ricotta', 40], ['tomato', 30], ['mushroom', 40], ['oil', 5]]);
register(['달걀샌드위치'], [['bread', 70], ['egg', 60], ['lettuce', 15], ['tomato', 25]]);
register(['닭가슴살샌드위치'], [['bread', 70], ['chicken', 60], ['lettuce', 15], ['tomato', 25]]);
register(['두부샌드위치'], [['bread', 70], ['tofu', 70], ['lettuce', 15], ['tomato', 25]]);

// Soups total 200 g. No unspecified stock, dairy, or oil is silently added.
soup(['맑은채소국', '맑은 채소국', '저염 채소수프'], [['cabbage', 20], ['carrot', 15], ['onion', 15], ['soySauce', 2]]);
soup(['두부맑은국'], [['tofu', 50], ['radish', 20], ['soySauce', 2]]);
soup(['연두부국'], [['silkenTofu', 60], ['onion', 15], ['soySauce', 2]]);
soup(['무맑은국', '맑은 무국'], [['radish', 60], ['soySauce', 2]]);
soup(['배추맑은국'], [['napa', 60], ['soySauce', 2]]);
soup(['애호박맑은국', '맑은 애호박국'], [['zucchini', 60], ['soySauce', 2]]);
soup(['맑은 감자국'], [['potato', 60], ['onion', 15], ['soySauce', 2]]);
soup(['콩나물맑은국'], [['soySprouts', 60], ['soySauce', 2]]);
soup(['버섯맑은국'], [['mushroom', 60], ['soySauce', 2]]);
soup(['미역국(저염)'], [['seaweed', 30], ['soySauce', 2], ['oil', 2]]);
soup(['단호박수프'], [['pumpkin', 80], ['onion', 15]]);
soup(['당근수프'], [['carrot', 80], ['onion', 15]]);
soup(['브로콜리수프'], [['broccoli', 80], ['onion', 15]]);
soup(['양배추수프'], [['cabbage', 80], ['onion', 15]]);
soup(['감자양파수프'], [['potato', 70], ['onion', 30]]);
soup(['토마토채소수프'], [['tomato', 70], ['carrot', 15], ['onion', 15]]);
soup(['양송이버섯수프'], [['mushroom', 70], ['onion', 20]]);
soup(['닭안심채소수프'], [['chicken', 40], ['carrot', 20], ['cabbage', 20]]);
soup(['들깨버섯수프'], [['mushroom', 60], ['perilla', 10], ['onion', 15]]);
soup(['저염 된장국'], [['soybeanPaste', 8], ['tofu', 30], ['zucchini', 30]]);

// Plain side dishes use 50 g; stir-fried examples include 3 g oil within 50 g.
vegetable(['브로콜리찜', '데친브로콜리'], 'broccoli');
vegetable(['배추찜'], 'napa');
vegetable(['양배추찜'], 'cabbage');
vegetable(['단호박찜', '으깬 단호박'], 'pumpkin');
vegetable(['부드러운 감자찜'], 'potato');
vegetable(['부드럽게 익힌 당근'], 'carrot');
vegetable(['부드럽게 익힌 애호박'], 'zucchini');
vegetable(['가지찜'], 'eggplant');
vegetable(['잘게 다진 버섯찜'], 'mushroom');
vegetable(['버섯볶음', '저염 버섯볶음', '구운버섯'], 'mushroom', 'oil');
vegetable(['새송이버섯구이'], 'kingMushroom', 'oil');
vegetable(['당근볶음', '당근나물'], 'carrot', 'oil');
vegetable(['애호박볶음', '애호박무침'], 'zucchini', 'oil');
vegetable(['양배추볶음'], 'cabbage', 'oil');
vegetable(['가지구이', '가지나물'], 'eggplant', 'oil');
vegetable(['청경채볶음'], 'bokChoy', 'oil');
vegetable(['파프리카구이'], 'pepper', 'oil');
register(['시금치나물', '잘게 다진 시금치나물'], [['spinach', 47], ['oil', 2], ['sesame', 1]]);
register(['숙주나물'], [['beanSprouts', 47], ['oil', 2], ['sesame', 1]]);
register(['콩나물무침'], [['soySprouts', 47], ['oil', 2], ['sesame', 1]]);
register(['무나물'], [['radish', 48], ['oil', 2]]);
register(['미나리무침'], [['waterDropwort', 47], ['oil', 2], ['sesame', 1]]);
register(['오이무침', '오이채무침'], [['cucumber', 48], ['sesame', 1], ['soySauce', 1]]);
register(['연근조림(저염)'], [['lotus', 44], ['soySauce', 2], ['sugar', 2], ['oil', 2]]);
register(['우엉조림(저염)'], [['burdock', 44], ['soySauce', 2], ['sugar', 2], ['oil', 2]]);
register(['해초무침'], [['seaweed', 47], ['sesame', 1], ['soySauce', 2]]);
register(['그린샐러드'], [['lettuce', 30], ['cucumber', 20]]);
register(['토마토샐러드'], [['tomato', 35], ['lettuce', 15]]);
register(['구운채소'], [['zucchini', 20], ['carrot', 15], ['pepper', 12], ['oil', 3]]);
register(['저염 채소무침'], [['cabbage', 20], ['cucumber', 15], ['carrot', 13], ['sesame', 2]]);
register(['저염 나물', '나물모둠'], [['spinach', 20], ['beanSprouts', 15], ['radish', 12], ['oil', 2], ['sesame', 1]]);
register(['담백한 두부무침'], [['tofu', 45], ['sesame', 2], ['soySauce', 1], ['oil', 2]]);

// Snacks have explicit example amounts, including quantities in their names.
register(['무가당 요거트', '무가당 요거트(저당)', '플레인 요거트'], [['yogurt', 100]]);
register(['그릭요거트'], [['greekYogurt', 100]]);
register(['무가당 두유'], [['soyMilk', 190]]);
register(['리코타치즈 소량'], [['ricotta', 30]]);
register(['오트밀요거트'], [['yogurt', 100], ['oats', 40]]);
register(['삶은 달걀 1개'], [['egg', 50]]);
register(['찐고구마', '으깬 고구마'], [['sweetPotato', 100]]);
register(['고구마 소량'], [['sweetPotato', 50]]);
register(['찐단호박'], [['pumpkin', 100]]);
register(['찐단호박 소량'], [['pumpkin', 50]]);
register(['병아리콩 소량'], [['chickpeas', 50]]);
register(['사과 조각', '껍질 벗겨 익힌 사과'], [['apple', 80]]);
register(['배 조각', '껍질 벗겨 익힌 배'], [['pear', 80]]);
register(['바나나 반 개', '으깬 바나나'], [['banana', 50]]);
register(['키위'], [['kiwi', 80]]);
register(['딸기'], [['strawberry', 80]]);
register(['블루베리'], [['blueberry', 50]]);
register(['베리류'], [['blueberry', 40], ['strawberry', 40]]);
register(['귤'], [['mandarin', 80]]);
register(['복숭아 조각'], [['peach', 80]]);
register(['토마토 조각'], [['tomato', 80]]);
register(['오이 스틱'], [['cucumber', 50]]);
register(['아몬드 소량'], [['almond', 15]]);
register(['호두 소량'], [['walnut', 15]]);
// The generic fruit dish still has an explicit disclosed example, not a rule
// that guesses the composition of other unlisted fruit names.
register(['제철 과일'], [['apple', 40], ['pear', 40]]);
// Unsweetened strained drinks: the example counts water, not tea solids eaten.
register(['물', '따뜻한 물', '보리차', '루이보스차', '연한 생강차'], [['water', 200]]);
