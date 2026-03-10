export type MarketType = "spot" | "perpetual" | "futures";

export interface IndexedProduct {
	id: string;
	pair: string;
	exchange: string;
	local: string;
	base: string;
	quote: string;
	type: MarketType;
}

export interface GroupedPair {
	local: string;
	count: number;
	exchanges: string[];
	markets: string[];
	types: MarketType[];
}

const BASE_URL =
	import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

/** Fetch list of all exchanges from server */
export async function fetchExchanges(signal?: AbortSignal): Promise<string[]> {
	const res = await fetch(`${BASE_URL}/api/products/exchanges`, { signal });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = (await res.json()) as { exchanges: string[] };
	return data.exchanges;
}

/** Search pairs with server-side filtering */
export async function searchPairs(
	query?: string,
	filters?: { exchanges?: string[]; types?: string[] },
	signal?: AbortSignal,
): Promise<GroupedPair[]> {
	const params = new URLSearchParams();
	if (query) params.set("q", query);
	if (filters?.exchanges?.length)
		params.set("exchanges", filters.exchanges.join(","));
	if (filters?.types?.length) params.set("types", filters.types.join(","));

	const res = await fetch(
		`${BASE_URL}/api/products/search?${params.toString()}`,
		{ signal },
	);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = (await res.json()) as { pairs: GroupedPair[] };
	return data.pairs;
}

/** Fetch products for a specific pair (expanded view) */
export async function fetchProductsForPair(
	local: string,
	filters?: { exchanges?: string[]; types?: string[] },
	signal?: AbortSignal,
): Promise<IndexedProduct[]> {
	const params = new URLSearchParams({ local });
	if (filters?.exchanges?.length)
		params.set("exchanges", filters.exchanges.join(","));
	if (filters?.types?.length) params.set("types", filters.types.join(","));

	const res = await fetch(
		`${BASE_URL}/api/products/pair?${params.toString()}`,
		{ signal },
	);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = (await res.json()) as { products: IndexedProduct[] };
	return data.products;
}
