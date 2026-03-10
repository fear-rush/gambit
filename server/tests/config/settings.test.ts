import { describe, it, expect, afterEach } from "bun:test";
import settings from "../../src/config/settings";

// Snapshot the original values so tests can mutate safely
const ORIGINAL = { ...settings };

afterEach(() => {
	Object.assign(settings, ORIGINAL);
});

describe("settings defaults", () => {
	it("calculateSlippage defaults to null", () => {
		expect(settings.calculateSlippage).toBeNull();
	});

	it("aggregationLength defaults to null", () => {
		expect(settings.aggregationLength).toBeNull();
	});

	it("preferQuoteCurrencySize defaults to true", () => {
		expect(settings.preferQuoteCurrencySize).toBe(true);
	});

	it("buckets defaults to empty object", () => {
		expect(settings.buckets).toEqual({});
	});
});

describe("settings mutability", () => {
	it("allows calculateSlippage to be changed", () => {
		settings.calculateSlippage = "price";
		expect(settings.calculateSlippage).toBe("price");

		settings.calculateSlippage = "bps";
		expect(settings.calculateSlippage).toBe("bps");
	});

	it("allows aggregationLength to be changed", () => {
		settings.aggregationLength = 100;
		expect(settings.aggregationLength).toBe(100);
	});

	it("allows preferQuoteCurrencySize to be toggled", () => {
		settings.preferQuoteCurrencySize = false;
		expect(settings.preferQuoteCurrencySize).toBe(false);
	});

	it("allows adding bucket entries", () => {
		settings.buckets = { myBucket: ["BINANCE:btcusdt"] };
		expect(settings.buckets!.myBucket).toEqual(["BINANCE:btcusdt"]);
	});
});
