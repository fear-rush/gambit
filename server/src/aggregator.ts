import type {
	AggregatedTrade,
	AggregatorPayload,
	Connection,
	Ticker,
	Trade,
} from "shared";
import type { ApiEventError } from "./exchange";
import { exchanges, getExchangeById } from "./exchanges";
import { getHms, parseMarket } from "./helpers/utils";
import settings from "./settings";

class Aggregator {
	broadcast: (payload: AggregatorPayload) => void;
	connections: { [name: string]: Connection } = {};
	connectionsCount = 0;
	connectionChange = 0;

	private tickersDelay = 10;
	private baseAggregationTimeout = 50;
	private onGoingAggregations: { [identifier: string]: AggregatedTrade } = {};
	private aggregationTimeouts: { [identifier: string]: number } = {};
	private pendingTrades: Trade[] = [];
	tickers: { [marketId: string]: Ticker } = {};
	private _connectionChangeNoticeTimeout: ReturnType<typeof setTimeout>;

	constructor(broadcast: (payload: AggregatorPayload) => void) {
		this.broadcast = broadcast;
		this.bindExchanges();
		this.bindTradesEvent();
		this.startTickersInterval();
	}

	bindExchanges() {
		for (const exchange of exchanges) {
			exchange.on(
				"subscribed",
				this.onSubscribed.bind(this, exchange.id),
			);
			exchange.on(
				"unsubscribed",
				this.onUnsubscribed.bind(this, exchange.id),
			);
			exchange.on("error", this.onError.bind(this, exchange.id));
		}
	}

	bindTradesEvent() {
		for (const exchange of exchanges) {
			exchange.off("trades");
			exchange.off("liquidations");

			if (settings.aggregationLength > 0) {
				exchange.on("trades", this.aggregateTrades.bind(this));
				exchange.on(
					"liquidations",
					this.aggregateLiquidations.bind(this),
				);
			} else {
				exchange.on("trades", this.emitTrades.bind(this));
				exchange.on(
					"liquidations",
					this.emitLiquidations.bind(this),
				);
			}
		}

		if (settings.aggregationLength > 0) {
			this.startAggrInterval();
			console.debug("[aggregator] bind trades: aggregation");
		} else {
			this.clearInterval("aggr");

			this.timeoutExpiredAggregations();
			this.emitPendingTrades();

			console.debug("[aggregator] bind trades: simple");
		}
	}

	emitTrades(trades: Trade[]) {
		for (let i = 0; i < trades.length; i++) {
			const trade = trades[i];
			const marketKey = trade.exchange + ":" + trade.pair;

			if (!this.connections[marketKey] || !trade.size || !trade.price) {
				continue;
			}

			if (settings.calculateSlippage) {
				trade.originalPrice =
					this.tickers[marketKey].price || trade.price;
			}

			trade.count = trade.count || 1;

			this.processTrade(trade);
		}

		this.broadcast({
			op: "trades",
			data: trades,
		});
	}

	aggregateTrades(trades: Trade[]) {
		const now = Date.now();

		for (let i = 0; i < trades.length; i++) {
			const trade = trades[i] as unknown as AggregatedTrade;
			const marketKey = trade.exchange + ":" + trade.pair;

			if (!this.connections[marketKey] || !trade.size || !trade.price) {
				continue;
			}

			if (this.onGoingAggregations[marketKey]) {
				const aggTrade = this.onGoingAggregations[marketKey];

				if (
					aggTrade.timestamp + settings.aggregationLength >
						trade.timestamp &&
					aggTrade.side === trade.side
				) {
					aggTrade.size += trade.size;
					aggTrade.price = trade.price;
					aggTrade.value += trade.price * trade.size;
					aggTrade.count += trade.count || 1;
					continue;
				} else {
					this.pendingTrades.push(this.processTrade(aggTrade));
				}
			}

			trade.originalPrice =
				this.tickers[marketKey].price || trade.price;
			trade.value = trade.price * trade.size;

			trade.count = trade.count || 1;
			this.aggregationTimeouts[marketKey] =
				now + this.baseAggregationTimeout;
			this.onGoingAggregations[marketKey] = trade;
		}
	}

	emitLiquidations(trades: Trade[]) {
		for (let i = 0; i < trades.length; i++) {
			const trade = trades[i];
			const marketKey = trade.exchange + ":" + trade.pair;

			if (!this.connections[marketKey]) {
				continue;
			}

			this.processLiquidation(trade);
		}

		this.broadcast({
			op: "trades",
			data: trades,
		});
	}

