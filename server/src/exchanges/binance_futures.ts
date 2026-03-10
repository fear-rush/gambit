import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'
import { sleep } from '../lib/utils'
import settings from '../config/settings'

export default class BINANCE_FUTURES extends Exchange {
  id = 'BINANCE_FUTURES'
  private lastSubscriptionId = 0
  private subscriptions: Record<string, number> = {}
  private specs: { [pair: string]: number }
  private dapi: { [pair: string]: string }
  protected maxConnectionsPerApi = 100
  protected delayBetweenMessages = 100
  protected endpoints = {
    PRODUCTS: [
      'https://fapi.binance.com/fapi/v1/exchangeInfo',
      'https://dapi.binance.com/dapi/v1/exchangeInfo'
    ]
  }

  async getUrl(pair: string) {
    if (this.dapi[pair]) {
      return 'wss://dstream.binance.com/ws'
    } else {
      return 'wss://fstream.binance.com/ws'
    }
  }

  formatProducts(response): ProductsData {
    const products = []
    const specs = {}
    const dapi = {}

    for (const data of response) {
      const type = ['fapi', 'dapi'][response.indexOf(data)]

      for (const product of data.symbols) {
        if (
          (product.contractStatus && product.contractStatus !== 'TRADING') ||
          (product.status && product.status !== 'TRADING')
        ) {
          continue
        }

        const symbol = product.symbol.toLowerCase()

        if (type === 'dapi') {
          dapi[symbol] = true
        }

        if (product.contractSize) {
          specs[symbol] = product.contractSize
        }

        products.push(symbol)
      }
    }

    return {
      products,
      specs,
      dapi
    }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    this.subscriptions[pair] = ++this.lastSubscriptionId
    const channel = settings.aggregationLength === -1 ? 'trade' : 'aggTrade'
    const params = [pair + '@' + channel, pair + '@forceOrder']

    api.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params,
        id: this.subscriptions[pair]
      })
    )

    await sleep(250 * this.apis.length)

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    const channel = settings.aggregationLength === -1 ? 'trade' : 'aggTrade'
    const params = [pair + '@' + channel, pair + '@forceOrder']

    api.send(
      JSON.stringify({
        method: 'UNSUBSCRIBE',
        params,
        id: this.subscriptions[pair]
      })
    )

    delete this.subscriptions[pair]

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json) {
      return
    } else {
      if (json.T && (!json.X || json.X === 'MARKET')) {
        const symbol = json.s.toLowerCase()
        const price = +json.p
        let size = +json.q

        if (typeof this.specs[symbol] === 'number') {
          size = (size * this.specs[symbol]) / price
        }

        return this.emitTrades(api._id, [
          {
            exchange: this.id,
            pair: symbol,
            timestamp: json.T,
            price: +price,
            size: size,
            side: json.m ? 'sell' : 'buy',
            count: json.l - json.f + 1
          }
        ])
      } else if (json.e === 'forceOrder') {
        let size = +json.o.q

        const symbol = json.o.s.toLowerCase()

        if (typeof this.specs[symbol] === 'number') {
          size = (size * this.specs[symbol]) / json.o.p
        }

        return this.emitLiquidations(api._id, [
          {
            exchange: this.id,
            pair: symbol,
            timestamp: json.o.T,
            price: +json.o.p,
            size: size,
            side: json.o.S === 'BUY' ? 'buy' : 'sell',
            liquidation: true
          }
        ])
      }
    }
  }
}
