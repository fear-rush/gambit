import { useRef, useState, useCallback } from "react";
import { useChart, TIMEFRAME_MAP, type ChartLegend as ChartLegendData } from "../hooks/useChart";
import { useConnectionStore } from "../stores/connectionStore";
import { useChartSettingsStore } from "../stores/chartSettingsStore";
import { ChartLegend } from "./ChartLegend";
import { ChartSettings } from "./ChartSettings";

const TIMEFRAMES = Object.keys(TIMEFRAME_MAP);

export function Chart() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [timeframe, setTimeframe] = useState("5s");
	const [legend, setLegend] = useState<ChartLegendData | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const connectionCount = useConnectionStore((s) => s.connections.size);
	const panels = useChartSettingsStore((s) => s.panels);
	const togglePanel = useChartSettingsStore((s) => s.togglePanel);

	const onLegendUpdate = useCallback((l: ChartLegendData) => {
		setLegend(l);
	}, []);

	const handleCloseSettings = useCallback(() => {
		setShowSettings(false);
	}, []);

	const handleToggleSettings = useCallback(() => {
		setShowSettings((prev) => !prev);
	}, []);

	useChart(containerRef, timeframe, panels, onLegendUpdate);

	return (
		<div className="relative flex-1 min-h-0 min-w-0">
			{/* Overlay: top-left legend */}
			<div className="absolute top-2 left-3 z-10 pointer-events-none select-none">
				{/* Pair + Timeframe + Settings */}
				<div className="flex items-center gap-2 mb-1">
					<span className="text-sm font-semibold text-neutral-300">BTCUSD</span>
					<div className="flex gap-0.5 pointer-events-auto">
						{TIMEFRAMES.map((tf) => (
							<button
								key={tf}
								type="button"
								onClick={() => setTimeframe(tf)}
								className={`px-1.5 py-0 text-[11px] rounded ${
									timeframe === tf
										? "bg-neutral-700 text-white"
										: "text-neutral-500 hover:text-neutral-300"
								}`}
							>
								{tf}
							</button>
						))}
					</div>

					{/* Settings gear */}
					<div className="relative pointer-events-auto">
						<button
							type="button"
							onClick={handleToggleSettings}
							className="px-1.5 py-0 text-[11px] text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-700/50"
							title="Panel settings"
						>
							&#9881;
						</button>
						{showSettings && (
							<ChartSettings panels={panels} onToggle={togglePanel} />
						)}
					</div>
				</div>

				{/* Indicators */}
				<ChartLegend
					legend={legend}
					panels={panels}
					connectionCount={connectionCount}
				/>
			</div>

			{/* Click outside to close settings */}
			{showSettings && (
				<button
					type="button"
					className="absolute inset-0 z-[9] cursor-default"
					onClick={handleCloseSettings}
					aria-label="Close settings"
				/>
			)}

			{/* Chart container */}
			<div ref={containerRef} className="w-full h-full" />
		</div>
	);
}
