import { create } from "zustand";

export interface ChartPanels {
	volume: boolean;
	delta: boolean;
	rsi: boolean;
}

interface ChartSettingsState {
	panels: ChartPanels;
	togglePanel: (panel: keyof ChartPanels) => void;
}

export const useChartSettingsStore = create<ChartSettingsState>((set) => ({
	panels: {
		volume: true,
		delta: false,
		rsi: false,
	},
	togglePanel: (panel) =>
		set((state) => ({
			panels: { ...state.panels, [panel]: !state.panels[panel] },
		})),
}));
