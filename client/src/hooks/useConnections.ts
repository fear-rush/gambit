import { useCallback } from "react";
import { useAggregator } from "./useAggregator";
import { useConnectionStore } from "../stores/connectionStore";
import { getDefaultMarketSet } from "../config/defaultMarkets";

export function useConnections() {
	const aggregator = useAggregator();
	const connections = useConnectionStore((s) => s.connections);

	const connect = useCallback(
		async (markets: string[]) => {
			// Filter out already-connected markets to prevent duplicates
			const current = useConnectionStore.getState().connections;
			const newMarkets = markets.filter((m) => !current.has(m));
			if (newMarkets.length) {
				await aggregator.connect(newMarkets);
			}
		},
		[aggregator],
	);

	const disconnect = useCallback(
		async (markets: string[]) => {
			// Never disconnect default/permanent markets
			const defaults = getDefaultMarketSet();
			const removable = markets.filter((m) => !defaults.has(m));
			if (removable.length) {
				await aggregator.disconnect(removable);
			}
		},
		[aggregator],
	);

	const disconnectAll = useCallback(async () => {
		const current = useConnectionStore.getState().connections;
		const defaults = getDefaultMarketSet();
		const removable = [...current.keys()].filter((m) => !defaults.has(m));
		if (removable.length) {
			await aggregator.disconnect(removable);
		}
	}, [aggregator]);

	/** Set exact connections — connects new, disconnects removed (except defaults) */
	const setConnections = useCallback(
		async (desired: string[]) => {
			const current = new Set(useConnectionStore.getState().connections.keys());
			const desiredSet = new Set(desired);
			const defaults = getDefaultMarketSet();

			const toConnect = desired.filter((m) => !current.has(m));
			const toDisconnect = [...current].filter(
				(m) => !desiredSet.has(m) && !defaults.has(m),
			);

			if (toDisconnect.length) await aggregator.disconnect(toDisconnect);
			if (toConnect.length) await aggregator.connect(toConnect);
		},
		[aggregator],
	);

	return {
		connections,
		connect,
		disconnect,
		disconnectAll,
		setConnections,
	};
}
