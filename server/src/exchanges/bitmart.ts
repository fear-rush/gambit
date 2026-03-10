import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'
import { inflateRaw } from 'pako'

const WS_API_SPOT = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1'
const WS_API_FUTURES = 'wss://openapi-ws-v2.bitmart.com/api?protocol=1.1'

export default class extends Exchange {
  id = 'BITMART'
  protected endpoints = {
    PRODUCTS: [
      'https://api-cloud.bitmart.com/spot/v1/symbols',
      'https://api-cloud-v2.bitmart.com/contract/public/details'
    ]
  }

  private specs: { [pair: string]: number } = {}

  async getUrl(pair: string) {
    if (this.specs[pair]) {
      return WS_API_FUTURES
    }

    return WS_API_SPOT
  }

  validateProducts(data: unknown): boolean {
    if (!(data as Record<string, unknown>).specs) {
      return false
    }

    return true
  }

  formatProducts(responses): ProductsData {
    const products = []
    const specs = {}
    const types = {}

    for (const response of responses) {
      for (const product of response.data.symbols) {
        if (typeof product === 'string') {
          // spot endpoint
          products.push(product)
        } else {
          // contracts endpoint
          products.push(product.symbol)

          if (product.contract_size) {
            specs[product.symbol] = +product.contract_size
          }
        }
      }
    }

    return { products, specs, types }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    const isContract = !!this.specs[pair]

    const typeImpl = isContract
      ? {
          prefix: 'futures',
          arg: 'action'
        }
      : {
          prefix: 'spot',
          arg: 'op'
        }

    api.send(
      JSON.stringify({
        [typeImpl.arg]: `subscribe`,
        args: [`${typeImpl.prefix}/trade:${pair}`]
      })
    )

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    const isContract = !!this.specs[pair]

    const typeImpl = isContract
      ? {
          prefix: 'futures',
          arg: 'action'
        }
      : {
          prefix: 'spot',
          arg: 'op'
        }

    api.send(
      JSON.stringify({
        [typeImpl.arg]: `unsubscribe`,
        args: [`${typeImpl.prefix}/trade:${pair}`]
      })
    )

    return true
  }

  formatTrade(trade) {
    if (this.specs[trade.symbol]) {
      return {
        exchange: this.id,
        pair: trade.symbol,
        timestamp: +new Date(trade.created_at),
        price: +trade.deal_price,
        size:
          (trade.deal_vol * this.specs[trade.symbol]) /
          (this.specs[trade.symbol] > 1 ? trade.deal_price : 1),
        side:
          typeof trade.m === 'boolean'
            ? trade.m
              ? 'sell'
              : 'buy'
            : trade.way <= 4
              ? 'buy'
              : 'sell',
        liquidation: trade.type === 1
      }
    } else {
      return {
        exchange: this.id,
        pair: trade.symbol,
        timestamp: trade.s_t * 1000,
        price: +trade.price,
        size: +trade.size,
        side: trade.side
      }
    }
  }
  onMessage(event: MessageEvent, api: Api) {
    let data = event.data

    if (typeof data !== 'string') {
      data = inflateRaw(event.data, { to: 'string' })
    }

    const json = JSON.parse(data)

    if (!json || !json.data) {
      return
    }

    const trades = json.data
    const regularTrades = []
    const liquidationTrades = []

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i]

      if (trade.type) {
        // Collect liquidation trades
        liquidationTrades.push(this.formatTrade(trade))
      } else {
        // Collect regular trades
        regularTrades.push(this.formatTrade(trade))
      }
    }

    if (regularTrades.length > 0) {
      this.emitTrades(api._id, regularTrades)
    }

    if (liquidationTrades.length > 0) {
      this.emitLiquidations(api._id, liquidationTrades)
    }

    return true
  }

  onApiCreated(api: Api) {
    if (api.url === WS_API_FUTURES) {
      this.startKeepAlive(api, { action: 'ping' }, 15000)
    }
  }

  onApiRemoved(api: Api) {
    if (api.url === WS_API_FUTURES) {
      this.stopKeepAlive(api)
    }
  }
}
