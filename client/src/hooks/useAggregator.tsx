import {
	createContext,
	useContext,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import { aggregatorService } from "../services/aggregatorService";
import { useConnectionStore } from "../stores/connectionStore";
import { useTickerStore } from "../stores/tickerStore";


const AggregatorContext = createContext(aggregatorService);

export function useAggregator() {
	return useContext(AggregatorContext);
}

export function AggregatorProvider({ children }: { children: ReactNode }) {
	const initialized = useRef(false);

	useEffect(() => {
		if (initialized.current) return;
		initialized.current = true;

		const { addConnection, removeConnection } = useConnectionStore.getState();
		const { updateTickers } = useTickerStore.getState();

		aggregatorService.on("connection", (data) => {
			addConnection(`${data.exchangeId}:${data.pair}`, {
				exchange: data.exchangeId,
				pair: data.pair,
				url: data.url,
			});
		});

		aggregatorService.on("disconnection", (data) => {
			removeConnection(`${data.exchangeId}:${data.pair}`);
		});

		aggregatorService.on("tickers", (tickers) => {
			updateTickers(tickers);
		});

		aggregatorService.on("notice", (data) => {
			console.debug(`[notice] ${data.title}`);
		});

		aggregatorService.on("error", (data) => {
			console.warn("[aggregator error]", data);
		});

		// Server auto-connects default markets on startup.
	}, []);

	return (
		<AggregatorContext.Provider value={aggregatorService}>
			{children}
		</AggregatorContext.Provider>
	);
}
