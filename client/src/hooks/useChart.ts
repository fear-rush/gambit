import { useEffect, useRef, type RefObject } from "react";
import {
	createChart,
	createTextWatermark,
	CandlestickSeries,
	HistogramSeries,
	LineSeries,
	type IChartApi,
	type ISeriesApi,
	type CandlestickData,
	type HistogramData,
	type LineData,
	type UTCTimestamp,
	type IPaneApi,
	type Time,
} from "lightweight-charts";
import {
	chartOptions,
	candlestickOptions,
	ema9Options,
	ema21Options,
	volumeOptions,
	cvdLineOptions,
	cvdPriceScale,
	volumeDeltaOptions,
	rsiOptions,
	rsiOverboughtOptions,
	rsiOversoldOptions,
} from "../lib/chart/options";
import {
	initEMA,
	updateEMA,
	initRSI,
	updateRSI,
	type EMAState,
	type RSIState,
} from "../lib/chart/indicators";
import { floorTimestampToTimeframe } from "../lib/chart/grouping";
import { aggregatorService } from "../services/aggregatorService";
import { formatAmount } from "../services/productsService";
import type { ChartPanels } from "../stores/chartSettingsStore";
import type { Trade } from "shared";

export interface BarState {
	open: number;
	high: number;
	low: number;
	close: number;
	time: UTCTimestamp;
	buyVolume: number;
	sellVolume: number;
}

export interface ChartLegend {
	price: string;
	open: string;
	high: string;
	low: string;
	close: string;
	buyVol: string;
	sellVol: string;
	cvd: string;
	delta: string;
	ema9: string;
	ema21: string;
	rsi: string;
}

export const TIMEFRAME_MAP: Record<string, number> = {
	"5s": 5,
	"10s": 10,
	"15s": 15,
	"30s": 30,
	"1m": 60,
	"3m": 180,
	"5m": 300,
	"15m": 900,
	"1h": 3600,
};

