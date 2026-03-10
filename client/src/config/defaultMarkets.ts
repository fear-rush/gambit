/** Minimal fallback — only exchanges that reliably connect */
const FALLBACK_MARKETS = ["BINANCE:btcusdt", "BITSTAMP:btcusd"];

const defaultMarketSet = new Set(FALLBACK_MARKETS);

export function getDefaultMarketSet(): Set<string> {
	return defaultMarketSet;
}
