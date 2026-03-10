import { describe, it, expect } from "bun:test";
import {
	AGGREGATOR_TOPIC,
	DEFAULT_MARKETS,
	CORS_HEADERS,
} from "../../src/config/constants";

describe("AGGREGATOR_TOPIC", () => {
	it("equals 'aggregator'", () => {
		expect(AGGREGATOR_TOPIC).toBe("aggregator");
	});
});

describe("DEFAULT_MARKETS", () => {
	it("contains exactly BINANCE:btcusdt and BITSTAMP:btcusd", () => {
		expect(DEFAULT_MARKETS).toEqual(["BINANCE:btcusdt", "BITSTAMP:btcusd"]);
	});

	it("has length 2", () => {
		expect(DEFAULT_MARKETS).toHaveLength(2);
	});

	it("entries follow EXCHANGE:pair format", () => {
		for (const m of DEFAULT_MARKETS) {
			expect(m).toMatch(/^[A-Z]+:[a-z]+$/);
		}
	});
});

describe("CORS_HEADERS", () => {
	it("allows all origins", () => {
		expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
	});

	it("allows GET, POST, OPTIONS", () => {
		expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toBe(
			"GET, POST, OPTIONS",
		);
	});

	it("allows Content-Type header", () => {
		expect(CORS_HEADERS["Access-Control-Allow-Headers"]).toBe(
			"Content-Type",
		);
	});

	it("has exactly 3 header keys", () => {
		expect(Object.keys(CORS_HEADERS)).toHaveLength(3);
	});
});
