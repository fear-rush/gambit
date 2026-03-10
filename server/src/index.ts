import type { Server } from "bun";
import type { AggregatorPayload } from "shared";
import {
	AGGREGATOR_TOPIC,
	CORS_HEADERS,
	DEFAULT_MARKETS,
} from "./config/constants";
import Aggregator from "./services/aggregator";
import { exchanges } from "./exchanges";
import { buildIndex } from "./services/productIndex";
import {
	handleProductsSearch,
	handleProductsPair,
	handleProductsExchanges,
} from "./routes/products";
import { handleHealth } from "./routes/health";
import { createWsHandlers, type WsData } from "./ws/handlers";

// Server reference for pub/sub broadcasting
let serverRef: Server<WsData>;

function broadcast(payload: AggregatorPayload) {
	serverRef.publish(AGGREGATOR_TOPIC, JSON.stringify(payload));
}

const aggregator = new Aggregator(broadcast);

let productsReady = false;
let productsPromise: Promise<void> | null = null;

async function waitForProducts() {
	if (!productsReady && productsPromise) await productsPromise;
}

const server = Bun.serve<WsData>({
	port: Number(Bun.env.PORT) || 3000,

	routes: {
		"/api/products/search": {
			GET: async (req) => {
				await waitForProducts();
				return handleProductsSearch(req);
			},
		},
		"/api/products/pair": {
			GET: async (req) => {
				await waitForProducts();
				return handleProductsPair(req);
			},
		},
		"/api/products/exchanges": {
			GET: async () => {
				await waitForProducts();
				return handleProductsExchanges();
			},
		},
		"/": handleHealth,
		"/health": handleHealth,
	},

	// Fallback for WebSocket upgrades and CORS preflight
	fetch(req, server) {
		const url = new URL(req.url);

		// CORS preflight
		if (req.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: CORS_HEADERS,
			});
		}

		// Aggregator WebSocket endpoint
		if (url.pathname === "/ws") {
			const upgraded = server.upgrade(req, {
				data: { type: "client" as const },
			});
			if (upgraded) return undefined;
			return new Response("WebSocket upgrade failed", {
				status: 500,
				headers: CORS_HEADERS,
			});
		}

		// WebSocket proxy upgrade
		if (url.pathname === "/ws-proxy") {
			const target = url.searchParams.get("target");
			if (!target) {
				return new Response("Missing target query parameter", {
					status: 400,
					headers: CORS_HEADERS,
				});
			}
			const upgraded = server.upgrade(req, {
				data: { type: "proxy" as const, target, upstream: null },
			});
			if (upgraded) return undefined;
			return new Response("WebSocket upgrade failed", {
				status: 500,
				headers: CORS_HEADERS,
			});
		}

		return new Response("Not Found", {
			status: 404,
			headers: CORS_HEADERS,
		});
	},

	websocket: createWsHandlers(aggregator),
});

serverRef = server;

console.log(`Server running at http://localhost:${server.port}`);

// Fetch products from ALL exchanges on startup so /api/products is complete
async function fetchAllProducts() {
	console.log("[startup] fetching products from all exchanges...");
	const results = await Promise.allSettled(
		exchanges.map((exchange) => exchange.getProducts()),
	);
	const succeeded = results.filter((r) => r.status === "fulfilled").length;
	const failed = results.filter((r) => r.status === "rejected").length;
	console.log(
		`[startup] products fetched: ${succeeded} succeeded, ${failed} failed`,
	);
	buildIndex();
	productsReady = true;
}

productsPromise = fetchAllProducts().then(() => {
	// Auto-connect default markets after products are loaded
	aggregator.connect(DEFAULT_MARKETS);
});

export default server;
