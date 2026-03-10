import type { AggregationLength, SlippageMode } from "./trade";

export interface AggregatorPayload {
	op: string;
	data?: unknown;
	trackingId?: string;
}

export interface AggregatorSettings {
	aggregationLength: AggregationLength;
	calculateSlippage?: SlippageMode;
	preferQuoteCurrencySize?: boolean;
	wsProxyUrl?: string;
	buckets?: { [bucketId: string]: string[] };
}
