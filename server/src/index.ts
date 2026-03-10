import type { Server, ServerWebSocket } from "bun";
import type { AggregatorPayload } from "shared";
import Aggregator from "./aggregator";
import { exchanges } from "./exchanges";
import {
	buildIndex,
	searchPairs,
	getProductsForPair,
	getAllExchanges,
} from "./productIndex";
import {
	handleWsOpen,
	handleWsMessage,
	handleWsClose,
	type WsData as ProxyWsData,
} from "./proxy";

type WsData = ProxyWsData | { type: "client" };

const AGGREGATOR_TOPIC = "aggregator";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

// Server reference for pub/sub broadcasting
let serverRef: Server<WsData>;

function broadcast(payload: AggregatorPayload) {
	serverRef.publish(AGGREGATOR_TOPIC, JSON.stringify(payload));
}

const aggregator = new Aggregator(broadcast);

let productsReady = false;
let productsPromise: Promise<void> | null = null;

const server = Bun.serve<WsData>({
	port: Number(process.env.PORT) || 3000,

	async fetch(req, server) {
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

		// REST: search/filter pairs
		if (url.pathname === "/api/products/search") {
			if (!productsReady && productsPromise) await productsPromise;
			const query = url.searchParams.get("q") ?? "";
			const exchangeParam = url.searchParams.get("exchanges");
			const typeParam = url.searchParams.get("types");
			const filterExchanges = exchangeParam
				? exchangeParam.split(",")
				: undefined;
			const filterTypes = typeParam ? typeParam.split(",") : undefined;
			return Response.json(
				{ pairs: searchPairs(query, filterExchanges, filterTypes) },
				{ headers: CORS_HEADERS },
			);
		}

		// REST: get products for a specific pair (expanded view)
		if (url.pathname === "/api/products/pair") {
			if (!productsReady && productsPromise) await productsPromise;
			const local = url.searchParams.get("local");
			if (!local) {
				return Response.json(
					{ error: "Missing local param" },
					{ status: 400, headers: CORS_HEADERS },
				);
			}
			const exchangeParam = url.searchParams.get("exchanges");
			const typeParam = url.searchParams.get("types");
			const filterExchanges = exchangeParam
				? exchangeParam.split(",")
				: undefined;
			const filterTypes = typeParam ? typeParam.split(",") : undefined;
			return Response.json(
				{
					products: getProductsForPair(
						local,
						filterExchanges,
						filterTypes,
					),
				},
				{ headers: CORS_HEADERS },
			);
		}

		// REST: list all exchanges
		if (url.pathname === "/api/products/exchanges") {
			if (!productsReady && productsPromise) await productsPromise;
			return Response.json(
				{ exchanges: getAllExchanges() },
				{ headers: CORS_HEADERS },
			);
		}

		// Health check
		if (url.pathname === "/" || url.pathname === "/health") {
			return Response.json(
				{ status: "ok", uptime: process.uptime() },
				{ headers: CORS_HEADERS },
			);
		}

		return new Response("Not Found", {
			status: 404,
			headers: CORS_HEADERS,
		});
	},

	websocket: {
		idleTimeout: 120,
		maxPayloadLength: 1024 * 1024,
		perMessageDeflate: true,

		open(ws: ServerWebSocket<WsData>) {
			if (ws.data.type === "client") {
				ws.subscribe(AGGREGATOR_TOPIC);
				console.log("[ws] client connected");

				// Send current connections state
				for (const key of Object.keys(aggregator.connections)) {
					const [exchangeId, ...rest] = key.split(":");
					const pair = rest.join(":");
					ws.send(
						JSON.stringify({
							op: "connection",
							data: { exchangeId, pair },
						}),
					);
				}

				// Send current tickers
				if (Object.keys(aggregator.tickers).length) {
					ws.send(
						JSON.stringify({
							op: "tickers",
							data: aggregator.tickers,
						}),
					);
				}
			} else {
				handleWsOpen(ws as ServerWebSocket<ProxyWsData>);
			}
		},

		message(
			ws: ServerWebSocket<WsData>,
			message: string | ArrayBuffer | Uint8Array,
		) {
			if (ws.data.type === "client") {
				try {
					const payload = JSON.parse(
						message as string,
					) as AggregatorPayload;
					if (typeof aggregator[payload.op] === "function") {
						aggregator[payload.op](
							payload.data,
							payload.trackingId,
						);
					}
				} catch (error) {
					console.error("[ws] failed to parse message", error);
				}
			} else {
				handleWsMessage(
					ws as ServerWebSocket<ProxyWsData>,
					message,
				);
			}
		},

		close(ws: ServerWebSocket<WsData>) {
			if (ws.data.type === "client") {
				ws.unsubscribe(AGGREGATOR_TOPIC);
				console.log("[ws] client disconnected");
			} else {
				handleWsClose(ws as ServerWebSocket<ProxyWsData>);
			}
		},
	},
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
	aggregator.connect(["BINANCE:btcusdt", "BITSTAMP:btcusd"]);
});

export default server;
