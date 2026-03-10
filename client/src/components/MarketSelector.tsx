import { useState, type FormEvent } from "react";
import { useConnections } from "../hooks/useConnections";

export function MarketSelector() {
	const [input, setInput] = useState("");
	const { connections, connect, disconnect } = useConnections();

	const handleConnect = async (e: FormEvent) => {
		e.preventDefault();
		const markets = input
			.split(",")
			.map((m) => m.trim())
			.filter(Boolean);
		if (markets.length) {
			await connect(markets);
			setInput("");
		}
	};

	const handleDisconnect = async (marketKey: string) => {
		await disconnect([marketKey]);
	};

	return (
		<div className="px-3 py-2 space-y-2">
			<form onSubmit={handleConnect} className="flex gap-2">
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="EXCHANGE:pair (e.g. KRAKEN:XBT/USD)"
					className="flex-1 px-2 py-1 text-xs bg-neutral-900/50 border border-neutral-800 rounded text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-600"
				/>
				<button
					type="submit"
					className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded"
				>
					Add
				</button>
			</form>
			{connections.size > 0 && (
				<div className="flex flex-wrap gap-1">
					{[...connections.entries()].map(([key, conn]) => (
						<button
							key={key}
							type="button"
							onClick={() => handleDisconnect(key)}
							className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-neutral-900 text-neutral-500 rounded hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
						>
							<span className="w-1 h-1 rounded-full bg-emerald-500" />
							{conn.exchange}:{conn.pair}
							<span className="text-neutral-700 ml-0.5">&times;</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
