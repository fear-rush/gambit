import { describe, it, expect, beforeAll } from "bun:test";
import {
	handleProductsSearch,
	handleProductsPair,
	handleProductsExchanges,
} from "../../src/routes/products";
import { buildIndex } from "../../src/services/productIndex";
import { exchanges } from "../../src/exchanges";

// Seed a controlled product set before all route tests
beforeAll(() => {
	for (const e of exchanges) e.products = null;

	const binance = exchanges.find((e) => e.id === "BINANCE")!;
	const bitstamp = exchanges.find((e) => e.id === "BITSTAMP")!;
	const bitmex = exchanges.find((e) => e.id === "BITMEX")!;

	binance.products = ["btcusdt", "ethusdt", "solusdt"];
	bitstamp.products = ["btcusd", "ethusd"];
	bitmex.products = ["XBTUSD", "ETHUSD"];

	buildIndex();
});

// ---------------------------------------------------------------------------
// handleProductsSearch
// ---------------------------------------------------------------------------
describe("handleProductsSearch", () => {
	function search(qs = "") {
		return handleProductsSearch(
			new Request(`http://localhost/api/products/search${qs}`),
		);
	}

	it("returns 200 with pairs array", async () => {
		const res = search();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.pairs).toBeArray();
		expect(body.pairs.length).toBeGreaterThan(0);
	});

	it("returns all pairs when no query", async () => {
		const { pairs } = await search().json();
		expect(pairs.length).toBeGreaterThanOrEqual(3);
	});

	it("filters by text query (case-insensitive)", async () => {
		const { pairs } = await search("?q=btc").json();
		for (const p of pairs) expect(p.local).toContain("BTC");
	});

	it("returns empty array for non-matching query", async () => {
		const { pairs } = await search("?q=ZZZZZZZ").json();
		expect(pairs).toEqual([]);
	});

	it("filters by single exchange", async () => {
		const { pairs } = await search("?exchanges=BINANCE").json();
		for (const p of pairs) expect(p.exchanges).toContain("BINANCE");
	});

	it("filters by multiple exchanges", async () => {
		const { pairs } = await search("?exchanges=BINANCE,BITSTAMP").json();
		for (const p of pairs) {
			const hasEither =
				p.exchanges.includes("BINANCE") ||
				p.exchanges.includes("BITSTAMP");
			expect(hasEither).toBe(true);
		}
	});

	it("filters by market type", async () => {
		const { pairs } = await search("?types=perpetual").json();
		for (const p of pairs) expect(p.types).toContain("perpetual");
	});

	it("combines query + exchange + type filters", async () => {
		const { pairs } = await search(
			"?q=BTC&exchanges=BINANCE&types=spot",
		).json();
		for (const p of pairs) {
			expect(p.local).toContain("BTC");
			expect(p.exchanges).toContain("BINANCE");
			expect(p.types).toContain("spot");
		}
	});

	it("includes CORS headers", () => {
		expect(search().headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});

// ---------------------------------------------------------------------------
// handleProductsPair
// ---------------------------------------------------------------------------
describe("handleProductsPair", () => {
	function pair(qs = "") {
		return handleProductsPair(
			new Request(`http://localhost/api/products/pair${qs}`),
		);
	}

	it("returns 400 when local param is missing", async () => {
		const res = pair();
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe("Missing local param");
	});

	it("returns products for valid local pair", async () => {
		const { products } = await pair("?local=BTCUSD").json();
		expect(products).toBeArray();
		expect(products.length).toBeGreaterThan(0);
		for (const p of products) expect(p.local).toBe("BTCUSD");
	});

	it("returns empty array for unknown pair", async () => {
		const { products } = await pair("?local=ZZZZZZZ").json();
		expect(products).toEqual([]);
	});

	it("filters by exchange", async () => {
		const { products } = await pair(
			"?local=BTCUSD&exchanges=BINANCE",
		).json();
		for (const p of products) expect(p.exchange).toBe("BINANCE");
	});

	it("filters by type", async () => {
		const { products } = await pair("?local=BTCUSD&types=spot").json();
		for (const p of products) expect(p.type).toBe("spot");
	});

	it("combines exchange + type filters", async () => {
		const { products } = await pair(
			"?local=BTCUSD&exchanges=BINANCE&types=spot",
		).json();
		for (const p of products) {
			expect(p.exchange).toBe("BINANCE");
			expect(p.type).toBe("spot");
		}
	});

	it("includes CORS headers", () => {
		expect(pair("?local=BTCUSD").headers.get("Access-Control-Allow-Origin")).toBe(
			"*",
		);
	});

	it("product objects have required fields", async () => {
		const { products } = await pair("?local=BTCUSD").json();
		for (const p of products) {
			expect(p).toHaveProperty("id");
			expect(p).toHaveProperty("pair");
			expect(p).toHaveProperty("exchange");
			expect(p).toHaveProperty("local");
			expect(p).toHaveProperty("base");
			expect(p).toHaveProperty("quote");
			expect(p).toHaveProperty("type");
		}
	});
});

// ---------------------------------------------------------------------------
// handleProductsExchanges
// ---------------------------------------------------------------------------
describe("handleProductsExchanges", () => {
	it("returns a sorted array of exchange IDs", async () => {
		const { exchanges: ids } = await handleProductsExchanges().json();
		expect(ids).toBeArray();
		expect(ids.length).toBeGreaterThan(0);
		const sorted = [...ids].sort();
		expect(ids).toEqual(sorted);
	});

	it("includes seeded exchanges", async () => {
		const { exchanges: ids } = await handleProductsExchanges().json();
		expect(ids).toContain("BINANCE");
		expect(ids).toContain("BITSTAMP");
		expect(ids).toContain("BITMEX");
	});

	it("includes CORS headers", () => {
		const res = handleProductsExchanges();
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});
});
