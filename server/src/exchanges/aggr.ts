import Exchange from '../exchange'
import type { Api } from '../exchange'

export default class AGGR extends Exchange {
  id = 'AGGR'

  protected endpoints = {}
  products = ['SENTIMENTTV', 'SENTIMENTMEX']

  async getUrl() {
    return `wss://sentiment.aggr.trade`
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        op: 'SUBSCRIBE',
        channel: pair
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
        op: 'UNSUBSCRIBE',
        channel: pair
      })
    )

    return true
  }

  formatTrade(trade, channel: string) {
    return {
      exchange: this.id,
      pair: channel,
      timestamp: +trade.timestamp,
      price: +trade.price,
      size: +trade.volume,
      side: trade.side
    }
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(event.data)

    return this.emitTrades(api._id, [this.formatTrade(json.data, json.channel)])
  }
}
