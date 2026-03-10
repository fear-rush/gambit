import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'
import settings from '../settings'

export default class BINANCE extends Exchange {
  id = 'BINANCE'
  private lastSubscriptionId = 0
  private subscriptions: Record<string, number> = {}
  protected endpoints = {
    PRODUCTS: 'https://data-api.binance.vision/api/v3/exchangeInfo'
  }
  protected maxConnectionsPerApi = 100
  protected delayBetweenMessages = 250

  async getUrl() {
    return `wss://data-stream.binance.vision:9443/ws`
  }

  formatProducts(data): ProductsData {
    return data.symbols
      .filter(
        product =>
          product.status === 'TRADING' &&
          product.permissions.indexOf('LEVERAGED') === -1
      )
      .map(product => product.symbol.toLowerCase())
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    this.subscriptions[pair] = ++this.lastSubscriptionId
    const channel = settings.aggregationLength === -1 ? 'trade' : 'aggTrade'
    const params = [pair + '@' + channel]

    api.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params,
        id: this.subscriptions[pair]
      })
    )

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    const channel = settings.aggregationLength === -1 ? 'trade' : 'aggTrade'
    const params = [pair + '@' + channel]

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

    if (json.E) {
      return this.emitTrades(api._id, [
        {
          exchange: this.id,
          pair: json.s.toLowerCase(),
          timestamp: json.T,
          price: +json.p,
          size: +json.q,
          count: json.l - json.f + 1,
          side: json.m ? 'sell' : 'buy'
        }
      ])
    }
  }
}
