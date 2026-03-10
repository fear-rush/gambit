import type { ServerWebSocket } from "bun";
import type { AggregatorPayload } from "shared";
import type Aggregator from "../services/aggregator";
import { AGGREGATOR_TOPIC } from "../config/constants";
import {
	handleProxyOpen,
	handleProxyMessage,
	handleProxyClose,
	type ProxyWsData,
} from "./proxy";

export type WsData = ProxyWsData | { type: "client" };

export function createWsHandlers(aggregator: Aggregator) {
	return {
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
				handleProxyOpen(ws as ServerWebSocket<ProxyWsData>);
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
				handleProxyMessage(
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
				handleProxyClose(ws as ServerWebSocket<ProxyWsData>);
			}
		},
	};
}
