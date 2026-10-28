import { createRestaurantFinder } from '../../../../lib/restaurantFinder.ts';

const findRestaurants = createRestaurantFinder();

export async function GET(request: Request) {
    try {
        const result = await findRestaurants(new URL(request.url).searchParams, request.signal);
        return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return Response.json(
            { message: request.signal.aborted ? '검색이 취소되었어요.' : '식당 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' },
            { status: request.signal.aborted ? 499 : 503, headers: { 'Cache-Control': 'private, no-store' } }
        );
    }
}
