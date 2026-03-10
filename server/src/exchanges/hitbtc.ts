import type { Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'

export default class HITBTC extends Exchange {
  id = 'HITBTC'
  protected endpoints = {
    PRODUCTS: 'https://api.hitbtc.com/api/2/public/symbol'
  }

  async getUrl() {
    return 'wss://api.hitbtc.com/api/2/ws'
  }

  formatProducts(data): ProductsData {
    return data.map(product => product.id)
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'subscribeTrades',
        params: {
          symbol: pair
        }
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
        method: 'unsubscribeTrades',
        params: {
          symbol: pair
        }
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (
      !json ||
      json.method !== 'updateTrades' ||
      !json.params ||
      !json.params.data ||
      !json.params.data.length
    ) {
      return
    }

    return this.emitTrades(
      api._id,
      json.params.data.map(trade => ({
        exchange: this.id,
        pair: json.params.symbol,
        timestamp: +new Date(trade.timestamp),
        price: +trade.price,
        size: +trade.quantity,
        side: trade.side
      }))
    )
  }
}
