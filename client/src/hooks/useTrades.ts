import { useEffect, useRef, useState } from "react";
import { useAggregator } from "./useAggregator";
import { useConnectionStore } from "../stores/connectionStore";
import type { Trade } from "shared";

const MAX_TRADES = 100;

export type TradeWithId = Trade & { _id: number };

let tradeIdCounter = 0;

export function useTrades(minAmount = 0) {
	const aggregator = useAggregator();
	const [trades, setTrades] = useState<TradeWithId[]>([]);
	const connectionsRef = useRef(useConnectionStore.getState().connections);

	// Subscribe to connection changes — purge trades from disconnected markets
	useEffect(() => {
		return useConnectionStore.subscribe((state) => {
			const prev = connectionsRef.current;
			connectionsRef.current = state.connections;

			// Find which markets were removed
			if (state.connections.size < prev.size) {
				setTrades((current) => {
					const filtered = current.filter((t) =>
						state.connections.has(`${t.exchange}:${t.pair}`),
					);
					return filtered.length === current.length ? current : filtered;
				});
			}
		});
	}, []);

	// Accumulate incoming trades, only from connected markets
	useEffect(() => {
		const handler = (incomingTrades: Trade[]) => {
			const conns = connectionsRef.current;

			const filtered = incomingTrades.filter((t) => {
				if (!conns.has(`${t.exchange}:${t.pair}`)) return false;
				if (minAmount > 0) {
					const amt = t.amount ?? t.price * t.size;
					if (amt < minAmount) return false;
				}
				return true;
			});

			if (!filtered.length) return;

			const tagged = filtered.map((t) => ({
				...t,
				_id: ++tradeIdCounter,
			}));

			setTrades((prev) => [...tagged, ...prev].slice(0, MAX_TRADES));
		};

		aggregator.on("trades", handler);

		return () => {
			aggregator.off("trades", handler);
		};
	}, [aggregator, minAmount]);

	return trades;
}
