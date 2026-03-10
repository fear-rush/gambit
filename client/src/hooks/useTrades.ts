import { useEffect, useRef, useState } from "react";
import { useAggregator } from "./useAggregator";
import type { Trade } from "shared";

const MAX_TRADES = 100;

export type TradeWithId = Trade & { _id: number };

let tradeIdCounter = 0;

export function useTrades(minAmount = 0) {
	const aggregator = useAggregator();
	const tradesRef = useRef<TradeWithId[]>([]);
	const [trades, setTrades] = useState<TradeWithId[]>([]);

	useEffect(() => {
		const handler = (incomingTrades: Trade[]) => {
			const filtered =
				minAmount > 0
					? incomingTrades.filter(
							(t) => (t.amount ?? t.price * t.size) >= minAmount,
						)
					: incomingTrades;

			if (!filtered.length) return;

			const tagged = filtered.map((t) => ({
				...t,
				_id: ++tradeIdCounter,
			}));

			const next = [...tagged, ...tradesRef.current].slice(0, MAX_TRADES);
			tradesRef.current = next;
			setTrades(next);
		};

		aggregator.on("trades", handler);

		return () => {
			aggregator.off("trades", handler);
		};
	}, [aggregator, minAmount]);

	return trades;
}
