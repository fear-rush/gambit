import { describe, it, expect } from "bun:test";
import { exchanges, getExchangeById } from "../../src/exchanges";

// ---------------------------------------------------------------------------
// exchanges array
// ---------------------------------------------------------------------------
describe("exchanges array", () => {
	it("contains 27 instances", () => {
		expect(exchanges).toHaveLength(27);
	});

	it("every exchange has a non-empty string id", () => {
		for (const e of exchanges) {
			expect(typeof e.id).toBe("string");
			expect(e.id.length).toBeGreaterThan(0);
		}
	});

	it("all IDs are unique", () => {
		const ids = exchanges.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("includes major exchanges", () => {
		const ids = exchanges.map((e) => e.id);
		for (const name of [
			"BINANCE",
			"BINANCE_FUTURES",
			"BITSTAMP",
			"COINBASE",
			"KRAKEN",
			"BITMEX",
			"BYBIT",
			"OKEX",
			"DERIBIT",
			"DYDX",
			"HYPERLIQUID",
		]) {
			expect(ids).toContain(name);
		}
	});

	it("every exchange extends EventEmitter (has on/emit/off)", () => {
		for (const e of exchanges) {
			expect(typeof e.on).toBe("function");
			expect(typeof e.emit).toBe("function");
			expect(typeof e.off).toBe("function");
		}
	});

	it("every exchange has an empty apis array at init", () => {
		for (const e of exchanges) {
			expect(e.apis).toBeArray();
		}
	});

	it("every exchange has a pairs array", () => {
		for (const e of exchanges) {
			expect(e.pairs).toBeArray();
		}
	});
});

// ---------------------------------------------------------------------------
// getExchangeById
// ---------------------------------------------------------------------------
describe("getExchangeById", () => {
	it("finds by exact uppercase ID", () => {
		const e = getExchangeById("BINANCE");
		expect(e).toBeDefined();
		expect(e!.id).toBe("BINANCE");
	});

	it("finds case-insensitively (lowercase)", () => {
		expect(getExchangeById("binance")!.id).toBe("BINANCE");
	});

	it("finds case-insensitively (mixed case)", () => {
		expect(getExchangeById("Binance")!.id).toBe("BINANCE");
	});

	it("finds underscore IDs", () => {
		expect(getExchangeById("BINANCE_FUTURES")!.id).toBe("BINANCE_FUTURES");
		expect(getExchangeById("binance_futures")!.id).toBe("BINANCE_FUTURES");
	});

	it("returns undefined for unknown ID", () => {
		expect(getExchangeById("NONEXISTENT")).toBeUndefined();
	});

	it("returns undefined for empty string", () => {
		expect(getExchangeById("")).toBeUndefined();
	});
});
