import { useConnectionStore } from "../stores/connectionStore";
import { useConnections } from "../hooks/useConnections";
import { getDefaultMarketSet } from "../config/defaultMarkets";

const EXCHANGE_SHORT: Record<string, string> = {
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

export function ConnectionBar() {
	const connections = useConnectionStore((s) => s.connections);
	const { disconnect } = useConnections();

	if (connections.size === 0) return null;

	const defaults = getDefaultMarketSet();

	return (
		<div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-800/30 overflow-x-auto shrink-0">
			{[...connections.entries()].map(([key, info]) => {
				const isPermanent = defaults.has(key);
				const label = `${EXCHANGE_SHORT[info.exchange] ?? info.exchange.slice(0, 4)}:${info.pair}`;

				return (
					<div
						key={key}
						className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
							isPermanent
								? "bg-emerald-900/30 text-emerald-400/70"
								: "bg-neutral-800/50 text-neutral-500"
						}`}
					>
						<span className="max-w-28 truncate">{label}</span>
						{!isPermanent && (
							<button
								type="button"
								onClick={() => disconnect([key])}
								className="text-neutral-600 hover:text-red-400 leading-none ml-0.5"
								title="Disconnect"
							>
								&times;
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
