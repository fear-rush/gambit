import Exchange from '../exchange'
import type { Api } from '../exchange'
import type { ProductsData } from 'shared'

export default class BITSTAMP extends Exchange {
  id = 'BITSTAMP'
  protected endpoints = {
    PRODUCTS: 'https://www.bitstamp.net/api/v2/trading-pairs-info/'
  }

  async getUrl() {
    return `wss://ws.bitstamp.net/`
  }

  formatProducts(data): ProductsData {
    return data.map(a => a.url_symbol)
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        event: 'bts:subscribe',
        data: {
          channel: 'live_trades_' + pair
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
        event: 'bts:unsubscribe',
        data: {
          channel: 'live_trades_' + pair
        }
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    if (!json || !json.data || !json.data.amount) {
      return
    }

    const trade = json.data

    return this.emitTrades(api._id, [
      {
        exchange: this.id,
        pair: json.channel.split('_').pop(),
        timestamp: +new Date(trade.microtimestamp / 1000),
        price: trade.price,
        size: trade.amount,
        side: trade.type === 0 ? 'buy' : 'sell'
      }
    ])
  }
}
