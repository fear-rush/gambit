import { CORS_HEADERS } from "../config/constants";
import {
	searchPairs,
	getProductsForPair,
	getAllExchanges,
} from "../services/productIndex";

export function handleProductsSearch(req: Request): Response {
	const url = new URL(req.url);
	const query = url.searchParams.get("q") ?? "";
	const exchangeParam = url.searchParams.get("exchanges");
	const typeParam = url.searchParams.get("types");
	const filterExchanges = exchangeParam
		? exchangeParam.split(",")
		: undefined;
	const filterTypes = typeParam ? typeParam.split(",") : undefined;
	return Response.json(
		{ pairs: searchPairs(query, filterExchanges, filterTypes) },
		{ headers: CORS_HEADERS },
	);
}

export function handleProductsPair(req: Request): Response {
	const url = new URL(req.url);
	const local = url.searchParams.get("local");
	if (!local) {
		return Response.json(
			{ error: "Missing local param" },
			{ status: 400, headers: CORS_HEADERS },
		);
	}
	const exchangeParam = url.searchParams.get("exchanges");
	const typeParam = url.searchParams.get("types");
	const filterExchanges = exchangeParam
		? exchangeParam.split(",")
		: undefined;
	const filterTypes = typeParam ? typeParam.split(",") : undefined;
	return Response.json(
		{
			products: getProductsForPair(
				local,
				filterExchanges,
				filterTypes,
			),
		},
		{ headers: CORS_HEADERS },
	);
}

export function handleProductsExchanges(): Response {
	return Response.json(
		{ exchanges: getAllExchanges() },
		{ headers: CORS_HEADERS },
	);
}
