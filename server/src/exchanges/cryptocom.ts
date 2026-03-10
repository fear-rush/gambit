import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class extends Exchange {
  id = 'CRYPTOCOM'
  protected endpoints = {
    PRODUCTS: 'https://api.crypto.com/exchange/v1/public/get-instruments'
  }

  async getUrl() {
    return `wss://stream.crypto.com/v2/market`
  }

  formatProducts(response): ProductsData {
    return response.result.data.map(s => s.symbol)
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    const params = {
      channels: [`trade.${pair}`]
    }

    api.send(
      JSON.stringify({
        method: 'subscribe',
        params,
        id: Date.now()
      })
    )

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    const params = {
      channels: [`trade.${pair}`]
    }

    api.send(
      JSON.stringify({
        method: 'unsubscribe',
        params,
        id: Date.now()
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)
    if (json.result) {
      return this.emitTrades(
        api._id,
        json.result.data.map(t => this.formatResponse(t))
      )
    } else if (json.method === 'public/heartbeat') {
      api.send(
        JSON.stringify({
          id: json.id,
          method: 'public/respond-heartbeat'
        })
      )
    }
  }

  formatResponse(t) {
    return {
      exchange: this.id,
      pair: t.i,
      timestamp: +new Date(t.t),
      price: +t.p,
      size: +t.q,
      side: t.s.toLowerCase()
    }
  }
}
