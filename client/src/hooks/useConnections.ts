import { useCallback } from "react";
import { useAggregator } from "./useAggregator";
import { useConnectionStore } from "../stores/connectionStore";
import { getDefaultMarketSet } from "../config/defaultMarkets";

export function useConnections() {
	const aggregator = useAggregator();
	const connections = useConnectionStore((s) => s.connections);

	const connect = useCallback(
		async (markets: string[]) => {
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
			const defaults = getDefaultMarketSet();
			const removable = markets.filter((m) => !defaults.has(m));
			if (removable.length) {
				// Optimistically remove from UI immediately
				useConnectionStore.getState().removeConnections(removable);
				// Then tell the server (fire-and-forget, don't block UI)
				aggregator.disconnect(removable).catch((err) => {
					console.warn("[disconnect] server error:", err);
				});
			}
		},
		[aggregator],
	);

	const disconnectAll = useCallback(async () => {
		const current = useConnectionStore.getState().connections;
		const defaults = getDefaultMarketSet();
		const removable = [...current.keys()].filter((m) => !defaults.has(m));
		if (removable.length) {
			useConnectionStore.getState().removeConnections(removable);
			aggregator.disconnect(removable).catch((err) => {
				console.warn("[disconnectAll] server error:", err);
			});
		}
	}, [aggregator]);

	/** Set exact connections — connects new, disconnects removed (except defaults) */
	const setConnections = useCallback(
		(desired: string[]) => {
			const current = new Set(useConnectionStore.getState().connections.keys());
			const desiredSet = new Set(desired);
			const defaults = getDefaultMarketSet();

			const toDisconnect = [...current].filter(
				(m) => !desiredSet.has(m) && !defaults.has(m),
			);
			const toConnect = desired.filter((m) => !current.has(m));

			// Optimistically remove unwanted connections from UI immediately
			if (toDisconnect.length) {
				useConnectionStore.getState().removeConnections(toDisconnect);
			}

			// Fire server commands without blocking — UI is already correct
			if (toDisconnect.length) {
				aggregator.disconnect(toDisconnect).catch((err) => {
					console.warn("[setConnections] disconnect error:", err);
				});
			}
			if (toConnect.length) {
				aggregator.connect(toConnect).catch((err) => {
					console.warn("[setConnections] connect error:", err);
				});
			}
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
