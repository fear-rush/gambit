export type SlippageMode = false | "price" | "bps";
export type AggregationLength = 0 | 1 | 10 | 100 | 1000 | -1;

export interface Trade {
	exchange: string;
	pair: string;
	timestamp: number;
	price: number;
	size: number;
	side: "buy" | "sell";
	originalPrice?: number;
	avgPrice?: number;
	amount?: number;
	count?: number;
	liquidation?: boolean;
	slippage?: number;
}

export interface AggregatedTrade extends Trade {
	value: number;
}

export interface Volumes {
	timestamp: number;
	vbuy: number;
	vsell: number;
	cbuy: number;
	csell: number;
	lbuy: number;
	lsell: number;
}

export interface Connection {
	exchange: string;
	pair: string;
	hit: number;
	timestamp: number;
	bucket?: Volumes;
}

export type ProductsData =
	| string[]
	| { products: string[]; [key: string]: unknown };

export interface ProductsStorage {
	exchange: string;
	timestamp?: number;
	data: ProductsData;
}

export interface Ticker {
	updated?: boolean;
	initialPrice?: number;
	price: number;
	volume?: number;
	volumeDelta?: number;
}
