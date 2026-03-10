import type { ProductsData } from "shared";
import { EventEmitter } from "eventemitter3";
import { fetchAndFormatProducts } from "./services/products";
import { randomString, sleep } from "./lib/utils";

export interface Api extends WebSocket {
	_id: string;
	_pending: string[];
	_connected: string[];
	_timestamp: number;
	_reconnecting: boolean;
	_wasOpened?: boolean;
	_originalUrl?: string;
	_errored?: boolean;
	_liquidationSubscribed?: boolean;
	_marketDataApi?: WebSocket | null;
	ignoreWelcomeMessage?: Record<string, boolean>;
	[key: string]: unknown;
}

export interface ApiEventError extends Event {
	target: Api;
}

type ExchangeEndpoint =
	| string
	| {
			url: string;
			method: string;
			data: string;
			proxy?: boolean;
		};

type ApiStateChangeResolver = {
	// biome-ignore lint/suspicious/noConfusingVoidType: void is correct here as the promise resolves without a value
	promise?: Promise<Api | void>;
	resolver?: (success: boolean) => void;
};

class Exchange extends EventEmitter {
	public id: string;
	public pairs: string[] = [];
	public products: string[] = null;
	protected delayBetweenMessages: number;
	protected maxConnectionsPerApi: number;
	protected endpoints: {
		[id: string]: ExchangeEndpoint | ExchangeEndpoint[];
	};

	keepAliveIntervals: { [apiId: string]: ReturnType<typeof setInterval> } = {};
	apis: Api[] = [];
	connecting: { [url: string]: ApiStateChangeResolver } = {};
	disconnecting: { [url: string]: ApiStateChangeResolver } = {};
	scheduledOperations: { [operationId: string]: ReturnType<typeof setTimeout> } = {};
	scheduledOperationsDelays: { [operationId: string]: number } = {};
	clearReconnectionDelayTimeout: { [apiUrl: string]: ReturnType<typeof setTimeout> } = {};
	count = 0;

	get requiresProducts() {
		return !this.products && this.endpoints.PRODUCTS;
	}

	isMatching(pair: string) {
		if (!this.products || !this.products.length) {
			console.debug(
				`[${this.id}.isMatching] couldn't match ${pair}, exchange has no products`,
			);
			return false;
		}

		if (this.products.indexOf(pair) === -1) {
			console.debug(`[${this.id}.isMatching] couldn't match ${pair}`);
			return false;
		}

		return true;
	}

	getUrl(_pair: string): Promise<string> {
		throw new Error("Not implemented");
	}

	async link(pair: string, hadError?: boolean) {
		pair = pair.replace(/[^:]*:/, "");

		if (!this.isMatching(pair)) {
			return Promise.reject(`${this.id} couldn't match with ${pair}`);
		}

		console.debug(`[${this.id}.link] linking ${pair}`);

		this.resolveApi(pair, hadError);
	}

	async resolveApi(pair: string, _hadError?: boolean) {
		const url = await this.getUrl(pair);

		let api = this.getActiveApiByUrl(url);

		if (!api) {
			api = this.createWs(url, pair);
		}

		api._originalUrl = url;

		if (api._pending.indexOf(pair) !== -1) {
			console.warn(
				`[${this.id}.resolveApi] ${pair}'s api is already connecting to ${pair}`,
			);
			return;
		}

		if (api._connected.indexOf(pair) !== -1) {
			console.warn(
				`[${this.id}.resolveApi] ${pair}'s api is already connected to ${pair}`,
			);
			return;
		}

		api._pending.push(pair);

		if (api.readyState === WebSocket.OPEN) {
			const timeoutId = `subscribe-${api._id}`;
			clearTimeout(this.scheduledOperations[timeoutId]);
			this.scheduledOperations[timeoutId] = setTimeout(() => {
				delete this.scheduledOperations[timeoutId];
				this.subscribePendingPairs(api);
			}, 1000);
		}

		return api;
	}

