import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class POLONIEX extends Exchange {
  id = 'POLONIEX'

  protected endpoints = {
    PRODUCTS: 'https://api.poloniex.com/markets'
  }

  async getUrl() {
    return 'wss://ws.poloniex.com/ws/public'
  }

  formatProducts(data): ProductsData {
    return data.map(product => product.symbol)
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        event: 'subscribe',
        channel: ['trades'],
        symbols: [pair]
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
        event: 'unsubscribe',
        channel: ['trades'],
        symbols: [pair]
      })
    )

    return true
  }

  formatTrade(trade) {
    return {
      exchange: this.id,
      pair: trade.symbol,
      timestamp: trade.createTime,
      price: +trade.price,
      size: trade.amount / trade.price,
      side: trade.takerSide
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json || !json.data) {
      return
    }

    return this.emitTrades(
      api._id,
      json.data.map(trade => this.formatTrade(trade))
    )
  }

  onApiCreated(api: Api) {
    this.startKeepAlive(api, { event: 'ping' }, 30000)
  }

  onApiRemoved(api: Api) {
    this.stopKeepAlive(api)
  }
}
