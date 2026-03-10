import { useTickerStore } from "../stores/tickerStore";

export function useTickers() {
	return useTickerStore((s) => s.tickers);
}
