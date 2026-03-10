import { describe, it, expect } from "bun:test";
import { randomString, parseMarket, getHms, sleep } from "../../src/lib/utils";

// ---------------------------------------------------------------------------
// randomString
// ---------------------------------------------------------------------------
describe("randomString", () => {
	it("defaults to length 16", () => {
		expect(randomString()).toHaveLength(16);
	});

	it("respects a custom length", () => {
		expect(randomString(1)).toHaveLength(1);
		expect(randomString(8)).toHaveLength(8);
		expect(randomString(64)).toHaveLength(64);
	});

	it("returns empty string for length 0", () => {
		expect(randomString(0)).toBe("");
	});

	it("only uses default alphanumeric charset", () => {
		const allowed = "abcdefghijklmnopqrstuvwxyz0123456789";
		const result = randomString(500);
		for (const ch of result) {
			expect(allowed).toContain(ch);
		}
	});

	it("only uses a custom charset when provided", () => {
		const charset = "AB";
		const result = randomString(200, charset);
		for (const ch of result) {
			expect(charset).toContain(ch);
		}
	});

	it("produces unique values (no collisions over 100 runs)", () => {
		const set = new Set<string>();
		for (let i = 0; i < 100; i++) set.add(randomString());
		expect(set.size).toBe(100);
	});
});

// ---------------------------------------------------------------------------
// parseMarket
// ---------------------------------------------------------------------------
describe("parseMarket", () => {
	it("splits EXCHANGE:pair", () => {
		expect(parseMarket("BINANCE:btcusdt")).toEqual(["BINANCE", "btcusdt"]);
	});

	it("preserves case", () => {
		expect(parseMarket("binance:BTCUSDT")).toEqual(["binance", "BTCUSDT"]);
	});

	it("handles extra colons in the pair portion", () => {
		const [exchange, pair] = parseMarket("DERIBIT:BTC:USD");
		expect(exchange).toBe("DERIBIT");
		expect(pair).toBe("BTC:USD");
	});

	it("handles underscored exchange names", () => {
		expect(parseMarket("BINANCE_FUTURES:btcusdt")).toEqual([
			"BINANCE_FUTURES",
			"btcusdt",
		]);
	});
});

// ---------------------------------------------------------------------------
// getHms
// ---------------------------------------------------------------------------
describe("getHms", () => {
	// edge / null cases
	it("returns null for NaN", () => {
		expect(getHms(NaN)).toBeNull();
	});

	it("returns null for null", () => {
		expect(getHms(null as unknown as number)).toBeNull();
	});

	it("returns '0ms' for 0", () => {
		expect(getHms(0)).toBe("0ms");
	});

	// single-unit formatting
	it("formats pure milliseconds", () => {
		expect(getHms(250)).toBe("250ms");
		expect(getHms(999)).toBe("999ms");
	});

	it("formats exact seconds", () => {
		expect(getHms(1000)).toBe("1s");
		expect(getHms(5000)).toBe("5s");
	});

	it("formats exact minutes", () => {
		expect(getHms(60_000)).toBe("1m");
		expect(getHms(300_000)).toBe("5m");
	});

	it("formats exact hours", () => {
		expect(getHms(3_600_000)).toBe("1h");
	});

	it("formats exact days", () => {
		expect(getHms(86_400_000)).toBe("1d");
	});

	// combined units
	it("formats seconds + milliseconds", () => {
		expect(getHms(1500)).toBe("1s, 500ms");
	});

	it("formats minutes + seconds", () => {
		expect(getHms(90_000)).toBe("1m, 30s");
	});

	it("formats days + hours + minutes + seconds", () => {
		const ms = 86_400_000 + 3_600_000 + 60_000 + 5_000;
		expect(getHms(ms)).toBe("1d, 1h, 1m, 5s");
	});

	// negative
	it("prefixes negative values with '-'", () => {
		const result = getHms(-5000);
		expect(result).toContain("-");
		expect(result).toContain("5s");
	});

	// round mode
	it("returns only the largest unit when round=true", () => {
		expect(getHms(86_400_000 + 3_600_000, true)).toBe("1d");
		expect(getHms(3_600_000 + 60_000, true)).toBe("1h");
		expect(getHms(60_000 + 5_000, true)).toBe("1m");
	});

	// custom divider
	it("uses a custom divider between units", () => {
		// The implementation appends `${divider} ` so " and " → " and  "
		expect(getHms(90_000, false, " and ")).toBe("1m and  30s");
	});
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
describe("sleep", () => {
	it("resolves after the specified duration", async () => {
		const t0 = Date.now();
		await sleep(50);
		expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
	});

	it("defaults to ~1000 ms", async () => {
		const t0 = Date.now();
		await sleep();
		expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
	});

	it("resolves to undefined", async () => {
		expect(await sleep(10)).toBeUndefined();
	});
});
