import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'
import { sleep } from '../lib/utils'

export default class BINANCE_US extends Exchange {
  id = 'BINANCE_US'
  private lastSubscriptionId = 0
  private subscriptions: Record<string, number> = {}
  protected endpoints = {
    PRODUCTS: 'https://api.binance.us/api/v3/exchangeInfo'
  }

  async getUrl() {
    return `wss://stream.binance.us:9443/ws`
  }

  formatProducts(data): ProductsData {
    return data.symbols
      .filter(product => product.status === 'TRADING')
      .map(product => product.symbol.toLowerCase())
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    this.subscriptions[pair] = ++this.lastSubscriptionId

    const params = [pair + '@trade']

    api.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params,
        id: this.subscriptions[pair]
      })
    )

    // BINANCE: WebSocket connections have a limit of 5 incoming messages per second.
    await sleep(250)

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    const params = [pair + '@trade']

    api.send(
      JSON.stringify({
        method: 'UNSUBSCRIBE',
        params,
        id: this.subscriptions[pair]
      })
    )

    delete this.subscriptions[pair]

    // BINANCE: WebSocket connections have a limit of 5 incoming messages per second.
    return new Promise<boolean>(resolve => setTimeout(resolve, 250))
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (json.E) {
      return this.emitTrades(api._id, [
        {
          exchange: this.id,
          pair: json.s.toLowerCase(),
          timestamp: json.E,
          price: +json.p,
          size: +json.q,
          side: json.m ? 'sell' : 'buy'
        }
      ])
    }
  }
}
