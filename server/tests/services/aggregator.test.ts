import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { AggregatorPayload, Trade } from "shared";
import Aggregator from "../../src/services/aggregator";
import settings from "../../src/config/settings";

// Snapshot defaults
const SETTINGS_SNAPSHOT = { ...settings };

let agg: Aggregator;
let broadcasts: AggregatorPayload[];

function makeTrade(overrides: Partial<Trade> = {}): Trade {
	return {
		exchange: "BINANCE",
		pair: "btcusdt",
		timestamp: Date.now(),
		price: 50_000,
		size: 1,
		side: "buy",
		...overrides,
	};
}

beforeEach(() => {
	Object.assign(settings, SETTINGS_SNAPSHOT);
	broadcasts = [];
	agg = new Aggregator((p) => broadcasts.push(p));
});

afterEach(() => {
	// Prevent timer leaks
	clearTimeout((agg as any)._tickersInterval);
	clearInterval((agg as any)._aggrInterval);
	clearTimeout((agg as any)._connectionChangeNoticeTimeout);
	(agg as any)._tickersInterval = null;
	(agg as any)._aggrInterval = null;
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------
describe("constructor", () => {
	it("starts with empty connections", () => {
		expect(agg.connections).toEqual({});
		expect(agg.connectionsCount).toBe(0);
	});

	it("starts with empty tickers", () => {
		expect(agg.tickers).toEqual({});
	});

	it("stores the broadcast function", () => {
		expect(typeof agg.broadcast).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// onSubscribed / onUnsubscribed
// ---------------------------------------------------------------------------
describe("onSubscribed", () => {
	it("creates connection + ticker entries", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		expect(agg.connections["BINANCE:btcusdt"]).toBeDefined();
		expect(agg.connections["BINANCE:btcusdt"].exchange).toBe("BINANCE");
		expect(agg.connections["BINANCE:btcusdt"].pair).toBe("btcusdt");

		const t = agg.tickers["BINANCE:btcusdt"];
		expect(t.volume).toBe(0);
		expect(t.volumeDelta).toBe(0);
		expect(t.price).toBeNull();
		expect(t.initialPrice).toBeNull();
	});

	it("increments connectionsCount", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		agg.onSubscribed("BINANCE", "ethusdt", "wss://x.com");
		expect(agg.connectionsCount).toBe(2);
	});

	it("broadcasts 'connection' event", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		const ev = broadcasts.find((b) => b.op === "connection");
		expect(ev).toBeDefined();
		expect((ev!.data as any).exchangeId).toBe("BINANCE");
		expect((ev!.data as any).pair).toBe("btcusdt");
	});

	it("is idempotent — does not duplicate", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		const n = broadcasts.filter((b) => b.op === "connection").length;
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		expect(broadcasts.filter((b) => b.op === "connection").length).toBe(n);
	});
});

describe("onUnsubscribed", () => {
	it("removes connection + ticker", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		agg.onUnsubscribed("BINANCE", "btcusdt");
		expect(agg.connections["BINANCE:btcusdt"]).toBeUndefined();
		expect(agg.tickers["BINANCE:btcusdt"]).toBeUndefined();
	});

	it("decrements connectionsCount", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		agg.onSubscribed("BINANCE", "ethusdt", "wss://x.com");
		agg.onUnsubscribed("BINANCE", "btcusdt");
		expect(agg.connectionsCount).toBe(1);
	});

	it("broadcasts 'disconnection' event", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		broadcasts = [];
		agg.onUnsubscribed("BINANCE", "btcusdt");
		expect(broadcasts.find((b) => b.op === "disconnection")).toBeDefined();
	});

	it("no-op for non-existent connection", () => {
		const before = broadcasts.length;
		agg.onUnsubscribed("BINANCE", "nonexistent");
		const after = broadcasts.slice(before);
		expect(after.filter((b) => b.op === "disconnection")).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// emitTrades (non-aggregated mode)
// ---------------------------------------------------------------------------
describe("emitTrades", () => {
	beforeEach(() => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		broadcasts = [];
	});

	it("broadcasts trades for connected markets", () => {
		agg.emitTrades([makeTrade()]);
		expect(broadcasts.find((b) => b.op === "trades")).toBeDefined();
	});

	it("updates ticker price and volume", () => {
		agg.emitTrades([makeTrade({ price: 60_000, size: 2 })]);
		const t = agg.tickers["BINANCE:btcusdt"];
		expect(t.price).toBe(60_000);
		expect(t.volume).toBeGreaterThan(0);
		expect(t.updated).toBe(true);
	});

	it("skips trades for unconnected markets", () => {
		agg.emitTrades([makeTrade({ exchange: "KRAKEN" })]);
		expect(agg.tickers["BINANCE:btcusdt"].price).toBeNull();
	});

	it("skips trades with zero size", () => {
		agg.emitTrades([makeTrade({ size: 0 })]);
		expect(agg.tickers["BINANCE:btcusdt"].price).toBeNull();
	});

	it("skips trades with zero price", () => {
		agg.emitTrades([makeTrade({ price: 0 })]);
		expect(agg.tickers["BINANCE:btcusdt"].price).toBeNull();
	});

	it("defaults count to 1 when missing", () => {
		const t = makeTrade();
		delete t.count;
		agg.emitTrades([t]);
		expect(t.count).toBe(1);
	});

	it("emits initial price on first trade", () => {
		agg.emitTrades([makeTrade({ price: 42_000 })]);
		const ev = broadcasts.find((b) => b.op === "price");
		expect(ev).toBeDefined();
		expect((ev!.data as any).price).toBe(42_000);
		expect(agg.tickers["BINANCE:btcusdt"].initialPrice).toBe(42_000);
	});

	it("does NOT emit initial price on subsequent trades", () => {
		agg.emitTrades([makeTrade({ price: 42_000 })]);
		broadcasts = [];
		agg.emitTrades([makeTrade({ price: 43_000 })]);
		expect(broadcasts.find((b) => b.op === "price")).toBeUndefined();
	});

	it("positive volumeDelta for buys", () => {
		agg.emitTrades([makeTrade({ side: "buy" })]);
		expect(agg.tickers["BINANCE:btcusdt"].volumeDelta).toBeGreaterThan(0);
	});

	it("negative volumeDelta for sells", () => {
		agg.emitTrades([makeTrade({ side: "sell" })]);
		expect(agg.tickers["BINANCE:btcusdt"].volumeDelta).toBeLessThan(0);
	});

	it("processes multiple trades in one call", () => {
		agg.emitTrades([
			makeTrade({ price: 50_000, size: 1 }),
			makeTrade({ price: 51_000, size: 2 }),
		]);
		expect(agg.tickers["BINANCE:btcusdt"].price).toBe(51_000);
	});
});

// ---------------------------------------------------------------------------
// processTrade — amount calculation
// ---------------------------------------------------------------------------
describe("processTrade – amount", () => {
	beforeEach(() => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		broadcasts = [];
	});

	it("amount = avgPrice * size when preferQuoteCurrencySize=true", () => {
		settings.preferQuoteCurrencySize = true;
		const t = makeTrade({ price: 50_000, size: 2 });
		agg.emitTrades([t]);
		expect(t.amount).toBe(100_000);
	});

	it("amount = size when preferQuoteCurrencySize=false", () => {
		settings.preferQuoteCurrencySize = false;
		const t = makeTrade({ price: 50_000, size: 2 });
		agg.emitTrades([t]);
		expect(t.amount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// processTrade — slippage
// ---------------------------------------------------------------------------
describe("processTrade – slippage", () => {
	beforeEach(() => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		// Set a known ticker price first
		agg.tickers["BINANCE:btcusdt"].price = 50_000;
		broadcasts = [];
	});

	it("calculates price-mode slippage", () => {
		settings.calculateSlippage = "price";
		const t = makeTrade({ price: 50_100 });
		agg.emitTrades([t]);
		expect(t.originalPrice).toBe(50_000);
		expect(t.slippage).toBeDefined();
		expect(typeof t.slippage).toBe("number");
	});

	it("zeroes tiny price-mode slippage", () => {
		settings.calculateSlippage = "price";
		// price == originalPrice → slippage ≈ 0
		const t = makeTrade({ price: 50_000 });
		agg.emitTrades([t]);
		expect(t.slippage).toBe(0);
	});

	it("calculates bps-mode slippage", () => {
		settings.calculateSlippage = "bps";
		const t = makeTrade({ price: 50_050 });
		agg.emitTrades([t]);
		// bps = ((50050 - 50000) / 50000) * 10000 = 10
		expect(t.slippage).toBe(10);
	});

	it("does not set slippage when calculateSlippage is null", () => {
		settings.calculateSlippage = null;
		const t = makeTrade({ price: 51_000 });
		agg.emitTrades([t]);
		expect(t.slippage).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// emitLiquidations
// ---------------------------------------------------------------------------
describe("emitLiquidations", () => {
	beforeEach(() => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		broadcasts = [];
	});

	it("broadcasts liquidation trades", () => {
		agg.emitLiquidations([makeTrade({ liquidation: true })]);
		expect(broadcasts.find((b) => b.op === "trades")).toBeDefined();
	});

	it("calculates amount on liquidation", () => {
		settings.preferQuoteCurrencySize = true;
		const t = makeTrade({ price: 50_000, size: 3, liquidation: true });
		agg.emitLiquidations([t]);
		expect(t.amount).toBe(150_000);
	});

	it("skips liquidations for unconnected markets", () => {
		const t = makeTrade({ exchange: "UNKNOWN", liquidation: true });
		agg.emitLiquidations([t]);
		expect(t.amount).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// aggregateTrades (aggregation mode)
// ---------------------------------------------------------------------------
describe("aggregateTrades", () => {
	beforeEach(() => {
		settings.aggregationLength = 100;
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		// Need to rebind so aggregation mode kicks in
		agg.bindTradesEvent();
		broadcasts = [];
	});

	it("accumulates same-side trades within the aggregation window", () => {
		const now = Date.now();
		agg.aggregateTrades([
			makeTrade({ timestamp: now, price: 50_000, size: 1, side: "buy" }),
		]);
		agg.aggregateTrades([
			makeTrade({ timestamp: now + 10, price: 50_010, size: 2, side: "buy" }),
		]);
		// Still aggregating — no pending trades emitted yet
		const ongoing = (agg as any).onGoingAggregations["BINANCE:btcusdt"];
		expect(ongoing).toBeDefined();
		expect(ongoing.size).toBe(3);
		expect(ongoing.count).toBe(2);
	});

	it("flushes aggregation when side changes", () => {
		const now = Date.now();
		agg.aggregateTrades([
			makeTrade({ timestamp: now, price: 50_000, size: 1, side: "buy" }),
		]);
		agg.aggregateTrades([
			makeTrade({ timestamp: now + 10, price: 50_000, size: 1, side: "sell" }),
		]);
		// The buy should have been pushed to pending
		const pending = (agg as any).pendingTrades;
		expect(pending.length).toBeGreaterThanOrEqual(1);
	});

	it("flushes aggregation when timestamp exceeds window", () => {
		const now = Date.now();
		agg.aggregateTrades([
			makeTrade({ timestamp: now, price: 50_000, size: 1 }),
		]);
		agg.aggregateTrades([
			makeTrade({ timestamp: now + 200, price: 50_000, size: 1 }),
		]);
		const pending = (agg as any).pendingTrades;
		expect(pending.length).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// emitPendingTrades
// ---------------------------------------------------------------------------
describe("emitPendingTrades", () => {
	it("broadcasts and clears pending trades", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		(agg as any).pendingTrades = [makeTrade()];
		broadcasts = [];
		agg.emitPendingTrades();
		expect(broadcasts.find((b) => b.op === "trades")).toBeDefined();
		expect((agg as any).pendingTrades).toHaveLength(0);
	});

	it("does nothing when no pending trades", () => {
		broadcasts = [];
		agg.emitPendingTrades();
		expect(broadcasts.find((b) => b.op === "trades")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// configureAggregator
// ---------------------------------------------------------------------------
describe("configureAggregator", () => {
	it("updates a known setting", () => {
		agg.configureAggregator({ key: "preferQuoteCurrencySize", value: false });
		expect(settings.preferQuoteCurrencySize).toBe(false);
	});

	it("no-op for unknown key", () => {
		expect(() =>
			agg.configureAggregator({ key: "fakeKey", value: 42 }),
		).not.toThrow();
	});

	it("no-op when value is unchanged", () => {
		settings.preferQuoteCurrencySize = true;
		const before = broadcasts.length;
		agg.configureAggregator({ key: "preferQuoteCurrencySize", value: true });
		// No extra broadcasts expected
		expect(broadcasts.length).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// getAllTickers
// ---------------------------------------------------------------------------
describe("getAllTickers", () => {
	it("broadcasts all tickers with the given trackingId", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		agg.tickers["BINANCE:btcusdt"].price = 60_000;
		broadcasts = [];

		agg.getAllTickers(null, "track-42");

		const ev = broadcasts.find((b) => b.op === "getAllTickers");
		expect(ev).toBeDefined();
		expect(ev!.trackingId).toBe("track-42");
		expect(ev!.data).toBe(agg.tickers);
	});
});

// ---------------------------------------------------------------------------
// refreshTickersDelay
// ---------------------------------------------------------------------------
describe("refreshTickersDelay", () => {
	it("returns a positive number", () => {
		expect(agg.refreshTickersDelay()).toBeGreaterThan(0);
	});

	it("grows with more connections", () => {
		agg.onSubscribed("BINANCE", "btcusdt", "wss://x.com");
		const d1 = agg.refreshTickersDelay();
		for (let i = 0; i < 20; i++)
			agg.onSubscribed("BINANCE", `p${i}`, "wss://x.com");
		expect(agg.refreshTickersDelay()).toBeGreaterThan(d1);
	});
});

// ---------------------------------------------------------------------------
// onError
// ---------------------------------------------------------------------------
describe("onError", () => {
	it("broadcasts notice + error for string error", () => {
		broadcasts = [];
		agg.onError("BINANCE", "Connection reset");

		expect(broadcasts.find((b) => b.op === "notice")).toBeDefined();
		expect(broadcasts.find((b) => b.op === "error")).toBeDefined();
	});

	it("broadcasts error details for ApiEventError-like objects", () => {
		broadcasts = [];
		agg.onError("BINANCE", {
			message: "WS err",
			target: {
				_wasOpened: true,
				_originalUrl: "wss://x.com",
				_errored: true,
				url: "wss://x.com",
			},
		} as any);

		const err = broadcasts.find((b) => b.op === "error");
		expect(err).toBeDefined();
		expect((err!.data as any).wasOpened).toBe(true);
		expect((err!.data as any).url).toBe("wss://x.com");
	});

	it("handles event with no message gracefully", () => {
		broadcasts = [];
		agg.onError("BINANCE", {} as any);
		// Should still broadcast error, just no notice with title
		expect(broadcasts.find((b) => b.op === "error")).toBeDefined();
	});
});
