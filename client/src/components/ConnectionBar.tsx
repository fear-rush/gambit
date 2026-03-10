import { memo, useCallback } from "react";
import { useConnectionStore } from "../stores/connectionStore";
import { useConnections } from "../hooks/useConnections";
import { getDefaultMarketSet } from "../config/defaultMarkets";
import { EXCHANGE_SHORT } from "../lib/constants";

interface ConnectionItemProps {
	marketKey: string;
	exchange: string;
	pair: string;
	isPermanent: boolean;
	onDisconnect: (key: string) => void;
}

const ConnectionItem = memo(function ConnectionItem({
	marketKey,
	exchange,
	pair,
	isPermanent,
	onDisconnect,
}: ConnectionItemProps) {
	const label = `${EXCHANGE_SHORT[exchange] ?? exchange.slice(0, 4)}:${pair}`;

	return (
		<div
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
					onClick={() => onDisconnect(marketKey)}
					className="text-neutral-600 hover:text-red-400 leading-none ml-0.5"
					title="Disconnect"
				>
					&times;
				</button>
			)}
		</div>
	);
});

export function ConnectionBar() {
	const connections = useConnectionStore((s) => s.connections);
	const { disconnect } = useConnections();

	const handleDisconnect = useCallback(
		(key: string) => {
			disconnect([key]);
		},
		[disconnect],
	);

	if (connections.size === 0) return null;

	const defaults = getDefaultMarketSet();

	return (
		<div className="flex items-center gap-1 px-3 py-1 border-b border-neutral-800/30 overflow-x-auto scrollbar-none shrink-0">
			{[...connections.entries()].map(([key, info]) => (
				<ConnectionItem
					key={key}
					marketKey={key}
					exchange={info.exchange}
					pair={info.pair}
					isPermanent={defaults.has(key)}
					onDisconnect={handleDisconnect}
				/>
			))}
		</div>
	);
}