function fmtPrice(n: number): string {
	return n.toLocaleString(undefined, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
}

export function useChart(
	containerRef: RefObject<HTMLDivElement | null>,
	timeframe: string,
	panels: ChartPanels,
	onLegendUpdate?: (legend: ChartLegend) => void,
) {
	const chartRef = useRef<IChartApi | null>(null);
	const currentBarRef = useRef<BarState | null>(null);
	const cvdRef = useRef<number>(0);
	const queueRef = useRef<Trade[]>([]);
	const timerRef = useRef<number>(0);
	const legendCbRef = useRef(onLegendUpdate);
	legendCbRef.current = onLegendUpdate;
	const isHoveringRef = useRef(false);
	const panelsRef = useRef(panels);
	panelsRef.current = panels;

	// Refs for optional series/panes that get toggled
	const volumePaneRef = useRef<IPaneApi<Time> | null>(null);
	const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const cvdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
	const deltaPaneRef = useRef<IPaneApi<Time> | null>(null);
	const deltaSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
	const rsiPaneRef = useRef<IPaneApi<Time> | null>(null);
	const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
	const rsiOBSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
	const rsiOSSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

	const timeframeSec = TIMEFRAME_MAP[timeframe] || 5;

	// Effect to toggle pane visibility without recreating chart
	useEffect(() => {
		const chart = chartRef.current;
		if (!chart) return;

		const SUB_PANE_SIZE = 0.12;

		function findPaneIndex(
			c: IChartApi,
			pane: IPaneApi<Time>,
		): number {
			return c.panes().indexOf(pane);
		}

		// Volume pane
		if (panels.volume && !volumePaneRef.current) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			volumeSeriesRef.current = pane.addSeries(HistogramSeries, volumeOptions);
			cvdSeriesRef.current = pane.addSeries(LineSeries, cvdLineOptions);
			cvdSeriesRef.current.priceScale().applyOptions(cvdPriceScale);
			volumePaneRef.current = pane;
		} else if (!panels.volume && volumePaneRef.current) {
			const idx = findPaneIndex(chart, volumePaneRef.current);
			if (idx > 0) chart.removePane(idx);
			volumePaneRef.current = null;
			volumeSeriesRef.current = null;
			cvdSeriesRef.current = null;
		}

		// Delta pane
		if (panels.delta && !deltaPaneRef.current) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			deltaSeriesRef.current = pane.addSeries(
				HistogramSeries,
				volumeDeltaOptions,
			);
			deltaPaneRef.current = pane;
		} else if (!panels.delta && deltaPaneRef.current) {
			const idx = findPaneIndex(chart, deltaPaneRef.current);
			if (idx > 0) chart.removePane(idx);
			deltaPaneRef.current = null;
			deltaSeriesRef.current = null;
		}

		// RSI pane
		if (panels.rsi && !rsiPaneRef.current) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			rsiSeriesRef.current = pane.addSeries(LineSeries, rsiOptions);
			rsiOBSeriesRef.current = pane.addSeries(
				LineSeries,
				rsiOverboughtOptions,
			);
			rsiOSSeriesRef.current = pane.addSeries(LineSeries, rsiOversoldOptions);
			rsiPaneRef.current = pane;
		} else if (!panels.rsi && rsiPaneRef.current) {
			const idx = findPaneIndex(chart, rsiPaneRef.current);
			if (idx > 0) chart.removePane(idx);
			rsiPaneRef.current = null;
			rsiSeriesRef.current = null;
			rsiOBSeriesRef.current = null;
			rsiOSSeriesRef.current = null;
		}

		// Rebalance main pane stretch
		const subCount =
			(volumePaneRef.current ? 1 : 0) +
			(deltaPaneRef.current ? 1 : 0) +
			(rsiPaneRef.current ? 1 : 0);
		const mainStretch = 1 - subCount * SUB_PANE_SIZE;
		chart.panes()[0].setStretchFactor(mainStretch);
	}, [panels]);

	// Main chart setup — does NOT depend on panels
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		cvdRef.current = 0;

		// Reset pane refs
		volumePaneRef.current = null;
		volumeSeriesRef.current = null;
		cvdSeriesRef.current = null;
		deltaPaneRef.current = null;
		deltaSeriesRef.current = null;
		rsiPaneRef.current = null;
		rsiSeriesRef.current = null;
		rsiOBSeriesRef.current = null;
		rsiOSSeriesRef.current = null;

		// --- Indicator state ---
		const ema9State: EMAState = initEMA(9);
		const ema21State: EMAState = initEMA(21);
		const rsiState: RSIState = initRSI(14);
		let lastCompletedBarTime: UTCTimestamp | null = null;

		// Per-bar indicator values for crosshair lookup (capped to prevent memory leak)
		const MAX_BAR_INDICATORS = 500;
		const barIndicators = new Map<
			UTCTimestamp,
			{
				ema9: number;
				ema21: number;
				rsi: number;
				cvd: number;
				buyVol: number;
				sellVol: number;
				delta: number;
			}
		>();

		let latestEma9 = NaN;
		let latestEma21 = NaN;
		let latestRsi = NaN;

		const chart = createChart(container, {
			...chartOptions,
			width: container.clientWidth,
			height: container.clientHeight,
			autoSize: true,
		});

		// === Main pane (0) — candlesticks + EMA ===
		const mainPane = chart.panes()[0];

		createTextWatermark(mainPane, {
			horzAlign: "center",
			vertAlign: "center",
			lines: [
				{
					text: `BTCUSD | ${timeframe}`,
					color: "rgba(255, 255, 255, 0.06)",
					fontSize: 48,
				},
			],
		});
		const candleSeries = mainPane.addSeries(
			CandlestickSeries,
			candlestickOptions,
		);
		const ema9Series = mainPane.addSeries(LineSeries, ema9Options);
		const ema21Series = mainPane.addSeries(LineSeries, ema21Options);

		// Create initial sub-panes based on current panels
		const SUB_PANE_SIZE = 0.12;
		const p = panelsRef.current;
		if (p.volume) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			volumeSeriesRef.current = pane.addSeries(HistogramSeries, volumeOptions);
			cvdSeriesRef.current = pane.addSeries(LineSeries, cvdLineOptions);
			cvdSeriesRef.current.priceScale().applyOptions(cvdPriceScale);
			volumePaneRef.current = pane;
		}
		if (p.delta) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			deltaSeriesRef.current = pane.addSeries(
				HistogramSeries,
				volumeDeltaOptions,
			);
			deltaPaneRef.current = pane;
		}
		if (p.rsi) {
			const pane = chart.addPane();
			pane.setStretchFactor(SUB_PANE_SIZE);
			rsiSeriesRef.current = pane.addSeries(LineSeries, rsiOptions);
			rsiOBSeriesRef.current = pane.addSeries(
				LineSeries,
				rsiOverboughtOptions,
			);
			rsiOSSeriesRef.current = pane.addSeries(LineSeries, rsiOversoldOptions);
			rsiPaneRef.current = pane;
		}

		const subCount =
			(p.volume ? 1 : 0) + (p.delta ? 1 : 0) + (p.rsi ? 1 : 0);
		mainPane.setStretchFactor(1 - subCount * SUB_PANE_SIZE);

		chartRef.current = chart;
		currentBarRef.current = null;

		// --- Crosshair hover → update legend ---
		chart.subscribeCrosshairMove((param) => {
			if (
				!param.point ||
				!param.time ||
				param.point.x < 0 ||
				param.point.y < 0
			) {
				isHoveringRef.current = false;
				return;
			}

			isHoveringRef.current = true;

			const candle = param.seriesData.get(candleSeries) as
				| CandlestickData<UTCTimestamp>
				| undefined;

			const barTime = param.time as UTCTimestamp;
			const stored = barIndicators.get(barTime);

			if (candle && "close" in candle && legendCbRef.current) {
				const ema9Data = param.seriesData.get(ema9Series) as
					| LineData<UTCTimestamp>
					| undefined;
				const ema21Data = param.seriesData.get(ema21Series) as
					| LineData<UTCTimestamp>
					| undefined;

				let rsiVal = "—";
				if (rsiSeriesRef.current) {
					const rd = param.seriesData.get(rsiSeriesRef.current) as
						| LineData<UTCTimestamp>
						| undefined;
					if (rd && !Number.isNaN(rd.value)) rsiVal = rd.value.toFixed(1);
				}

				let cvdVal = "—";
				if (cvdSeriesRef.current) {
					const cd = param.seriesData.get(cvdSeriesRef.current) as
						| LineData<UTCTimestamp>
						| undefined;
					if (cd) cvdVal = formatAmount(cd.value);
				}

				legendCbRef.current({
					price: fmtPrice(candle.close),
					open: fmtPrice(candle.open),
					high: fmtPrice(candle.high),
					low: fmtPrice(candle.low),
					close: fmtPrice(candle.close),
					buyVol: stored ? formatAmount(stored.buyVol) : "—",
					sellVol: stored ? formatAmount(stored.sellVol) : "—",
					cvd: cvdVal,
					delta: stored ? formatAmount(stored.delta) : "—",
					ema9:
						ema9Data && !Number.isNaN(ema9Data.value)
							? fmtPrice(ema9Data.value)
							: "—",
					ema21:
						ema21Data && !Number.isNaN(ema21Data.value)
							? fmtPrice(ema21Data.value)
							: "—",
					rsi: rsiVal,
				});
			}
		});

		// --- Scheduling: use rAF when visible, setTimeout when hidden ---
		let isPageVisible = !document.hidden;
		let stopped = false;

		function onVisibilityChange() {
			isPageVisible = !document.hidden;
		}
		document.addEventListener("visibilitychange", onVisibilityChange);

		function scheduleNext() {
			if (stopped) return;
			if (isPageVisible) {
				timerRef.current = requestAnimationFrame(releaseQueue);
			} else {
				timerRef.current = window.setTimeout(releaseQueue, 100);
			}
		}

		// --- Trade processing + indicator computation ---
		function releaseQueue() {
			const trades = queueRef.current;
			if (!trades.length) {
				scheduleNext();
				return;
			}
			queueRef.current = [];

			for (const trade of trades) {
				if (!trade.price || !trade.size) continue;

				const barTime = floorTimestampToTimeframe(
					trade.timestamp / 1000,
					timeframeSec,
				) as UTCTimestamp;

				const vol = trade.amount || trade.price * trade.size;
				const current = currentBarRef.current;

				cvdRef.current += trade.side === "buy" ? vol : -vol;

				if (!current || current.time < barTime) {
					// --- New bar: finalize previous bar's indicators ---
					if (current && current.time !== lastCompletedBarTime) {
						lastCompletedBarTime = current.time;
						updateEMA(ema9State, current.close);
						updateEMA(ema21State, current.close);
						updateRSI(rsiState, current.close);
						latestEma9 = ema9State.value;
						latestEma21 = ema21State.value;
						latestRsi = rsiState.value;
					}

					currentBarRef.current = {
						open: trade.price,
						high: trade.price,
						low: trade.price,
						close: trade.price,
						time: barTime,
						buyVolume: trade.side === "buy" ? vol : 0,
						sellVolume: trade.side === "sell" ? vol : 0,
					};
				} else {
					current.high = Math.max(current.high, trade.price);
					current.low = Math.min(current.low, trade.price);
					current.close = trade.price;
					if (trade.side === "buy") {
						current.buyVolume += vol;
					} else {
						current.sellVolume += vol;
					}
				}
			}

			const bar = currentBarRef.current;
			if (bar) {
				// Update candle
				candleSeries.update({
					time: bar.time,
					open: bar.open,
					high: bar.high,
					low: bar.low,
					close: bar.close,
				} as CandlestickData<UTCTimestamp>);

				const totalVolume = bar.buyVolume + bar.sellVolume;
				const isBullish = bar.buyVolume >= bar.sellVolume;
				const delta = bar.buyVolume - bar.sellVolume;

				// Volume + CVD (via refs — works even if toggled after creation)
				if (volumeSeriesRef.current) {
					volumeSeriesRef.current.update({
						time: bar.time,
						value: totalVolume,
						color: isBullish
							? "rgba(8, 153, 129, 0.5)"
							: "rgba(229, 57, 53, 0.5)",
					} as HistogramData<UTCTimestamp>);
				}
				if (cvdSeriesRef.current) {
					cvdSeriesRef.current.update({
						time: bar.time,
						value: cvdRef.current,
					} as LineData<UTCTimestamp>);
				}

				// Volume Delta
				if (deltaSeriesRef.current) {
					deltaSeriesRef.current.update({
						time: bar.time,
						value: delta,
						color:
							delta >= 0
								? "rgba(8, 153, 129, 0.7)"
								: "rgba(229, 57, 53, 0.7)",
					} as HistogramData<UTCTimestamp>);
				}

				// Live EMA preview
				const liveEma9 = !Number.isNaN(latestEma9)
					? bar.close * ema9State.k + latestEma9 * (1 - ema9State.k)
					: NaN;
				const liveEma21 = !Number.isNaN(latestEma21)
					? bar.close * ema21State.k + latestEma21 * (1 - ema21State.k)
					: NaN;

				if (!Number.isNaN(liveEma9)) {
					ema9Series.update({
						time: bar.time,
						value: liveEma9,
					} as LineData<UTCTimestamp>);
				}
				if (!Number.isNaN(liveEma21)) {
					ema21Series.update({
						time: bar.time,
						value: liveEma21,
					} as LineData<UTCTimestamp>);
				}

				// Live RSI preview
				const liveRsi = !Number.isNaN(latestRsi) ? latestRsi : NaN;
				if (!Number.isNaN(liveRsi) && rsiSeriesRef.current) {
					rsiSeriesRef.current.update({
						time: bar.time,
						value: liveRsi,
					} as LineData<UTCTimestamp>);
					rsiOBSeriesRef.current?.update({
						time: bar.time,
						value: 70,
					} as LineData<UTCTimestamp>);
					rsiOSSeriesRef.current?.update({
						time: bar.time,
						value: 30,
					} as LineData<UTCTimestamp>);
				}

				// Store indicator values for crosshair lookup, evict oldest if over limit
				barIndicators.set(bar.time, {
					ema9: liveEma9,
					ema21: liveEma21,
					rsi: liveRsi,
					cvd: cvdRef.current,
					buyVol: bar.buyVolume,
					sellVol: bar.sellVolume,
					delta,
				});
				if (barIndicators.size > MAX_BAR_INDICATORS) {
					const oldest = barIndicators.keys().next().value;
					if (oldest !== undefined) barIndicators.delete(oldest);
				}

				// Update legend (only if not hovering)
				if (!isHoveringRef.current && legendCbRef.current) {
					legendCbRef.current({
						price: fmtPrice(bar.close),
						open: fmtPrice(bar.open),
						high: fmtPrice(bar.high),
						low: fmtPrice(bar.low),
						close: fmtPrice(bar.close),
						buyVol: formatAmount(bar.buyVolume),
						sellVol: formatAmount(bar.sellVolume),
						cvd: formatAmount(cvdRef.current),
						delta: formatAmount(delta),
						ema9: !Number.isNaN(liveEma9) ? fmtPrice(liveEma9) : "—",
						ema21: !Number.isNaN(liveEma21) ? fmtPrice(liveEma21) : "—",
						rsi: !Number.isNaN(liveRsi) ? liveRsi.toFixed(1) : "—",
					});
				}
			}

			scheduleNext();
		}

		scheduleNext();

		const MAX_QUEUE = 5000;
		const handleTrades = (trades: Trade[]) => {
			const queue = queueRef.current;
			Array.prototype.push.apply(queue, trades);
			// Drop oldest trades if queue grows too large (e.g. hidden tab)
			if (queue.length > MAX_QUEUE) {
				queueRef.current = queue.slice(-MAX_QUEUE);
			}
		};
		aggregatorService.on("trades", handleTrades);

		return () => {
			stopped = true;
			aggregatorService.off("trades", handleTrades);
			cancelAnimationFrame(timerRef.current);
			clearTimeout(timerRef.current);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			chart.remove();
			chartRef.current = null;
			currentBarRef.current = null;
			queueRef.current = [];
		};
	}, [containerRef, timeframeSec, timeframe]);

	return { chartRef };
}