	aggregateLiquidations(trades: Trade[]) {
		const now = Date.now();

		for (let i = 0; i < trades.length; i++) {
			const trade = trades[i] as unknown as AggregatedTrade;
			const marketKey = trade.exchange + ":" + trade.pair;
			const tradeKey = "liq_" + marketKey;

			if (!this.connections[marketKey]) {
				continue;
			}

			if (this.onGoingAggregations[tradeKey]) {
				const aggTrade = this.onGoingAggregations[tradeKey];

				if (
					settings.aggregationLength > 0 &&
					aggTrade.timestamp + settings.aggregationLength >
						trade.timestamp &&
					aggTrade.side === trade.side
				) {
					aggTrade.size += trade.size;
					aggTrade.value += trade.price * trade.size;
					aggTrade.count++;
					continue;
				} else {
					this.pendingTrades.push(
						this.processLiquidation(aggTrade),
					);
				}
			}

			trade.count = 1;
			trade.value = trade.price * trade.size;
			this.aggregationTimeouts[tradeKey] =
				now + this.baseAggregationTimeout;
			this.onGoingAggregations[tradeKey] = trade;
		}
	}

	isAggregatedTrade(
		trade: Trade | AggregatedTrade,
	): trade is AggregatedTrade {
		return !!(trade as AggregatedTrade).value;
	}

	processTrade(trade: AggregatedTrade | Trade): Trade {
		const marketKey = trade.exchange + ":" + trade.pair;

		if (settings.calculateSlippage) {
			if (settings.calculateSlippage === "price") {
				trade.slippage =
					Math.round(
						(trade.price - trade.originalPrice + Number.EPSILON) *
							10,
					) / 10;
				if (Math.abs(trade.slippage) / trade.price < 0.000025) {
					trade.slippage = 0;
				}
			} else if (settings.calculateSlippage === "bps") {
				trade.slippage = Math.round(
					((trade.price - trade.originalPrice) /
						trade.originalPrice) *
						1e4,
				);
			}
		}

		trade.avgPrice = this.isAggregatedTrade(trade)
			? trade.value / trade.size
			: trade.price;

		trade.amount =
			(settings.preferQuoteCurrencySize ? trade.avgPrice : 1) *
			trade.size;

		this.tickers[marketKey].updated = true;
		this.tickers[marketKey].volume += trade.amount;
		this.tickers[marketKey].volumeDelta +=
			trade.amount * (trade.side === "buy" ? 1 : -1);
		this.tickers[marketKey].price = trade.price;

		if (this.tickers[marketKey].initialPrice === null) {
			this.emitInitialPrice(marketKey, trade.price);
		}

		return trade;
	}

	processLiquidation(trade: Trade): Trade {
		const marketKey = trade.exchange + ":" + trade.pair;

		trade.amount =
			(settings.preferQuoteCurrencySize ? trade.price : 1) * trade.size;

		trade.avgPrice = this.isAggregatedTrade(trade)
			? (trade as AggregatedTrade).value / trade.size
			: trade.price;

		return trade;
	}

	timeoutExpiredAggregations() {
		const now = Date.now();

		const tradeKeys = Object.keys(this.onGoingAggregations);

		for (let i = 0; i < tradeKeys.length; i++) {
			const aggTrade = this.onGoingAggregations[tradeKeys[i]];

			if (now > this.aggregationTimeouts[tradeKeys[i]]) {
				if (aggTrade.liquidation) {
					this.pendingTrades.push(this.processLiquidation(aggTrade));
				} else {
					this.pendingTrades.push(this.processTrade(aggTrade));
				}

				delete this.onGoingAggregations[tradeKeys[i]];
			}
		}
	}

	emitInitialPrice(marketKey: string, price: number) {
		this.tickers[marketKey].initialPrice = price;

		this.broadcast({
			op: "price",
			data: {
				market: marketKey,
				price: price,
			},
		});
	}

	emitPendingTrades() {
		if (settings.aggregationLength > 0) {
			this.timeoutExpiredAggregations();
		}

		if (this.pendingTrades.length) {
			this.broadcast({
				op: "trades",
				data: this.pendingTrades,
			});

			this.pendingTrades.splice(0, this.pendingTrades.length);
		}
	}

