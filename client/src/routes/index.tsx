import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Chart } from "../components/Chart";
import { TradeFeed } from "../components/TradeFeed";
import { SearchDialog } from "../components/SearchDialog";
import { ConnectionBar } from "../components/ConnectionBar";
import { useConnectionStore } from "../stores/connectionStore";

export const Route = createFileRoute("/")({
	component: Index,
});

function Index() {
	const [showTrades, setShowTrades] = useState(true);
	const [showSearch, setShowSearch] = useState(false);
	const connectionCount = useConnectionStore((s) => s.connections.size);

	return (
		<div className="flex flex-col h-screen bg-[#0c0c0e] text-neutral-200 overflow-hidden">
			{/* Top bar */}
			<div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800/50 shrink-0">
				<div className="flex items-center gap-3">
					<span className="text-sm font-bold tracking-tight text-neutral-300">
						gambit
					</span>
					<button
						type="button"
						onClick={() => setShowSearch(true)}
						className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] rounded bg-neutral-800/50 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
					>
						<span className="text-[10px]">+</span>
						Connect
						{connectionCount > 0 && (
							<span className="ml-1 px-1 py-px text-[9px] bg-emerald-600/20 text-emerald-400 rounded">
								{connectionCount}
							</span>
						)}
					</button>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setShowTrades(!showTrades)}
						className={`px-2 py-0.5 text-[11px] rounded ${
							showTrades
								? "bg-neutral-700 text-white"
								: "text-neutral-500 hover:text-neutral-300"
						}`}
					>
						Trades
					</button>
				</div>
			</div>

			{/* Connection bar */}
			<ConnectionBar />

			{/* Main content */}
			<div className="flex flex-1 min-h-0">
				<Chart />
				{showTrades && (
					<div className="w-72 shrink-0 border-l border-neutral-800/50">
						<TradeFeed />
					</div>
				)}
			</div>

			{/* Search dialog */}
			<SearchDialog open={showSearch} onClose={() => setShowSearch(false)} />
		</div>
	);
}

export default Index;
