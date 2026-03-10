import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class KUCOIN extends Exchange {
  id = 'KUCOIN'

  protected endpoints = {
    PRODUCTS: [
      'https://api.kucoin.com/api/v1/symbols',
      'https://api-futures.kucoin.com/api/v1/contracts/active'
    ]
  }

  private multipliers: { [pair: string]: number } = {}
  private wsUrl: string | null = null

  async getUrl(): Promise<string> {
    if (this.wsUrl) {
      return this.wsUrl
    }

    const res = await fetch(
      'https://api.kucoin.com/api/v1/bullet-public',
      {
        method: 'POST'
      }
    )
    const data = await res.json() as any
    this.wsUrl = 'wss://ws-api.kucoin.com/endpoint'

    if (data.data.instanceServers.length) {
      this.wsUrl = data.data.instanceServers[0].endpoint
    }

    this.wsUrl += '?token=' + data.data.token

    return this.wsUrl
  }

  formatProducts(responses): ProductsData {
    const products = []
    const multipliers = {}

    for (const response of responses) {
      const type = ['spot', 'futures'][responses.indexOf(response)]
      for (const product of response.data) {
        const symbol = product.symbolName || product.symbol

        products.push(product.symbol)

        if (type === 'futures') {
          multipliers[symbol] = product.multiplier
        }
      }
    }

    return {
      products,
      multipliers
    }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    let topic

    if (this.multipliers[pair]) {
      topic = `/contractMarket/execution:${pair}`
    } else {
      topic = `/market/match:${pair}`
    }

    api.send(
      JSON.stringify({
        type: 'subscribe',
        topic
      })
    )

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    let topic

    if (this.multipliers[pair]) {
      topic = `/contractMarket/execution:${pair}`
    } else {
      topic = `/market/match:${pair}`
    }

    api.send(
      JSON.stringify({
        type: 'unsubscribe',
        topic
      })
    )

    return true
  }

  formatTrade(trade) {
    let timestamp
    let size

    if (this.multipliers[trade.symbol]) {
      timestamp = trade.ts / 1000000
      if (this.multipliers[trade.symbol] < 0) {
        size = trade.size / trade.price
      } else {
        size = trade.size * this.multipliers[trade.symbol]
      }
    } else {
      timestamp = trade.time / 1000000
      size = +trade.size
    }

    return {
      exchange: this.id,
      pair: trade.symbol,
      price: +trade.price,
      side: (trade.side === 'buy' ? 'buy' : 'sell') as 'buy' | 'sell',
      timestamp,
      size
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json || !json.data || json.type !== 'message') {
      return
    }

    return this.emitTrades(api._id, [this.formatTrade(json.data)])
  }

  onApiCreated(api: Api) {
    this.startKeepAlive(api, { type: 'ping' }, 18000)
  }

  onApiRemoved(api: Api) {
    this.stopKeepAlive(api)
  }
}
