import type {
	ChartOptions,
	DeepPartial,
	CandlestickSeriesOptions,
	HistogramSeriesOptions,
	LineSeriesOptions,
} from "lightweight-charts";

export const chartOptions: DeepPartial<ChartOptions> = {
	layout: {
		background: { color: "transparent" },
		textColor: "rgba(255, 255, 255, 0.4)",
		fontFamily: "'Barlow Semi Condensed', sans-serif",
		panes: {
			separatorColor: "rgba(255, 255, 255, 0.06)",
			separatorHoverColor: "rgba(255, 255, 255, 0.06)",
			enableResize: false,
		},
	},
	grid: {
		vertLines: { visible: false },
		horzLines: { visible: false },
	},
	crosshair: {
		vertLine: {
			color: "rgba(255, 255, 255, 0.2)",
			style: 2,
			labelVisible: true,
		},
		horzLine: {
			color: "rgba(255, 255, 255, 0.2)",
			style: 2,
			labelVisible: true,
		},
		mode: 0,
	},
	rightPriceScale: {
		borderColor: "rgba(255, 255, 255, 0.1)",
	},
	timeScale: {
		borderColor: "rgba(255, 255, 255, 0.1)",
		timeVisible: true,
		secondsVisible: true,
		rightOffset: 8,
		barSpacing: 6,
		minBarSpacing: 1,
	},
};

export const candlestickOptions: DeepPartial<CandlestickSeriesOptions> = {
	upColor: "#089981",
	downColor: "#e53935",
	borderVisible: false,
	borderUpColor: "#089981",
	borderDownColor: "#e53935",
	wickUpColor: "rgba(8, 153, 129, 0.8)",
	wickDownColor: "rgba(229, 57, 53, 0.8)",
	priceLineVisible: true,
	lastValueVisible: true,
};

// --- EMA lines on candle pane ---
export const ema9Options: DeepPartial<LineSeriesOptions> = {
	color: "rgba(255, 195, 0, 0.8)",
	lineWidth: 1,
	priceScaleId: "right",
	lastValueVisible: false,
	priceLineVisible: false,
};

export const ema21Options: DeepPartial<LineSeriesOptions> = {
	color: "rgba(33, 150, 243, 0.8)",
	lineWidth: 1,
	priceScaleId: "right",
	lastValueVisible: false,
	priceLineVisible: false,
};

// --- Volume pane ---
export const volumeOptions: DeepPartial<HistogramSeriesOptions> = {
	priceFormat: { type: "volume" },
	lastValueVisible: false,
	priceLineVisible: false,
};

export const cvdLineOptions: DeepPartial<LineSeriesOptions> = {
	color: "rgba(100, 181, 246, 0.7)",
	lineWidth: 1,
	lastValueVisible: false,
	priceLineVisible: false,
	priceScaleId: "cvd",
};

export const cvdPriceScale = {
	visible: false,
};

// --- Volume Delta pane ---
export const volumeDeltaOptions: DeepPartial<HistogramSeriesOptions> = {
	priceFormat: { type: "volume" },
	lastValueVisible: false,
	priceLineVisible: false,
};

// --- RSI pane ---
export const rsiOptions: DeepPartial<LineSeriesOptions> = {
	color: "rgba(187, 134, 252, 0.9)",
	lineWidth: 1,
	lastValueVisible: false,
	priceLineVisible: false,
};

export const rsiOverboughtOptions: DeepPartial<LineSeriesOptions> = {
	color: "rgba(255, 255, 255, 0.1)",
	lineWidth: 1,
	lineStyle: 2,
	lastValueVisible: false,
	priceLineVisible: false,
	priceScaleId: "right",
};

export const rsiOversoldOptions: DeepPartial<LineSeriesOptions> = {
	color: "rgba(255, 255, 255, 0.1)",
	lineWidth: 1,
	lineStyle: 2,
	lastValueVisible: false,
	priceLineVisible: false,
	priceScaleId: "right",
};
