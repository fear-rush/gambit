import { memo } from "react";
import type { ChartLegend as ChartLegendData } from "../hooks/useChart";
import type { ChartPanels } from "../stores/chartSettingsStore";

interface ChartLegendProps {
	legend: ChartLegendData | null;
	panels: ChartPanels;
	connectionCount: number;
}

export const ChartLegend = memo(function ChartLegend({
	legend,
	panels,
	connectionCount,
}: ChartLegendProps) {
	return (
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
	);
});
