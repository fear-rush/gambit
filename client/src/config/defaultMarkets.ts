/** Minimal fallback — only exchanges that reliably connect */
const FALLBACK_MARKETS = ["BINANCE:btcusdt", "BITSTAMP:btcusd"];

/**
 * Get default markets. Server auto-connects these on startup,
 * so this is just used as a reference set.
 */
export function getDefaultMarkets(): string[] {
	return FALLBACK_MARKETS;
}

/** Mutable set — populated once the product index resolves */
let defaultMarketSet = new Set(FALLBACK_MARKETS);

export function getDefaultMarketSet(): Set<string> {
	return defaultMarketSet;
}

export function updateDefaultMarketSet(markets: string[]): void {
	defaultMarketSet = new Set(markets);
}
