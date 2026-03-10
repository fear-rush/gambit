import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "bun";
import { CORS_HEADERS } from "../src/config/constants";
import { handleHealth } from "../src/routes/health";
import {
	handleProductsSearch,
	handleProductsPair,
	handleProductsExchanges,
} from "../src/routes/products";
import { buildIndex } from "../src/services/productIndex";
import { exchanges } from "../src/exchanges";

// Spin up a lightweight test server that mirrors the real routing
// without importing index.ts (which auto-connects to live exchanges).
let server: Server;

beforeAll(() => {
	// Seed products for the route tests
	for (const e of exchanges) e.products = null;
	const binance = exchanges.find((e) => e.id === "BINANCE")!;
	const bitstamp = exchanges.find((e) => e.id === "BITSTAMP")!;
	binance.products = ["btcusdt", "ethusdt"];
	bitstamp.products = ["btcusd"];
	buildIndex();

	server = Bun.serve({
		port: 0, // random available port
		routes: {
			"/api/products/search": {
				GET: (req) => handleProductsSearch(req),
			},
			"/api/products/pair": {
				GET: (req) => handleProductsPair(req),
			},
			"/api/products/exchanges": {
				GET: () => handleProductsExchanges(),
			},
			"/": () => handleHealth(),
			"/health": () => handleHealth(),
		},
		fetch(req) {
			if (req.method === "OPTIONS") {
				return new Response(null, { status: 204, headers: CORS_HEADERS });
			}
			const url = new URL(req.url);
			if (url.pathname === "/ws-proxy" && !url.searchParams.get("target")) {
				return new Response("Missing target query parameter", {
					status: 400,
					headers: CORS_HEADERS,
				});
			}
			return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
		},
	});
});

afterAll(() => {
	server.stop(true);
});

function url(path: string) {
	return `http://localhost:${server.port}${path}`;
}

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------
describe("GET /", () => {
	it("returns 200 with status ok", async () => {
		const res = await fetch(url("/"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(typeof body.uptime).toBe("number");
	});
});

describe("GET /health", () => {
	it("returns 200 with status ok", async () => {
		const res = await fetch(url("/health"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
	});
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
describe("OPTIONS (CORS preflight)", () => {
	it("returns 204 with CORS headers", async () => {
		const res = await fetch(url("/anything"), { method: "OPTIONS" });
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
			"GET, POST, OPTIONS",
		);
		expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
			"Content-Type",
		);
	});
});

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------
describe("GET /unknown", () => {
	it("returns 404", async () => {
		const res = await fetch(url("/does-not-exist"));
		expect(res.status).toBe(404);
		expect(await res.text()).toBe("Not Found");
	});

	it("includes CORS headers on 404", () => {
		return fetch(url("/nope")).then((res) => {
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
		});
	});
});

// ---------------------------------------------------------------------------
// /ws-proxy without target
// ---------------------------------------------------------------------------
describe("GET /ws-proxy (no target)", () => {
	it("returns 400 with helpful message", async () => {
		const res = await fetch(url("/ws-proxy"));
		expect(res.status).toBe(400);
		expect(await res.text()).toBe("Missing target query parameter");
	});
});

// ---------------------------------------------------------------------------
// Products routes via HTTP
// ---------------------------------------------------------------------------
describe("GET /api/products/search", () => {
	it("returns 200 with pairs array", async () => {
		const res = await fetch(url("/api/products/search"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.pairs).toBeArray();
		expect(body.pairs.length).toBeGreaterThan(0);
	});

	it("filters by ?q= text search", async () => {
		const body = await fetch(url("/api/products/search?q=BTC")).then((r) =>
			r.json(),
		);
		for (const p of body.pairs) expect(p.local).toContain("BTC");
	});

	it("returns empty for non-matching query", async () => {
		const body = await fetch(url("/api/products/search?q=ZZZZ")).then(
			(r) => r.json(),
		);
		expect(body.pairs).toEqual([]);
	});
});

describe("GET /api/products/pair", () => {
	it("returns 400 without local param", async () => {
		const res = await fetch(url("/api/products/pair"));
		expect(res.status).toBe(400);
	});

	it("returns products for valid pair", async () => {
		const body = await fetch(url("/api/products/pair?local=BTCUSD")).then(
			(r) => r.json(),
		);
		expect(body.products).toBeArray();
		expect(body.products.length).toBeGreaterThan(0);
	});
});

describe("GET /api/products/exchanges", () => {
	it("returns sorted exchange list", async () => {
		const body = await fetch(url("/api/products/exchanges")).then((r) =>
			r.json(),
		);
		expect(body.exchanges).toBeArray();
		expect(body.exchanges).toContain("BINANCE");
		const sorted = [...body.exchanges].sort();
		expect(body.exchanges).toEqual(sorted);
	});
});
