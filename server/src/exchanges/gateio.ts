import type { Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'

export default class GATEIO extends Exchange {
  id = 'GATEIO'
  protected endpoints = {
    PRODUCTS: [
      'https://api.gateio.ws/api/v4/spot/currency_pairs',
      'https://api.gateio.ws/api/v4/futures/usdt/contracts',
      'https://api.gateio.ws/api/v4/futures/btc/contracts'
    ]
  }

  private specs: { [pair: string]: number } = {}

  async getUrl(pair: string) {
    if (typeof this.specs[pair] === 'number') {
      if (/USDT$/.test(pair)) {
        return 'wss://fx-ws.gateio.ws/v4/ws/usdt'
      }
      return 'wss://fx-ws.gateio.ws/v4/ws/btc'
    }

    return 'wss://api.gateio.ws/ws/v4/'
  }

  formatProducts(responses): ProductsData {
    const products = []
    const specs = {}

    for (const response of responses) {
      for (const product of response) {
        if (product.id) {
          products.push(`${product.id}-SPOT`)
        } else {
          products.push(product.name)
          specs[product.name] = product.quanto_multiplier
            ? parseFloat(product.quanto_multiplier)
            : 1
        }
      }
    }

    return { products, specs }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        channel: `${typeof this.specs[pair] === 'number' ? 'futures' : 'spot'}.trades`,
        event: 'subscribe',
        payload: [pair.replace('-SPOT', '')]
      })
    )

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        channel: `${typeof this.specs[pair] === 'number' ? 'futures' : 'spot'}.trades`,
        event: 'unsubscribe',
        payload: [pair.replace('-SPOT', '')]
      })
    )

    return true
  }

  formatSpotTrade(trade) {
    return {
      exchange: this.id,
      pair: trade.currency_pair + '-SPOT',
      timestamp: +trade.create_time_ms,
      price: +trade.price,
      size: +trade.amount,
      side: trade.side
    }
  }

  formatFuturesTrade(trade) {
    return {
      exchange: this.id,
      pair: trade.contract,
      timestamp: +trade.create_time_ms,
      price: +trade.price,
      size:
        this.specs[trade.contract] > 0
          ? Math.abs(trade.size) * this.specs[trade.contract]
          : Math.abs(trade.size) / trade.price,
      side: trade.size > 0 ? 'buy' : 'sell'
    }
  }

  formatLiquidation(trade) {
    return {
      ...this.formatFuturesTrade(trade),
      side: trade.size > 0 ? 'sell' : 'buy',
      liquidation: true
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json) {
      return
    }

    if (
      json.event &&
      json.event === 'update' &&
      json.result
    ) {
      if (json.result.length && json.channel === 'futures.trades') {
        const result = json.result.reduce((acc, trade) => {
          if (trade.is_internal) {
            acc.liquidations.push(this.formatLiquidation(trade))
          } else {
            acc.trades.push(this.formatFuturesTrade(trade))
          }
          return acc
        }, {
          trades: [],
          liquidations: []
        })

        if (result.trades.length) {
          return this.emitTrades(
            api._id,
            result.trades
          )
        }

        if (result.liquidations.length) {
          return this.emitLiquidations(
            api._id,
            result.liquidations
          )
        }
      }
      if (json.channel === 'spot.trades') {
        return this.emitTrades(
          api._id,
          [this.formatSpotTrade(json.result)]
        )
      }
    }
  }

  onApiCreated(api: Api) {
    this.startKeepAlive(api, /fx-ws/.test(api.url) ? { channel: 'futures.ping' } : { channel: 'spot.ping' }, 18000)
  }

  onApiRemoved(api: Api) {
    this.stopKeepAlive(api)
  }
}
