import { useRef, useState, useCallback } from "react";
import { useChart, TIMEFRAME_MAP, type ChartLegend } from "../hooks/useChart";
import { useConnectionStore } from "../stores/connectionStore";
import { useChartSettingsStore } from "../stores/chartSettingsStore";

const TIMEFRAMES = Object.keys(TIMEFRAME_MAP);

export function Chart() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [timeframe, setTimeframe] = useState("5s");
	const [legend, setLegend] = useState<ChartLegend | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const connectionCount = useConnectionStore((s) => s.connections.size);
	const panels = useChartSettingsStore((s) => s.panels);
	const togglePanel = useChartSettingsStore((s) => s.togglePanel);

	const onLegendUpdate = useCallback((l: ChartLegend) => {
		setLegend(l);
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
							onClick={() => setShowSettings(!showSettings)}
							className="px-1.5 py-0 text-[11px] text-neutral-500 hover:text-neutral-300 rounded hover:bg-neutral-700/50"
							title="Panel settings"
						>
							&#9881;
						</button>
						{showSettings && (
							<div className="absolute top-6 left-0 bg-[#1a1a1e] border border-neutral-700 rounded shadow-xl py-1.5 w-40 z-20">
								<div className="px-3 py-1 text-[9px] text-neutral-500 uppercase tracking-wider">
									Panels
								</div>
								<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
									<input
										type="checkbox"
										checked={panels.volume}
										onChange={() => togglePanel("volume")}
										className="accent-emerald-500"
									/>
									Volume + CVD
								</label>
								<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
									<input
										type="checkbox"
										checked={panels.delta}
										onChange={() => togglePanel("delta")}
										className="accent-emerald-500"
									/>
									Volume Delta
								</label>
								<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
									<input
										type="checkbox"
										checked={panels.rsi}
										onChange={() => togglePanel("rsi")}
										className="accent-emerald-500"
									/>
									RSI (14)
								</label>
							</div>
						)}
					</div>
				</div>

				{/* Indicators */}
				<div className="text-[11px] font-mono leading-relaxed space-y-px">
					{/* Price OHLC */}
					<div className="flex items-center gap-1.5">
						<span className="text-neutral-500">O:</span>
						<span className="text-neutral-300">{legend?.open ?? "—"}</span>
						<span className="text-neutral-500">H:</span>
						<span className="text-neutral-300">{legend?.high ?? "—"}</span>
						<span className="text-neutral-500">L:</span>
						<span className="text-neutral-300">{legend?.low ?? "—"}</span>
						<span className="text-neutral-500">C:</span>
						<span className="text-neutral-300">{legend?.close ?? "—"}</span>
					</div>

					{/* EMA */}
					<div className="flex items-center gap-2">
						<span className="text-amber-400">EMA 9</span>
						<span className="text-neutral-400">{legend?.ema9 ?? "—"}</span>
						<span className="text-blue-400 ml-1">EMA 21</span>
						<span className="text-neutral-400">{legend?.ema21 ?? "—"}</span>
					</div>

					{/* Volume (show when volume panel active) */}
					{panels.volume && (
						<div className="flex items-center gap-2">
							<span className="text-neutral-500">Vol</span>
							<span className="text-emerald-400">{legend?.buyVol ?? "—"}</span>
							<span className="text-neutral-600">/</span>
							<span className="text-red-400">{legend?.sellVol ?? "—"}</span>
							<span className="text-blue-300 ml-1">CVD</span>
							<span className="text-neutral-300">{legend?.cvd ?? "—"}</span>
						</div>
					)}

					{/* Delta (show when delta panel active) */}
					{panels.delta && (
						<div className="flex items-center gap-2">
							<span className="text-neutral-500">Delta</span>
							<span className="text-neutral-300">{legend?.delta ?? "—"}</span>
						</div>
					)}

					{/* RSI (show when RSI panel active) */}
					{panels.rsi && (
						<div className="flex items-center gap-2">
							<span className="text-purple-400">RSI</span>
							<span className="text-neutral-300">{legend?.rsi ?? "—"}</span>
						</div>
					)}

					{/* Markets count */}
					<div className="mt-1">
						<span className="text-neutral-600 text-[10px]">
							{connectionCount} markets
						</span>
					</div>
				</div>
			</div>

			{/* Click outside to close settings */}
			{showSettings && (
				<button
					type="button"
					className="absolute inset-0 z-[9] cursor-default"
					onClick={() => setShowSettings(false)}
					aria-label="Close settings"
				/>
			)}

			{/* Chart container */}
			<div ref={containerRef} className="w-full h-full" />
		</div>
	);
}
