import type { Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'

export default class HYPERLIQUID extends Exchange {
  id = 'HYPERLIQUID'
  protected endpoints = {
    PRODUCTS: [
      {
        url: 'https://api.hyperliquid.xyz/info',
        method: 'POST',
        data: JSON.stringify({ type: 'meta' }),
        proxy: false
      }
    ]
  }

  async getUrl() {
    return 'wss://api.hyperliquid.xyz/ws'
  }

  formatProducts(response): ProductsData {
    const products = []

    const perpResponse = response

    if (perpResponse && perpResponse.universe && perpResponse.universe.length) {
      for (const product of perpResponse.universe) {
        products.push(product.name)
      }
    }

    return {
      products
    }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'subscribe',
        subscription: {
          type: 'trades',
          coin: pair
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
        method: 'unsubscribe',
        subscription: {
          type: 'trades',
          coin: pair
        }
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (json && json.channel === 'trades') {
      return this.emitTrades(
        api._id,
        json.data.map(t => this.formatResponse(t))
      )
    }
  }

  formatResponse(t) {
    return {
      exchange: this.id,
      pair: t.coin,
      timestamp: +new Date(t.time),
      price: +t.px,
      size: +t.sz,
      side: t.side === 'B' ? 'buy' : 'sell'
    }
  }
}
