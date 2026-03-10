import { memo } from "react";
import type { ChartPanels } from "../stores/chartSettingsStore";

interface ChartSettingsProps {
	panels: ChartPanels;
	onToggle: (panel: keyof ChartPanels) => void;
}

export const ChartSettings = memo(function ChartSettings({
	panels,
	onToggle,
}: ChartSettingsProps) {
	return (
		<div className="absolute top-6 left-0 bg-[#1a1a1e] border border-neutral-700 rounded shadow-xl py-1.5 w-40 z-20">
			<div className="px-3 py-1 text-[9px] text-neutral-500 uppercase tracking-wider">
				Panels
			</div>
			<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
				<input
					type="checkbox"
					checked={panels.volume}
					onChange={() => onToggle("volume")}
					className="accent-emerald-500"
				/>
				Volume + CVD
			</label>
			<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
				<input
					type="checkbox"
					checked={panels.delta}
					onChange={() => onToggle("delta")}
					className="accent-emerald-500"
				/>
				Volume Delta
			</label>
			<label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-neutral-300 hover:bg-neutral-800/50 cursor-pointer">
				<input
					type="checkbox"
					checked={panels.rsi}
					onChange={() => onToggle("rsi")}
					className="accent-emerald-500"
				/>
				RSI (14)
			</label>
		</div>
	);
});
