import { describe, it, expect, mock, afterEach } from "bun:test";
import { fetchAndFormatProducts } from "../../src/services/products";

const mockExchange = {
	formatProducts: (data: unknown) => data as string[],
};

// Preserve original fetch and restore after every test
const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Successful fetching
// ---------------------------------------------------------------------------
describe("fetchAndFormatProducts – success", () => {
	it("returns formatted products", async () => {
		globalThis.fetch = mock(async () =>
			Response.json(["btcusdt", "ethusdt"]),
		) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"SUCCESS_TEST",
			["https://api.example.com/products"],
			mockExchange,
			true,
		);
		expect(result).toEqual(["btcusdt", "ethusdt"]);
	});

	it("passes POST method and JSON body when configured", async () => {
		globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
			expect(init.method).toBe("POST");
			expect(init.body).toBe('{"market":"spot"}');
			expect(init.headers).toHaveProperty(
				"Content-Type",
				"application/json",
			);
			return Response.json(["btcusdt"]);
		}) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"POST_TEST",
			[
				{
					url: "https://api.example.com/products",
					method: "POST",
					data: '{"market":"spot"}',
				},
			],
			mockExchange,
			true,
		);
		expect(result).toEqual(["btcusdt"]);
	});

	it("handles multiple endpoints and passes combined data to formatProducts", async () => {
		let callIdx = 0;
		globalThis.fetch = mock(async () => {
			callIdx++;
			return Response.json(callIdx === 1 ? ["a"] : ["b"]);
		}) as typeof fetch;

		const multiExchange = {
			formatProducts: (data: unknown) => {
				// data is the 2-element array
				expect(data).toBeArray();
				return ["merged"];
			},
		};

		const result = await fetchAndFormatProducts(
			"MULTI_OK",
			["https://a.com", "https://b.com"],
			multiExchange,
			true,
		);
		expect(result).toEqual(["merged"]);
	});

	it("wraps a bare string endpoint into an array", async () => {
		globalThis.fetch = mock(async () =>
			Response.json(["ok"]),
		) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"WRAP_TEST",
			"https://api.example.com" as unknown as string[],
			mockExchange,
			true,
		);
		expect(result).toEqual(["ok"]);
	});
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------
describe("fetchAndFormatProducts – caching", () => {
	it("caches on first call and returns cached on second call", async () => {
		let hits = 0;
		globalThis.fetch = mock(async () => {
			hits++;
			return Response.json(["cached"]);
		}) as typeof fetch;

		await fetchAndFormatProducts(
			"CACHE_HIT",
			["https://api.example.com"],
			mockExchange,
			true,
		);
		const second = await fetchAndFormatProducts(
			"CACHE_HIT",
			["https://api.example.com"],
			mockExchange,
			false,
		);
		expect(second).toEqual(["cached"]);
		expect(hits).toBe(1);
	});

	it("bypasses cache when forceFetch is true", async () => {
		let hits = 0;
		globalThis.fetch = mock(async () => {
			hits++;
			return Response.json(["data"]);
		}) as typeof fetch;

		await fetchAndFormatProducts(
			"FORCE_CACHE",
			["https://api.example.com"],
			mockExchange,
			true,
		);
		await fetchAndFormatProducts(
			"FORCE_CACHE",
			["https://api.example.com"],
			mockExchange,
			true,
		);
		expect(hits).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Failure scenarios
// ---------------------------------------------------------------------------
describe("fetchAndFormatProducts – failures", () => {
	it("returns null when fetch throws (network error)", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("Network error");
		}) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"NET_ERR",
			["https://api.example.com"],
			mockExchange,
			true,
		);
		expect(result).toBeNull();
	});

	it("returns null when HTTP status is not ok (500)", async () => {
		globalThis.fetch = mock(
			async () => new Response("Server Error", { status: 500 }),
		) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"HTTP_500",
			["https://api.example.com"],
			mockExchange,
			true,
		);
		expect(result).toBeNull();
	});

	it("returns null when any endpoint in a multi-endpoint set fails", async () => {
		let idx = 0;
		globalThis.fetch = mock(async () => {
			idx++;
			if (idx === 2) throw new Error("fail");
			return Response.json(["ok"]);
		}) as typeof fetch;

		const result = await fetchAndFormatProducts(
			"MULTI_FAIL",
			["https://a.com", "https://b.com"],
			mockExchange,
			true,
		);
		expect(result).toBeNull();
	});

	it("returns null when formatProducts throws", async () => {
		globalThis.fetch = mock(async () =>
			Response.json(["raw"]),
		) as typeof fetch;

		const bad = {
			formatProducts: () => {
				throw new Error("Format failed");
			},
		};

		const result = await fetchAndFormatProducts(
			"FMT_ERR",
			["https://api.example.com"],
			bad,
			true,
		);
		expect(result).toBeNull();
	});

	it("returns null when formatProducts returns falsy", async () => {
		globalThis.fetch = mock(async () =>
			Response.json(["raw"]),
		) as typeof fetch;

		const bad = { formatProducts: () => null as any };

		const result = await fetchAndFormatProducts(
			"FMT_NULL",
			["https://api.example.com"],
			bad,
			true,
		);
		expect(result).toBeNull();
	});
});
