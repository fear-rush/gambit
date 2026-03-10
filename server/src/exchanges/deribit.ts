import type { Trade, Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'

export default class DERIBIT extends Exchange {
  id = 'DERIBIT'

  private types: { [pair: string]: 'reversed' | 'linear' }

  protected endpoints = {
    PRODUCTS: [
      'https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=future',
      'https://www.deribit.com/api/v2/public/get_instruments?currency=ETH&kind=future',
      'https://www.deribit.com/api/v2/public/get_instruments?currency=USDC&kind=future'
    ]
  }

  async getUrl() {
    return `wss://www.deribit.com/ws/api/v2`
  }

  formatProducts(response): ProductsData {
    const products = []
    const types = {}

    for (const data of response) {
      for (const product of data.result) {
        if (!product.is_active) {
          continue
        }

        types[product.instrument_name] = product.future_type

        products.push(product.instrument_name)
      }
    }

    return { products, types }
  }

  validateProducts(data: unknown): boolean {
    if (!data || !(data as Record<string, unknown>).types) {
      return false
    }

    return true
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        method: 'public/subscribe',
        params: {
          channels: ['trades.' + pair + '.100ms']
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
        method: 'public/unsubscribe',
        params: {
          channels: ['trades.' + pair + '.raw']
        }
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (
      !json ||
      !json.params ||
      !json.params.data ||
      !json.params.data.length
    ) {
      return
    }

    const trades = []
    const liquidations = []

    for (let i = 0; i < json.params.data.length; i++) {
      const trade = json.params.data[i]
      let size = trade.amount

      if (this.types[trade.instrument_name] === 'reversed') {
        size /= trade.price
      }

      const output: Trade = {
        exchange: this.id,
        pair: trade.instrument_name,
        timestamp: +trade.timestamp,
        price: +trade.price,
        size: size,
        side: trade.direction
      }

      if (trade.liquidation) {
        output.liquidation = true

        liquidations.push(output)
      } else {
        trades.push(output)
      }
    }

    if (trades.length) {
      this.emitTrades(api._id, trades)
    }

    if (liquidations.length) {
      this.emitLiquidations(api._id, liquidations)
    }

    return true
  }

  onApiCreated(api: Api) {
    this.startKeepAlive(api, { method: 'public/ping' }, 45000)
  }

  onApiRemoved(api: Api) {
    this.stopKeepAlive(api)
  }
}
