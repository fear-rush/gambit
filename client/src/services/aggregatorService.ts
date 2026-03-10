import type { AggregatorPayload, Ticker } from "shared";
import EventEmitter from "eventemitter3";
import {
	countDecimals,
	marketDecimals,
} from "./productsService";

function randomString(
	length = 8,
	characters = "abcdefghijklmnopqrstuvwxyz0123456789",
) {
	let output = "";
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		output += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return output;
}

class AggregatorService extends EventEmitter {
	private ws: WebSocket | null = null;
	private pendingCallbacks = new Map<string, (data: unknown) => void>();

	constructor() {
		super();
		this.connectWs();
		this.listenUtilityEvents();
	}

	private connectWs() {
		const base = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
		const wsUrl = base.replace(/^http/, "ws") + "/ws";

		this.ws = new WebSocket(wsUrl);

		this.ws.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data) as AggregatorPayload;

				// Resolve pending async dispatch if trackingId matches
				if (payload.trackingId && this.pendingCallbacks.has(payload.trackingId)) {
					const callback = this.pendingCallbacks.get(payload.trackingId)!;
					this.pendingCallbacks.delete(payload.trackingId);
					callback(payload.data);
					return;
				}

				this.emit(payload.op, payload.data, payload.trackingId);
			} catch {
				// ignore parse errors
			}
		};

		this.ws.onclose = () => {
			console.debug("[aggregator] ws closed, reconnecting in 2s...");
			setTimeout(() => this.connectWs(), 2000);
		};

		this.ws.onerror = (err) => {
			console.warn("[aggregator] ws error", err);
		};
	}

	listenUtilityEvents() {
		this.on("price", ({ market, price }: { market: string; price: number }) => {
			marketDecimals[market] = countDecimals(
				price < 0.000001 ? price + 1 : price,
			);
		});
	}

	dispatch(payload: AggregatorPayload) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(payload));
		}
	}

	dispatchAsync(payload: AggregatorPayload): Promise<unknown> {
		const trackingId = randomString(8);
		payload.trackingId = trackingId;

		return new Promise<unknown>((resolve) => {
			this.pendingCallbacks.set(trackingId, resolve);
			this.dispatch(payload);
		});
	}

	async connect(markets: string[]): Promise<void> {
		if (!markets.length) {
			return;
		}

		await this.dispatchAsync({
			op: "connect",
			data: markets,
		});
	}

	async disconnect(markets: string[]): Promise<void> {
		if (!markets.length) {
			return;
		}

		await this.dispatchAsync({
			op: "disconnect",
			data: markets,
		});
	}

	getAllTickers(): Promise<Record<string, Ticker>> {
		return this.dispatchAsync({
			op: "getAllTickers",
		}) as Promise<Record<string, Ticker>>;
	}
}

export const aggregatorService = new AggregatorService();
