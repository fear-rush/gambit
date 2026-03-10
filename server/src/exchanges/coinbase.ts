import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'
import { sleep } from '../helpers/utils'

export default class COINBASE extends Exchange {
  id = 'COINBASE'

  protected endpoints = {
    PRODUCTS: [
      'https://api.coinbase.com/api/v3/brokerage/market/products?product_type=SPOT',
      'https://api.coinbase.com/api/v3/brokerage/market/products?product_type=FUTURE&contract_expiry_type=PERPETUAL'
    ]
  }

  async getUrl() {
    return 'wss://advanced-trade-ws.coinbase.com'
  }

  formatProducts(response): ProductsData {
    const products = []

    const [spotResponse, perpResponse] = response

    if (spotResponse && spotResponse.products && spotResponse.products.length) {
      for (const product of spotResponse.products) {
        if (product.status !== 'online') {
          continue
        }

        if (product.alias) {
          // Skip alias-only products like LTC-USDC
          continue
        }

        products.push(product.product_id)
      }
    }

    if (perpResponse && perpResponse.products && perpResponse.products.length) {
      for (const product of perpResponse.products) {
        products.push(product.product_id)
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
        type: 'subscribe',
        channel: 'market_trades',
        product_ids: [pair]
      })
    )

    // this websocket api have a limit of about 10 messages per second.
    await sleep(100 * this.apis.length)

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        type: 'unsubscribe',
        ...{
          channel: 'market_trades',
          product_ids: [pair]
        }
      })
    )

    // this websocket api have a limit of about 10 messages per second.
    await sleep(100 * this.apis.length)

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (json && json.channel === 'market_trades') {
      return this.emitTrades(
        api._id,
        json.events.reduce((acc, event) => {
          if (event.type === 'update') {
            acc.push(
              ...event.trades.map(trade =>
                this.formatTrade(trade, trade.product_id)
              )
            )
          }

          return acc
        }, [])
      )
    }
  }

  formatTrade(trade, pair: string) {
    return {
      exchange: this.id,
      pair: pair,
      timestamp: +new Date(trade.time),
      price: +trade.price,
      size: +trade.size,
      side: trade.side === 'BUY' ? 'sell' : 'buy'
    }
  }
}
