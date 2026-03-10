import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class ASTER extends Exchange {
  id = 'ASTER'

  protected endpoints = {
    PRODUCTS: ['https://fapi.asterdex.com/fapi/v1/exchangeInfo']
  }

  // Binance-style fstream clone
  async getUrl() {
    return 'wss://fstream.asterdex.com/ws'
  }

  formatProducts(response): ProductsData {
    const products = []

    if (response && Array.isArray(response.symbols)) {
      for (const s of response.symbols) {
        if (s.contractType === 'PERPETUAL' && s.status === 'TRADING') {
          products.push(s.symbol) // e.g. 'BTCUSDT'
        }
      }
    }

    return { products }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    // Aster = Binance clone → SUBSCRIBE / UNSUBSCRIBE with params: ["btcusdt@aggTrade"]
    api.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params: [`${pair.toLowerCase()}@aggTrade`],
        id: Date.now()
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
        method: 'UNSUBSCRIBE',
        params: [`${pair.toLowerCase()}@aggTrade`],
        id: Date.now()
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    // Aster supports either raw event or the Binance /stream wrapper
    if (json.stream && json.data && json.data.e === 'aggTrade') {
      const t = this.formatResponse(json.data)
      return this.emitTrades(api._id, [t])
    }

    if (json.e === 'aggTrade') {
      const t = this.formatResponse(json)
      return this.emitTrades(api._id, [t])
    }
  }

  formatResponse(t) {
    // Derive taker side from isBuyerMaker flag:
    // if buyer is maker => taker is seller => 'sell'
    // if buyer is not maker => taker is buyer => 'buy'
    const takerSide = t.m ? 'sell' : 'buy'

    return {
      exchange: this.id,
      pair: t.s, // 'BTCUSDT'
      timestamp: +t.T, // ms
      price: +t.p,
      size: +t.q,
      side: takerSide as 'buy' | 'sell'
    }
  }
}