	emitTickers() {
		if (this.connectionsCount) {
			const updatedTickers: Record<string, { price: number; volume: number; volumeDelta: number }> = {};
			for (const marketKey in this.tickers) {
				if (!this.tickers[marketKey].updated) {
					continue;
				}

				updatedTickers[marketKey] = {
					price: this.tickers[marketKey].price,
					volume: this.tickers[marketKey].volume,
					volumeDelta: this.tickers[marketKey].volumeDelta,
				};

				this.tickers[marketKey].updated = false;
				this.tickers[marketKey].volume = 0;
				this.tickers[marketKey].volumeDelta = 0;
			}

			this.broadcast({
				op: "tickers",
				data: updatedTickers,
			});
		}

		this["_tickersInterval"] = setTimeout(
			() => this.emitTickers(),
			this.tickersDelay,
		);
	}

	onSubscribed(exchangeId: string, pair: string, url: string) {
		const marketKey = exchangeId + ":" + pair;

		if (this.connections[marketKey]) {
			return;
		}

		this.connections[marketKey] = {
			exchange: exchangeId,
			pair: pair,
			hit: 0,
			timestamp: null,
		};

		this.tickers[marketKey] = {
			volume: 0,
			volumeDelta: 0,
			initialPrice: null,
			price: null,
		};

		this.connectionsCount = Object.keys(this.connections).length;

		this.broadcast({
			op: "connection",
			data: {
				pair,
				url,
				exchangeId,
			},
		});

		this.noticeConnectionChange(1);

		this.refreshTickersDelay();
	}

	onUnsubscribed(exchangeId: string, pair: string) {
		const identifier = exchangeId + ":" + pair;

		if (this.onGoingAggregations[identifier]) {
			delete this.onGoingAggregations[identifier];
		}

		if (this.connections[identifier]) {
			delete this.connections[identifier];
			delete this.tickers[identifier];

			this.connectionsCount = Object.keys(this.connections).length;

			this.broadcast({
				op: "disconnection",
				data: {
					pair,
					exchangeId,
				},
			});

			this.noticeConnectionChange(-1);

			this.refreshTickersDelay();
		}
	}

	noticeConnectionChange(change: number) {
		this.connectionChange += change;

		if (this._connectionChangeNoticeTimeout) {
			clearTimeout(this._connectionChangeNoticeTimeout);
		}

		this._connectionChangeNoticeTimeout = setTimeout(() => {
			this._connectionChangeNoticeTimeout = null;

			if (this.connectionChange) {
				this.broadcast({
					op: "notice",
					data: {
						id: "connections",
						type: "success",
						title:
							this.connectionsCount +
							" connections (" +
							(this.connectionChange > 0 ? "+" : "") +
							this.connectionChange +
							")",
					},
				});
			}

			this.connectionChange = 0;
		}, 3000);
	}

	onError(exchangeId: string, event: ApiEventError | string) {
		let message: string;

		if (typeof event === "string") {
			message = event;
		} else if (typeof event === "object" && event !== null && "message" in event) {
			message = (event as { message: string }).message;
		}

		if (message) {
			this.broadcast({
				op: "notice",
				data: {
					id: exchangeId + "-error",
					type: "error",
					title: `${exchangeId} disconnected unexpectedly (${message})`,
				},
			});
		}

		const api = typeof event === "object" && event !== null && "target" in event ? (event as ApiEventError).target : null;

		this.broadcast({
			op: "error",
			data: {
				exchangeId,
				wasOpened: api ? api._wasOpened : null,
				originalUrl: api ? api._originalUrl : null,
				wasErrored: api ? api._errored : null,
				url: api ? api.url : null,
			},
		});
	}

	async connect(markets: string[], trackingId?: string) {
		console.debug("[aggregator] connect", markets);

		const marketsByExchange = markets.reduce(
			(output, market) => {
				const [exchangeId, pair] = parseMarket(market);

				if (!exchangeId || !pair) {
					return {};
				}

				if (!output[exchangeId]) {
					output[exchangeId] = [];
				}

				if (output[exchangeId].indexOf(market) === -1) {
					output[exchangeId].push(market);
				}

				return output;
			},
			{} as Record<string, string[]>,
		);

		const promises: Promise<void>[] = [];

		for (const exchangeId in marketsByExchange) {
			const exchange = getExchangeById(exchangeId);

			if (exchange) {
				if (exchange.requiresProducts) {
					await exchange.getProducts();
				}

				const estimatedTimeToConnectThemAll =
					exchange.getEstimatedTimeToConnect(
						marketsByExchange[exchangeId].length,
					);

				if (estimatedTimeToConnectThemAll > 1000 * 20) {
					this.broadcast({
						op: "notice",
						data: {
							id: exchangeId + "-connection-delay",
							type: "warning",
							timeout: estimatedTimeToConnectThemAll,
							title: `Connecting to ${
								marketsByExchange[exchangeId].length
							} markets on ${exchangeId}\nThis will take about ${getHms(
								estimatedTimeToConnectThemAll,
								undefined,
								" and ",
							)}`,
						},
					});
				}

				promises.push(
					(async () => {
						for (const market of marketsByExchange[exchangeId]) {
							try {
								await exchange.link(market);
							} catch (error) {
								console.error(error);
							}
						}
					})(),
				);
			} else {
				console.error(
					`[aggregator.connect] unknown exchange ${exchangeId}`,
				);
			}
		}

		await Promise.all(promises);

		if (trackingId) {
			this.broadcast({
				op: "connect",
				trackingId,
			});
		}
	}

