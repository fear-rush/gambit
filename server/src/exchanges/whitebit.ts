import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class WHITEBIT extends Exchange {
  id = 'WHITEBIT'

  protected endpoints = {
    PRODUCTS: [
        'https://whitebit.com/api/v4/public/markets'
    ]
  }

  async getUrl() {
    return 'wss://api.whitebit.com/ws'
  }

  formatProducts(response): ProductsData {
    const products = [...response.map(p => p.name)];
    const productsUniqueSet = [...new Set(products)];
    return productsUniqueSet;
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        id: 8,
        method: 'trades_subscribe',
        params: [pair]
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
         id: 9,
         method: 'trades_unsubscribe',
         params: [pair]
      })
    )

    return true
  }

  formatTrade(market: string, trade) {
    const data = {
      exchange: this.id,
      pair: market,
      timestamp: parseInt((trade.time * 1000).toString()),
      price: +parseFloat(trade.price),
      size: parseFloat(trade.amount),
      side: trade.type
    }
    return data;
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json || json.method !== 'trades_update') {
      return;
    }

    const market = json.params[0]
    const trades = json.params[1]

    return this.emitTrades(
      api._id,
      trades.map(trade => this.formatTrade(market, trade))
    )
  }

  onApiCreated(api: Api) {
    this.startKeepAlive(api, { id: 0, method: 'ping', params: [] }, 30000)
  }

  onApiRemoved(api: Api) {
    this.stopKeepAlive(api)
  }
}