	createWs(url: string, pair: string) {
		const api = new WebSocket(url) as Api;
		api._id = randomString();

		console.debug(
			`[${this.id}] initiate new ws connection ${url} (${api._id}) for pair ${pair}`,
		);

		api.binaryType = "arraybuffer";

		api._connected = [];
		api._pending = [];

		this.apis.push(api);

		api.onmessage = (event) => {
			this.count++;

			if (this.onMessage(event, api) === true) {
				api._timestamp = Date.now();
			}
		};

		api.onopen = (event) => {
			api._wasOpened = true;

			if (typeof this.scheduledOperationsDelays[url] !== "undefined") {
				this.clearReconnectionDelayTimeout[url] = setTimeout(() => {
					delete this.clearReconnectionDelayTimeout[url];
					console.debug(
						`[${this.id}.createWs] clear reconnection delay (${url})`,
					);
					delete this.scheduledOperationsDelays[url];

					api._reconnecting = false;
				}, 10000);
			}

			this.markLoadingAsCompleted(this.connecting, api._id, true);

			this.subscribePendingPairs(api);

			this.onOpen(event, api._connected);
		};

		api.onclose = async (event) => {
			if (this.clearReconnectionDelayTimeout[url]) {
				clearTimeout(this.clearReconnectionDelayTimeout[url]);
				delete this.clearReconnectionDelayTimeout[url];
			}

			this.markLoadingAsCompleted(this.connecting, api._id, false);

			this.onClose(event, api._connected);
			this.markLoadingAsCompleted(this.disconnecting, api._id, true);

			const pairsToReconnect = [...api._pending, ...api._connected];
			if (pairsToReconnect.length) {
				console.error(
					`[${this.id}] connection closed unexpectedly, schedule reconnection (${pairsToReconnect.join(",")})`,
				);

				setTimeout(() => {
					this.reconnectApi(api);
				}, this.getTimeoutDelay(api.url));
			} else {
				this.removeWs(api);
			}
		};

		api.onerror = (event: ApiEventError) => {
			api._errored = true;
			console.debug(
				`[${this.id}.onError] ${event.target._connected.join(",")}'s api errored`,
				event,
			);
			this.onError(event);
		};

		this.connecting[api._id] = {};

		// Assign resolver before any async operations that could trigger
		// onclose synchronously (Bun fires WebSocket handlers synchronously)
		new Promise<Api>((resolve, reject) => {
			this.connecting[api._id].resolver = (success: boolean) => {
				if (success) {
					this.onApiCreated(api);
					resolve(api);
				} else {
					reject();
				}
			};
		});

		return api;
	}

	async subscribePendingPairs(api: Api) {
		console.debug(
			`[${this.id}.subscribePendingPairs] subscribe to ${api._pending.length} pairs of api ${api.url} (${api._pending.join(", ")})`,
		);

		const pairsToConnect = api._pending.slice();

		for (const pair of pairsToConnect) {
			await this.subscribe(api, pair);
		}
	}

	async unlink(pair: string) {
		pair = pair.replace(/[^:]*:/, "");

		const api = this.getActiveApiByPair(pair);

		if (!api) {
			return;
		}

		if (api._connected.indexOf(pair) === -1) {
			const pendingIndex = api._pending.indexOf(pair);

			if (pendingIndex !== -1) {
				console.debug(
					`[${this.id}.unlink] remove "${pair}" from ${api._id}'s pending pairs`,
				);
				api._pending.splice(pendingIndex, 1);
			} else {
				console.debug(
					`[${this.id}.unlink] "${pair}" does not exist on exchange ${this.id} (resolved immediately)`,
				);
			}

			return;
		}

		console.debug(`[${this.id}.unlink] unlinking ${pair}`);

		await this.unsubscribe(api, pair);

		if (!api._connected.length && !api._pending.length) {
			console.debug(
				`[${this.id}.unlink] ${pair}'s api is now empty (trigger close api)`,
			);
			return this.removeWs(api);
		}
	}

	getActiveApiByPair(pair: string) {
		for (let i = 0; i < this.apis.length; i++) {
			if (
				this.apis[i]._connected.indexOf(pair) !== -1 ||
				this.apis[i]._pending.indexOf(pair) !== -1
			) {
				return this.apis[i];
			}
		}
	}

	getActiveApiByUrl(url: string): Api {
		for (let i = 0; i < this.apis.length; i++) {
			if (
				this.apis[i].readyState < 2 &&
				this.apis[i]._originalUrl === url &&
				(!this.maxConnectionsPerApi ||
					this.apis[i]._connected.length +
						this.apis[i]._pending.length <
						this.maxConnectionsPerApi)
			) {
				return this.apis[i];
			}
		}
	}

	removeWs(api: Api) {
		let promiseOfClose: Promise<void>;

		if (api.readyState !== WebSocket.CLOSED) {
			if (api._connected.length) {
				throw new Error(
					"Cannot unbind api that still has pairs linked to it",
				);
			}

			console.debug(`[${this.id}.removeWs] close api ${api.url}`);

			this.disconnecting[api._id] = {};

			// Store promise directly — api.close() may fire onclose synchronously
			// in Bun, which deletes the disconnecting entry before the constructor returns
			promiseOfClose = new Promise<void>((resolve, reject) => {
				this.disconnecting[api._id].resolver = (success: boolean) =>
					success ? resolve() : reject();

				if (api.readyState < WebSocket.CLOSING) {
					api.close();
				}
			});
		} else {
			promiseOfClose = Promise.resolve();
		}

		return promiseOfClose.then(() => {
			console.debug(`[${this.id}] remove api ${api.url}`);
			this.onApiRemoved(api);
			this.apis.splice(this.apis.indexOf(api), 1);
		});
	}

