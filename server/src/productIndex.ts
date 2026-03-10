import { exchanges } from "./exchanges";

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

const QUOTE_CURRENCIES = [
	"USDT",
	"USD",
	"BUSD",
	"USDC",
	"UST",
	"TUSD",
	"FDUSD",
	"EUR",
	"BTC",
	"ETH",
	"BNB",
];

const STABLECOIN_MAP: Record<string, string> = {
	USDT: "USD",
	BUSD: "USD",
	USDC: "USD",
	UST: "USD",
	TUSD: "USD",
	FDUSD: "USD",
};

const DERIVATIVES_EXCHANGES = new Set([
	"BINANCE_FUTURES",
	"BITMEX",
	"DYDX",
	"HYPERLIQUID",
]);

let indexedProducts: IndexedProduct[] = [];
let groupedPairs: GroupedPair[] = [];
let allExchangeIds: string[] = [];

function detectMarketType(exchange: string, symbol: string): MarketType {
	const upper = symbol.toUpperCase();

	if (
		/_CW$|_CQ$|_NW$|_NQ$/i.test(upper) ||
		/\d{6}$/.test(upper) ||
		/-\d{2}[A-Z]{3}\d{2}$/i.test(upper)
	) {
		return "futures";
	}

	if (
		/_PERP$/i.test(upper) ||
		/-PERPETUAL$/i.test(upper) ||
		/-SWAP$/i.test(upper) ||
		/PERP/i.test(upper)
	) {
		return "perpetual";
	}

	if (DERIVATIVES_EXCHANGES.has(exchange)) {
		return "perpetual";
	}

	if (exchange === "DERIBIT") {
		return upper.includes("PERPETUAL") ? "perpetual" : "futures";
	}

	return "spot";
}

function normalizeSymbol(
	_exchange: string,
	symbol: string,
): { base: string; quote: string } | null {
	let s = symbol.toUpperCase();

	s = s
		.replace(/_PERP$/i, "")
		.replace(/-PERPETUAL$/i, "")
		.replace(/-SWAP$/i, "")
		.replace(/_CW$|_CQ$|_NW$|_NQ$/i, "")
		.replace(/\d{6}$/, "")
		.replace(/-\d{2}[A-Z]{3}\d{2}$/i, "");

	s = s.replace(/XBT/g, "BTC");

	let base: string | undefined;
	let quote: string | undefined;

	if (s.includes("-")) {
		const parts = s.split("-");
		base = parts[0];
		quote = parts[1];
	} else if (s.includes("/")) {
		const parts = s.split("/");
		base = parts[0];
		quote = parts[1];
	} else if (s.includes(":")) {
		const parts = s.split(":");
		base = parts[0];
		quote = parts[1];
	} else if (s.includes("_")) {
		const parts = s.split("_");
		base = parts[0];
		quote = parts[1];
	} else {
		for (const q of QUOTE_CURRENCIES) {
			if (s.endsWith(q) && s.length > q.length) {
				base = s.slice(0, -q.length);
				quote = q;
				break;
			}
		}
	}

	if (!base || !quote) return null;
	if (base.length < 2) return null;

	return { base, quote };
}

function mergeQuote(quote: string): string {
	return STABLECOIN_MAP[quote] ?? quote;
}

/** Build the index from all exchange products. Call after products are fetched. */
export function buildIndex() {
	const allProducts: IndexedProduct[] = [];
	const exchangeSet = new Set<string>();

	for (const exchange of exchanges) {
		if (!exchange.products) continue;
		exchangeSet.add(exchange.id);

		for (const symbol of exchange.products) {
			const norm = normalizeSymbol(exchange.id, symbol);
			if (!norm) continue;

			allProducts.push({
				id: `${exchange.id}:${symbol}`,
				pair: symbol,
				exchange: exchange.id,
				local: norm.base + mergeQuote(norm.quote),
				base: norm.base,
				quote: norm.quote,
				type: detectMarketType(exchange.id, symbol),
			});
		}
	}

	indexedProducts = allProducts;
	allExchangeIds = [...exchangeSet].sort();

	// Group by normalized local pair
	const groups = new Map<string, GroupedPair>();
	for (const p of allProducts) {
		const existing = groups.get(p.local);
		if (existing) {
			existing.count++;
			if (!existing.exchanges.includes(p.exchange)) {
				existing.exchanges.push(p.exchange);
			}
			existing.markets.push(p.id);
			if (!existing.types.includes(p.type)) {
				existing.types.push(p.type);
			}
		} else {
			groups.set(p.local, {
				local: p.local,
				count: 1,
				exchanges: [p.exchange],
				markets: [p.id],
				types: [p.type],
			});
		}
	}

	groupedPairs = [...groups.values()].sort((a, b) => b.count - a.count);
	console.log(
		`[productIndex] indexed ${allProducts.length} products, ${groupedPairs.length} pairs, ${allExchangeIds.length} exchanges`,
	);
}

/** Search pairs with optional query and filters. Returns max 100. */
export function searchPairs(
	query?: string,
	filterExchanges?: string[],
	filterTypes?: string[],
): GroupedPair[] {
	let pairs = groupedPairs;

	// Text filter
	if (query) {
		const q = query.toUpperCase();
		pairs = pairs.filter((p) => p.local.includes(q));
	}

	const hasExchangeFilter = filterExchanges && filterExchanges.length > 0;
	const hasTypeFilter = filterTypes && filterTypes.length > 0;

	if (!hasExchangeFilter && !hasTypeFilter) {
		return pairs.slice(0, 100);
	}

	const exSet = hasExchangeFilter ? new Set(filterExchanges) : null;
	const tySet = hasTypeFilter ? new Set(filterTypes) : null;

	const filtered: GroupedPair[] = [];
	for (const pair of pairs) {
		// Get products for this pair matching filters
		let products = indexedProducts.filter((p) => p.local === pair.local);
		if (exSet) products = products.filter((p) => exSet.has(p.exchange));
		if (tySet) products = products.filter((p) => tySet.has(p.type));
		if (products.length === 0) continue;

		const pairExchanges = [...new Set(products.map((p) => p.exchange))];
		const pairTypes = [...new Set(products.map((p) => p.type))];

		filtered.push({
			local: pair.local,
			count: products.length,
			exchanges: pairExchanges,
			markets: products.map((p) => p.id),
			types: pairTypes,
		});
	}

	return filtered.slice(0, 100);
}

/** Get products for a specific pair, optionally filtered */
export function getProductsForPair(
	local: string,
	filterExchanges?: string[],
	filterTypes?: string[],
): IndexedProduct[] {
	let products = indexedProducts.filter((p) => p.local === local);
	if (filterExchanges?.length) {
		const exSet = new Set(filterExchanges);
		products = products.filter((p) => exSet.has(p.exchange));
	}
	if (filterTypes?.length) {
		const tySet = new Set(filterTypes);
		products = products.filter((p) => tySet.has(p.type));
	}
	return products;
}

/** Get all exchange IDs */
export function getAllExchanges(): string[] {
	return allExchangeIds;
}
