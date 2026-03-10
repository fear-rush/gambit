import { create } from "zustand";
import type { Ticker } from "shared";

interface TickerState {
	tickers: Record<string, Ticker>;
	updateTickers: (update: Record<string, Ticker>) => void;
}

export const useTickerStore = create<TickerState>((set) => ({
	tickers: {},
	updateTickers: (update) =>
		set((state) => ({
			tickers: { ...state.tickers, ...update },
		})),
}));