	async disconnect(markets: string[], trackingId?: string) {
		console.debug("[aggregator] disconnect", markets);

		const marketsByExchange = markets.reduce(
			(output, market) => {
				const [exchangeId, pair] = parseMarket(market);

				if (!exchangeId || !pair) {
					return {};
				}

				if (!output[exchangeId]) {
					output[exchangeId] = [];
				}

				if (output[exchangeId].indexOf(market) === -1) {
					output[exchangeId].push(market);
				}

				return output;
			},
			{} as Record<string, string[]>,
		);

		const promises: Promise<void>[] = [];

		for (const exchangeId in marketsByExchange) {
			const exchange = getExchangeById(exchangeId);

			if (exchange) {
				promises.push(
					(async () => {
						for (const market of marketsByExchange[exchangeId]) {
							await exchange.unlink(market);
						}
					})(),
				);
			}
		}

		await Promise.all(promises);

		if (trackingId) {
			this.broadcast({
				op: "disconnect",
				trackingId,
			});
		}
	}

	startTickersInterval() {
		if (this["_tickersInterval"]) {
			return;
		}
		this.emitTickers();
	}

	startAggrInterval() {
		if (this["_aggrInterval"]) {
			this.clearInterval("aggr");
		}
		this["_aggrInterval"] = setInterval(
			this.emitPendingTrades.bind(this),
			Math.max(settings.aggregationLength, 50),
		);
	}

	clearInterval(name: string) {
		if (this["_" + name + "Interval"]) {
			globalThis.clearInterval(this["_" + name + "Interval"]);
			this["_" + name + "Interval"] = null;
		}
	}

	formatExchangeProducts(
		{ exchangeId, response }: { exchangeId: string; response: unknown },
		trackingId: string,
	) {
		let productsData = null;

		try {
			productsData =
				getExchangeById(exchangeId).formatProducts(response);
		} catch (error) {
			console.error(error.message);

			this.broadcast({
				op: "notice",
				data: {
					id: exchangeId + "-products",
					type: "error",
					title: `Failed to format ${exchangeId}'s products`,
				},
			});
		}

		this.broadcast({
			op: "formatExchangeProducts",
			data: productsData,
			trackingId: trackingId,
		});
	}

	configureAggregator({ key, value }: { key: string; value: unknown }) {
		if (typeof settings[key] === "undefined" || settings[key] === value) {
			return;
		}

		settings[key] = value;

		if (key === "aggregationLength") {
			const numValue = value as number;
			const signChange =
				(this.baseAggregationTimeout || 1) * (numValue || 1) < 0;
			this.baseAggregationTimeout = numValue;
			this.bindTradesEvent();

			if (signChange) {
				const channel = value === -1 ? "raw" : "aggregated";
				const targetExchanges: string[] = [];
				exchanges.forEach((exchange) => {
					if (
						(exchange.id === "BINANCE" ||
							exchange.id === "BINANCE_FUTURES") &&
						exchange.apis.length
					) {
						targetExchanges.push(exchange.id);
						for (const api of exchange.apis) api.close();
					}
				});

				if (targetExchanges.length) {
					this.broadcast({
						op: "notice",
						data: {
							title: `Switching to → ${channel} trade data`,
						},
					});
				}
			}
		}
	}

	refreshTickersDelay() {
		const count = Object.keys(this.connections).length;
		this.tickersDelay = Math.log(Math.exp(count / 20 + 1) * 200) * 100;
		return this.tickersDelay;
	}

	getAllTickers(_payload: unknown, trackingId: string) {
		this.broadcast({
			op: "getAllTickers",
			trackingId: trackingId,
			data: this.tickers,
		});
	}

	clearReconnectionTimeout() {
		for (const exchange of exchanges) {
			if (exchange.reconnectAllClosedApis()) {
				this.broadcast({
					op: "notice",
					data: {
						title: `Reconnecting ${exchange.id}`,
					},
				});
			}
		}
	}
}

export default Aggregator;
