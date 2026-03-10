import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class OKEX extends Exchange {
  id = 'OKEX'
  private specs: { [pair: string]: number }
  private inversed: { [pair: string]: boolean }
  private types: { [pair: string]: 'SPOT' | 'SWAP' | 'FUTURE' }

  protected endpoints = {
    PRODUCTS: [
      'https://www.okx.com/api/v5/public/instruments?instType=SPOT',
      'https://www.okx.com/api/v5/public/instruments?instType=FUTURES',
      'https://www.okx.com/api/v5/public/instruments?instType=SWAP'
    ]
  }

  async getUrl() {
    return 'wss://ws.okx.com:8443/ws/v5/public'
  }

  validateProducts(data: unknown): boolean {
    if (!(data as Record<string, unknown>).types) {
      return false
    }

    return true
  }

  formatProducts(response): ProductsData {
    const products = []
    const specs = {}
    const aliases = {}
    const inversed = {}
    const types = {}

    for (const data of response) {
      for (const product of data.data) {
        const type = product.instType
        const pair = product.instId

        if (type === 'FUTURES') {
          // futures

          specs[pair] = +product.ctVal
          aliases[pair] = product.alias

          if (product.ctType === 'inverse') {
            inversed[pair] = true
          }
        } else if (type === 'SWAP') {
          // swap

          specs[pair] = +product.ctVal

          if (product.ctType === 'inverse') {
            inversed[pair] = true
          }
        }

        types[pair] = type
        products.push(pair)
      }
    }

    return {
      products,
      specs,
      aliases,
      inversed,
      types
    }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        op: 'subscribe',
        args: [
          {
            channel: 'trades',
            instId: pair
          }
        ]
      })
    )

    if (this.types[pair] !== 'SPOT') {
      api.send(
        JSON.stringify({
          op: 'subscribe',
          args: [
            {
              channel: 'liquidation-orders',
              instType: this.types[pair]
            }
          ]
        })
      )
    }

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        op: 'unsubscribe',
        args: [
          {
            channel: 'trades',
            instId: pair
          }
        ]
      })
    )

    if (this.types[pair] !== 'SPOT') {
      api.send(
        JSON.stringify({
          op: 'subscribe',
          args: [
            {
              channel: 'liquidation-orders',
              instType: this.types[pair]
            }
          ]
        })
      )
    }

    return true
  }

  formatTrade(trade) {
    let size

    if (typeof this.specs[trade.instId] !== 'undefined') {
      size =
        (trade.sz * this.specs[trade.instId]) /
        (this.inversed[trade.instId] ? trade.px : 1)
    } else {
      size = trade.sz
    }

    return {
      exchange: this.id,
      pair: trade.instId,
      timestamp: +trade.ts,
      price: +trade.px,
      size: +size,
      side: trade.side
    }
  }

  formatLiquidation(liquidation, pair: string) {
    const size =
      (liquidation.sz * this.specs[pair]) /
      (this.inversed[pair] ? liquidation.bkPx : 1)

    return {
      exchange: this.id,
      pair: pair,
      timestamp: +liquidation.ts,
      price: +liquidation.bkPx,
      size: size,
      side: liquidation.side,
      liquidation: true
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json || !json.data) {
      return
    }

    if (json.arg.channel === 'liquidation-orders') {
      return this.emitLiquidations(
        api._id,
        json.data.reduce((acc, pairData) => {
          if (api._connected.indexOf(pairData.instId) === -1) {
            return acc
          }

          return acc.concat(
            pairData.details.map(liquidation =>
              this.formatLiquidation(liquidation, pairData.instId)
            )
          )
        }, [])
      )
    }

    return this.emitTrades(
      api._id,
      json.data.map(trade => this.formatTrade(trade))
    )
  }
}
