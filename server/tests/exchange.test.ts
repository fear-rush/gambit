import { describe, it, expect, beforeEach } from "bun:test";
import Exchange from "../src/exchange";

// Concrete subclass for testing the abstract-like base
class TestExchange extends Exchange {
	id = "TEST";
	protected endpoints = {};

	getUrl(pair: string): Promise<string> {
		return Promise.resolve(`wss://test.example.com/${pair}`);
	}

	onMessage(): boolean {
		return true;
	}
}

let exchange: TestExchange;

beforeEach(() => {
	exchange = new TestExchange();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------
describe("initial state", () => {
	it("pairs is empty", () => {
		expect(exchange.pairs).toEqual([]);
	});

	it("products is null", () => {
		expect(exchange.products).toBeNull();
	});

	it("apis is empty", () => {
		expect(exchange.apis).toEqual([]);
	});

	it("count is zero", () => {
		expect(exchange.count).toBe(0);
	});

	it("keepAliveIntervals is empty", () => {
		expect(exchange.keepAliveIntervals).toEqual({});
	});

	it("connecting is empty", () => {
		expect(exchange.connecting).toEqual({});
	});

	it("disconnecting is empty", () => {
		expect(exchange.disconnecting).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// requiresProducts
// ---------------------------------------------------------------------------
describe("requiresProducts", () => {
	it("true when products is null and PRODUCTS endpoint exists", () => {
		(exchange as any).endpoints = { PRODUCTS: "https://api.example.com" };
		exchange.products = null;
		expect(exchange.requiresProducts).toBeTruthy();
	});

	it("false when products already loaded", () => {
		(exchange as any).endpoints = { PRODUCTS: "https://api.example.com" };
		exchange.products = ["btcusdt"];
		expect(exchange.requiresProducts).toBeFalsy();
	});

	it("false when no PRODUCTS endpoint defined", () => {
		(exchange as any).endpoints = {};
		exchange.products = null;
		expect(exchange.requiresProducts).toBeFalsy();
	});
});

// ---------------------------------------------------------------------------
// isMatching
// ---------------------------------------------------------------------------
describe("isMatching", () => {
	it("true when pair exists in products", () => {
		exchange.products = ["btcusdt", "ethusdt"];
		expect(exchange.isMatching("btcusdt")).toBe(true);
	});

	it("false when pair not in products", () => {
		exchange.products = ["btcusdt"];
		expect(exchange.isMatching("solusdt")).toBe(false);
	});

	it("false when products is null", () => {
		exchange.products = null;
		expect(exchange.isMatching("btcusdt")).toBe(false);
	});

	it("false when products is empty array", () => {
		exchange.products = [];
		expect(exchange.isMatching("btcusdt")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// setProducts
// ---------------------------------------------------------------------------
describe("setProducts", () => {
	it("sets from array", () => {
		expect(exchange.setProducts(["btcusdt", "ethusdt"])).toBe(true);
		expect(exchange.products).toEqual(["btcusdt", "ethusdt"]);
	});

	it("sets from object with products key", () => {
		expect(
			exchange.setProducts({
				products: ["btcusdt"],
				types: { btcusdt: "spot" },
			}),
		).toBe(true);
		expect(exchange.products).toEqual(["btcusdt"]);
	});

	it("returns null for null data", () => {
		expect(exchange.setProducts(null as any)).toBeNull();
	});

	it("sets products to null for null data", () => {
		exchange.products = ["btcusdt"];
		exchange.setProducts(null as any);
		expect(exchange.products).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// formatProducts / validateProducts defaults
// ---------------------------------------------------------------------------
describe("formatProducts", () => {
	it("returns input data as-is", () => {
		const data = ["btcusdt"];
		expect(exchange.formatProducts(data)).toBe(data);
	});
});

describe("validateProducts", () => {
	it("returns true by default", () => {
		expect(exchange.validateProducts(["anything"])).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// markPairAsConnected
// ---------------------------------------------------------------------------
describe("markPairAsConnected", () => {
	it("moves pair from _pending to _connected", () => {
		const api = { _pending: ["btcusdt"], _connected: [] } as any;
		expect(exchange.markPairAsConnected(api, "btcusdt")).toBe(true);
		expect(api._pending).not.toContain("btcusdt");
		expect(api._connected).toContain("btcusdt");
	});

	it("returns false if pair is not in _pending", () => {
		const api = { _pending: [], _connected: [] } as any;
		expect(exchange.markPairAsConnected(api, "btcusdt")).toBe(false);
	});

	it("returns false if pair already in _connected", () => {
		const api = { _pending: ["btcusdt"], _connected: ["btcusdt"] } as any;
		expect(exchange.markPairAsConnected(api, "btcusdt")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// markPairAsDisconnected
// ---------------------------------------------------------------------------
describe("markPairAsDisconnected", () => {
	it("removes pair from _connected", () => {
		const api = { _pending: [], _connected: ["btcusdt"] } as any;
		expect(exchange.markPairAsDisconnected(api, "btcusdt")).toBe(true);
		expect(api._connected).not.toContain("btcusdt");
	});

	it("returns false and removes from _pending if pair is still pending", () => {
		const api = { _pending: ["btcusdt"], _connected: [] } as any;
		expect(exchange.markPairAsDisconnected(api, "btcusdt")).toBe(false);
		expect(api._pending).not.toContain("btcusdt");
	});

	it("returns false if pair not found anywhere", () => {
		const api = { _pending: [], _connected: [] } as any;
		expect(exchange.markPairAsDisconnected(api, "btcusdt")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getEstimatedTimeToConnect
// ---------------------------------------------------------------------------
describe("getEstimatedTimeToConnect", () => {
	it("returns count when no delay configured", () => {
		(exchange as any).delayBetweenMessages = 0;
		expect(exchange.getEstimatedTimeToConnect(10)).toBe(10);
	});

	it("returns delay * count under maxConnectionsPerApi", () => {
		(exchange as any).delayBetweenMessages = 100;
		(exchange as any).maxConnectionsPerApi = 50;
		expect(exchange.getEstimatedTimeToConnect(5)).toBe(500);
	});

	it("accounts for multi-api split above maxConnectionsPerApi", () => {
		(exchange as any).delayBetweenMessages = 100;
		(exchange as any).maxConnectionsPerApi = 5;
		const time = exchange.getEstimatedTimeToConnect(15);
		expect(time).toBeGreaterThan(0);
		// 3 apis × some factor
	});
});

// ---------------------------------------------------------------------------
// getTimeoutDelay — exponential backoff
// ---------------------------------------------------------------------------
describe("getTimeoutDelay", () => {
	it("starts at minDelay", () => {
		expect(exchange.getTimeoutDelay("wss://a.com")).toBe(1000);
	});

	it("grows by 1.5× each call", () => {
		const d1 = exchange.getTimeoutDelay("wss://b.com");
		const d2 = exchange.getTimeoutDelay("wss://b.com");
		const d3 = exchange.getTimeoutDelay("wss://b.com");
		expect(d1).toBe(1000);
		expect(d2).toBe(1500);
		expect(d3).toBe(2250);
	});

	it("respects a custom minDelay", () => {
		expect(exchange.getTimeoutDelay("wss://c.com", 5000)).toBe(5000);
	});

	it("uses independent timers per URL", () => {
		exchange.getTimeoutDelay("wss://x.com");
		exchange.getTimeoutDelay("wss://x.com");
		// First call for a new URL still starts at minDelay
		expect(exchange.getTimeoutDelay("wss://y.com")).toBe(1000);
	});
});

// ---------------------------------------------------------------------------
// emitTrades / emitLiquidations
// ---------------------------------------------------------------------------
describe("emitTrades", () => {
	it("fires 'trades' event with data", () => {
		let received: any = null;
		exchange.on("trades", (t) => (received = t));
		exchange.emitTrades("src", [
			{
				exchange: "TEST",
				pair: "btcusdt",
				timestamp: Date.now(),
				price: 50_000,
				size: 1,
				side: "buy",
			},
		]);
		expect(received).toHaveLength(1);
	});

	it("does not fire for empty array", () => {
		let fired = false;
		exchange.on("trades", () => (fired = true));
		exchange.emitTrades("src", []);
		expect(fired).toBe(false);
	});

	it("does not fire for null", () => {
		let fired = false;
		exchange.on("trades", () => (fired = true));
		exchange.emitTrades("src", null as any);
		expect(fired).toBe(false);
	});
});

describe("emitLiquidations", () => {
	it("fires 'liquidations' event", () => {
		let received: any = null;
		exchange.on("liquidations", (t) => (received = t));
		exchange.emitLiquidations("src", [
			{
				exchange: "TEST",
				pair: "btcusdt",
				timestamp: Date.now(),
				price: 50_000,
				size: 1,
				side: "sell",
				liquidation: true,
			},
		]);
		expect(received).toHaveLength(1);
	});

	it("does not fire for empty array", () => {
		let fired = false;
		exchange.on("liquidations", () => (fired = true));
		exchange.emitLiquidations("src", []);
		expect(fired).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Event proxies
// ---------------------------------------------------------------------------
describe("event emission helpers", () => {
	it("onOpen emits 'open'", () => {
		let got = false;
		exchange.on("open", () => (got = true));
		exchange.onOpen(new Event("open"), ["btcusdt"]);
		expect(got).toBe(true);
	});

	it("onClose emits 'close'", () => {
		let got = false;
		exchange.on("close", () => (got = true));
		exchange.onClose(new Event("close"), ["btcusdt"]);
		expect(got).toBe(true);
	});

	it("onError emits 'error'", () => {
		let got = false;
		exchange.on("error", () => (got = true));
		exchange.onError({ target: {} } as any);
		expect(got).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// reconnectAllClosedApis
// ---------------------------------------------------------------------------
describe("reconnectAllClosedApis", () => {
	it("returns false when no apis", () => {
		expect(exchange.reconnectAllClosedApis()).toBe(false);
	});

	it("clears scheduledOperationsDelays", () => {
		exchange.scheduledOperationsDelays = { "wss://a.com": 5000 };
		exchange.reconnectAllClosedApis();
		expect(exchange.scheduledOperationsDelays).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// getActiveApiByUrl / getActiveApiByPair
// ---------------------------------------------------------------------------
describe("getActiveApiByUrl / getActiveApiByPair", () => {
	it("returns undefined when no apis", () => {
		expect(exchange.getActiveApiByUrl("wss://x.com")).toBeUndefined();
		expect(exchange.getActiveApiByPair("btcusdt")).toBeUndefined();
	});
});
