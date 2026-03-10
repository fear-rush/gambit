/** Shared short-name map for exchange display labels */
export const EXCHANGE_SHORT: Record<string, string> = {
	BINANCE: "BIN",
	BINANCE_FUTURES: "BIN-F",
	BITFINEX: "BFNX",
	BITMEX: "BMEX",
	BITSTAMP: "BSTP",
	BYBIT: "BYBT",
	COINBASE: "COIN",
	DERIBIT: "DRBT",
	OKEX: "OKEX",
	KRAKEN: "KRKN",
	KUCOIN: "KUC",
	HUOBI: "HUOB",
	BITGET: "BGET",
	POLONIEX: "POLO",
	DYDX: "DYDX",
	HYPERLIQUID: "HYPL",
	GATEIO: "GATE",
	PHEMEX: "PHMX",
};

export function shortExchange(name: string): string {
	return EXCHANGE_SHORT[name] ?? name.slice(0, 4);
}
