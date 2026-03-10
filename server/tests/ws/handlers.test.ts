import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createWsHandlers } from "../../src/ws/handlers";

function createMockAggregator() {
	return {
		connections: {} as Record<string, any>,
		tickers: {} as Record<string, any>,
		connect: mock(() => {}),
		disconnect: mock(() => {}),
		configureAggregator: mock(() => {}),
		getAllTickers: mock(() => {}),
		formatExchangeProducts: mock(() => {}),
		clearReconnectionTimeout: mock(() => {}),
	};
}

function clientWs() {
	return {
		data: { type: "client" as const },
		subscribe: mock(() => {}),
		unsubscribe: mock(() => {}),
		send: mock(() => {}),
		close: mock(() => {}),
		readyState: 1,
	};
}

function proxyWs() {
	return {
		data: { type: "proxy" as const, target: "wss://up.com", upstream: null },
		subscribe: mock(() => {}),
		unsubscribe: mock(() => {}),
		send: mock(() => {}),
		close: mock(() => {}),
		readyState: 1,
	};
}

let agg: ReturnType<typeof createMockAggregator>;
let handlers: ReturnType<typeof createWsHandlers>;

beforeEach(() => {
	agg = createMockAggregator();
	handlers = createWsHandlers(agg as any);
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
describe("createWsHandlers shape", () => {
	it("returns open, message, close functions", () => {
		expect(typeof handlers.open).toBe("function");
		expect(typeof handlers.message).toBe("function");
		expect(typeof handlers.close).toBe("function");
	});

	it("has idleTimeout 120", () => {
		expect(handlers.idleTimeout).toBe(120);
	});

	it("has maxPayloadLength 1 MiB", () => {
		expect(handlers.maxPayloadLength).toBe(1024 * 1024);
	});

	it("has perMessageDeflate enabled", () => {
		expect(handlers.perMessageDeflate).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// open – client
// ---------------------------------------------------------------------------
describe("open (client)", () => {
	it("subscribes to aggregator topic", () => {
		const ws = clientWs();
		handlers.open(ws as any);
		expect(ws.subscribe).toHaveBeenCalledWith("aggregator");
	});

	it("sends current connections as individual messages", () => {
		agg.connections = {
			"BINANCE:btcusdt": { exchange: "BINANCE", pair: "btcusdt" },
			"BITSTAMP:btcusd": { exchange: "BITSTAMP", pair: "btcusd" },
		};

		const ws = clientWs();
		handlers.open(ws as any);

		const connectionMsgs = ws.send.mock.calls.filter((call: any[]) => {
			const p = JSON.parse(call[0]);
			return p.op === "connection";
		});
		expect(connectionMsgs).toHaveLength(2);
	});

	it("sends tickers when non-empty", () => {
		agg.tickers = { "BINANCE:btcusdt": { price: 50_000 } };

		const ws = clientWs();
		handlers.open(ws as any);

		const tickerMsg = ws.send.mock.calls.find((call: any[]) => {
			return JSON.parse(call[0]).op === "tickers";
		});
		expect(tickerMsg).toBeDefined();
	});

	it("does NOT send tickers when empty", () => {
		agg.tickers = {};

		const ws = clientWs();
		handlers.open(ws as any);

		const tickerMsg = ws.send.mock.calls.find((call: any[]) => {
			return JSON.parse(call[0]).op === "tickers";
		});
		expect(tickerMsg).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// open – proxy
// ---------------------------------------------------------------------------
describe("open (proxy)", () => {
	it("does NOT subscribe to aggregator topic", () => {
		const ws = proxyWs();
		handlers.open(ws as any);
		expect(ws.subscribe).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// message – client
// ---------------------------------------------------------------------------
describe("message (client)", () => {
	it("dispatches connect operation", () => {
		const ws = clientWs();
		handlers.message(
			ws as any,
			JSON.stringify({
				op: "connect",
				data: ["BINANCE:btcusdt"],
				trackingId: "t1",
			}),
		);
		expect(agg.connect).toHaveBeenCalledWith(["BINANCE:btcusdt"], "t1");
	});

	it("dispatches disconnect operation", () => {
		const ws = clientWs();
		handlers.message(
			ws as any,
			JSON.stringify({
				op: "disconnect",
				data: ["BINANCE:btcusdt"],
				trackingId: "t2",
			}),
		);
		expect(agg.disconnect).toHaveBeenCalledWith(["BINANCE:btcusdt"], "t2");
	});

	it("dispatches configureAggregator", () => {
		const ws = clientWs();
		handlers.message(
			ws as any,
			JSON.stringify({
				op: "configureAggregator",
				data: { key: "aggregationLength", value: 100 },
			}),
		);
		expect(agg.configureAggregator).toHaveBeenCalledWith(
			{ key: "aggregationLength", value: 100 },
			undefined,
		);
	});

	it("dispatches getAllTickers", () => {
		const ws = clientWs();
		handlers.message(
			ws as any,
			JSON.stringify({ op: "getAllTickers", trackingId: "t3" }),
		);
		expect(agg.getAllTickers).toHaveBeenCalledWith(undefined, "t3");
	});

	it("dispatches clearReconnectionTimeout", () => {
		const ws = clientWs();
		handlers.message(
			ws as any,
			JSON.stringify({ op: "clearReconnectionTimeout" }),
		);
		expect(agg.clearReconnectionTimeout).toHaveBeenCalled();
	});

	it("handles malformed JSON without throwing", () => {
		const ws = clientWs();
		expect(() => handlers.message(ws as any, "{bad json")).not.toThrow();
	});

	it("ignores unknown ops silently", () => {
		const ws = clientWs();
		expect(() =>
			handlers.message(
				ws as any,
				JSON.stringify({ op: "nonExistent", data: {} }),
			),
		).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// close – client
// ---------------------------------------------------------------------------
describe("close (client)", () => {
	it("unsubscribes from aggregator topic", () => {
		const ws = clientWs();
		handlers.close(ws as any);
		expect(ws.unsubscribe).toHaveBeenCalledWith("aggregator");
	});
});

// ---------------------------------------------------------------------------
// close – proxy
// ---------------------------------------------------------------------------
describe("close (proxy)", () => {
	it("does NOT unsubscribe from aggregator", () => {
		const ws = proxyWs();
		handlers.close(ws as any);
		expect(ws.unsubscribe).not.toHaveBeenCalled();
	});
});