	reconnectApi(api: Api): boolean {
		if (this.apis.indexOf(api) === -1) {
			console.debug(
				`[${this.id}.reconnectApi] reconnect api prevented because api doesn't exist anymore (url: ${api.url})`,
			);
			return false;
		}

		console.debug(
			`[${this.id}.reconnectApi] reconnect api (url: ${api.url}, _connected: ${api._connected.join(", ")}, _pending: ${api._connected.join(", ")}, readyState: ${api.readyState})`,
		);

		const pairsToReconnect = [...api._pending, ...api._connected];
		const hasPairs = pairsToReconnect.length > 0;
		this.removeWs(api);
		this.reconnectPairs(pairsToReconnect, api._errored);

		return hasPairs;
	}

	async reconnectPairs(pairs: string[], hadError?: boolean) {
		const pairsToReconnect = pairs.slice(0, pairs.length);

		console.info(
			`[${this.id}.reconnectPairs] reconnect pairs ${pairsToReconnect.join(",")}`,
		);

		for (const pair of pairsToReconnect) {
			console.debug(
				`[${this.id}.reconnectPairs] unlinking market ${this.id}:${pair}`,
			);
			await this.unlink(`${this.id}:${pair}`);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));

		for (const pair of pairsToReconnect) {
			console.debug(
				`[${this.id}.reconnectPairs] linking market ${this.id}:${pair}`,
			);
			await this.link(`${this.id}:${pair}`, hadError);
		}
	}

	setProducts(productsData: ProductsData): boolean {
		if (!productsData) {
			console.debug(
				`[${this.id}] set products with no data (setting null)`,
			);
			this.products = null;
			return null;
		}

		if (!this.validateProducts(productsData)) {
			this.products = null;
			return false;
		}

		if (
			typeof productsData === "object" &&
			Object.hasOwn(productsData, "products")
		) {
			console.debug(`[${this.id}] set products (products data)`);
			for (const key in productsData) {
				this[key] = productsData[key];
			}
		} else if (Array.isArray(productsData)) {
			console.debug(`[${this.id}] set products (array of markets)`);
			this.products = productsData;
		}

		return true;
	}

	async getProducts(forceFetch?: boolean): Promise<ProductsData> {
		console.debug(
			`[${this.id}] request product ${forceFetch ? "(force fetching)" : ""}`,
		);

		if (!this.endpoints.PRODUCTS) {
			return this.products;
		}

		const endpoints = Array.isArray(this.endpoints.PRODUCTS)
			? this.endpoints.PRODUCTS
			: [this.endpoints.PRODUCTS];

		const productsData = await fetchAndFormatProducts(
			this.id,
			endpoints,
			this,
			forceFetch,
		);

		if (productsData && this.setProducts(productsData) === false) {
			return this.getProducts(true);
		}

		if (productsData) {
			this.setProducts(productsData);
		}

		return productsData;
	}

	onOpen(event: Event, pairs: string[]) {
		console.debug(
			`[${this.id}.onOpen] ${pairs.join(",")}'s api connected`,
		);
		this.emit("open", event);
	}

	onApiCreated(_api: Api) {
		// should be overridden by exchange class
	}

	onApiRemoved(_api: Api) {
		// should be overridden by exchange class
	}

	onMessage(_event: MessageEvent, _api: Api): boolean {
		throw new Error("Not implemented");
	}

	onError(event: ApiEventError) {
		this.emit("error", event);
	}

	onClose(event: Event, pairs: string[]) {
		console.debug(`[${this.id}] ${pairs.join(",")}'s api closed`);
		this.emit("close", event);
	}

	formatProducts(data: unknown): ProductsData {
		return data as ProductsData;
	}

	validateProducts(_data: unknown): boolean {
		return true;
	}

	async subscribe(api: Api, pair: string) {
		if (!this.markPairAsConnected(api, pair)) {
			return false;
		}

		this.emit("subscribed", pair, api.url);

		if (api.readyState !== WebSocket.OPEN) {
			return false;
		}

		if (this.delayBetweenMessages) {
			await sleep(this.delayBetweenMessages * this.apis.length);
		}

		return true;
	}

	async unsubscribe(api: Api, pair: string) {
		if (!this.markPairAsDisconnected(api, pair)) {
			return false;
		}

		this.emit("unsubscribed", pair, api._id);

		if (api.readyState !== WebSocket.OPEN) {
			return false;
		}

		if (this.delayBetweenMessages) {
			await sleep(this.delayBetweenMessages * this.apis.length);
		}

		return api.readyState === WebSocket.OPEN;
	}

	emitTrades(_source: string, trades: Trade[]) {
		if (!trades || !trades.length) {
			return;
		}

		this.emit("trades", trades);

		return true;
	}

	emitLiquidations(_source: string, trades: Trade[]) {
		if (!trades || !trades.length) {
			return;
		}

		this.emit("liquidations", trades);

		return true;
	}

	startKeepAlive(
		api: Api,
		payload:
			| {
					channel?: string;
					type?: string;
					event?: string;
					op?: string;
					method?: string;
					action?: string;
					id?: number;
					params?: unknown[];
				}
			| string
			| (() => unknown) = { event: "ping" },
		every = 30000,
	) {
		const keepAliveId = api._id || api.url;

		if (this.keepAliveIntervals[keepAliveId]) {
			this.stopKeepAlive(api);
		}

		this.keepAliveIntervals[keepAliveId] = setInterval(() => {
			if (api.readyState === WebSocket.OPEN) {
				api.send(
					typeof payload === "function"
						? JSON.stringify(payload())
						: typeof payload === "string"
							? payload
							: JSON.stringify(payload),
				);
			}
		}, every);
	}

	stopKeepAlive(api: Api) {
		const keepAliveId = api._id || api.url;

		if (!this.keepAliveIntervals[keepAliveId]) {
			return;
		}

		console.debug(
			`[${this.id}] stop keepalive for ws ${api.url} (${keepAliveId})`,
		);

		clearInterval(this.keepAliveIntervals[keepAliveId]);
		delete this.keepAliveIntervals[keepAliveId];
	}

	markLoadingAsCompleted(
		type: { [url: string]: ApiStateChangeResolver },
		id: string,
		success: boolean,
	) {
		if (type[id]?.resolver) {
			type[id].resolver(success);
			delete type[id];
		}
	}

	getTimeoutDelay(url: string, minDelay = 1000) {
		const currentDelay = Math.max(
			minDelay,
			this.scheduledOperationsDelays[url] || 0,
		);

		this.scheduledOperationsDelays[url] = currentDelay * 1.5;

		return currentDelay;
	}

	markPairAsConnected(api: Api, pair: string) {
		const pendingIndex = api._pending.indexOf(pair);

		if (pendingIndex !== -1) {
			api._pending.splice(pendingIndex, 1);
		} else {
			console.warn(
				`[${this.id}.markPairAsConnected] ${pair} appears to be NOT connecting anymore (prevent undesired subscription)`,
			);
			return false;
		}

		const connectedIndex = api._connected.indexOf(pair);

		if (connectedIndex !== -1) {
			console.debug(
				`[${this.id}.markPairAsConnected] ${pair} is already in the _connected list (prevent double subscription)`,
			);
			return false;
		}

		api._connected.push(pair);

		return true;
	}

	markPairAsDisconnected(api: Api, pair: string) {
		const pendingIndex = api._pending.indexOf(pair);

		if (pendingIndex !== -1) {
			console.debug(
				`[${this.id}.markPairAsDisconnected] ${pair} was NOT yet connected to api (prevent unsubscription of non connected pair)`,
			);

			api._pending.splice(pendingIndex, 1);

			return false;
		}

		const connectedIndex = api._connected.indexOf(pair);

		if (connectedIndex === -1) {
			console.debug(
				`[${this.id}.markPairAsDisconnected] ${pair} was NOT found in in the _connected list (prevent double unsubscription)`,
			);
			return false;
		}

		api._connected.splice(connectedIndex, 1);

		return true;
	}

	getEstimatedTimeToConnect(count: number) {
		if (!this.delayBetweenMessages) {
			return count;
		}

		const delay = count * this.delayBetweenMessages;
		const apisCount = Math.ceil(count / this.maxConnectionsPerApi);

		if (this.maxConnectionsPerApi && count > this.maxConnectionsPerApi) {
			return (
				(delay / Math.ceil(count / this.maxConnectionsPerApi)) *
				apisCount
			);
		}

		return delay;
	}

	reconnectAllClosedApis() {
		this.scheduledOperationsDelays = {};
		let isReconecting = false;

		for (const api of this.apis) {
			if (api.readyState === WebSocket.CLOSED) {
				if (!isReconecting && this.reconnectApi(api)) {
					isReconecting = true;
				}
			}
		}

		return isReconecting;
	}
}

export default Exchange;

// Re-export Trade type for exchange adapters that import it
import type { Trade } from "shared";
export type { Trade };
