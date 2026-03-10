import type { Trade, Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'

export default class DYDX extends Exchange {
  id = 'DYDX'

  protected endpoints = {
    PRODUCTS: 'https://indexer.dydx.trade/v4/perpetualMarkets'
  }

  async getUrl() {
    return `wss://indexer.dydx.trade/v4/ws`
  }

  formatProducts(data): ProductsData {
    return Object.keys(data.markets)
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        type: 'subscribe',
        channel: 'v4_trades',
        id: pair
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
        type: 'unsubscribe',
        channel: 'v4_trades',
        id: pair
      })
    )

    return true
  }

  formatTrade(trade, pair: string): Trade {
    return {
      exchange: this.id,
      pair: pair,
      timestamp: +new Date(trade.createdAt),
      price: +trade.price,
      size: +trade.size,
      side: trade.side === 'BUY' ? 'buy' : 'sell'
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (json.type === 'channel_data') {
      const trades = []
      const liquidations = []

      for (let i = 0; i < json.contents.trades.length; i++) {
        const trade = this.formatTrade(json.contents.trades[i], json.id)

        if (json.contents.trades[i].liquidation) {
          trade.liquidation = true

          liquidations.push(trade)
        } else {
          trades.push(trade)
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
  }
}
