import type { Api } from '../exchange'
import Exchange from '../exchange'
import type { ProductsData } from 'shared'
import pako from 'pako'

export default class HUOBI extends Exchange {
  id = 'HUOBI'

  liquidationOrdersSubscriptions: Record<string, unknown[]> = {}

  protected endpoints = {
    PRODUCTS: [
      'https://api.htx.com/v1/settings/common/symbols',
      'https://api.hbdm.com/api/v1/contract_contract_info',
      'https://api.hbdm.com/swap-api/v1/swap_contract_info',
      'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info'
    ]
  }

  private contractTypesAliases = {
    this_week: 'CW',
    next_week: 'NW',
    quarter: 'CQ',
    next_quarter: 'NQ'
  }

  private types: { [pair: string]: string } = {}
  private specs: { [pair: string]: number } = {}
  private prices: { [pair: string]: number } = {}

  async getUrl(pair: string) {
    if (this.types[pair] === 'futures') {
      return 'wss://www.hbdm.com/ws'
    } else if (this.types[pair] === 'swap') {
      return 'wss://api.hbdm.com/swap-ws'
    } else if (this.types[pair] === 'linear') {
      return 'wss://api.hbdm.com/linear-swap-ws'
    } else {
      return 'wss://api.htx.com/ws'
    }
  }

  formatProducts(response): ProductsData {
    const products = []
    const specs = {}
    const types = {}

    for (const data of response) {
      const type = ['spot', 'futures', 'swap', 'linear'][response.indexOf(data)]

      for (const product of data.data) {
        let pair: string

        switch (type) {
          case 'spot':
            pair = product.symbol
            break
          case 'futures':
            pair =
              product.symbol +
              '_' +
              this.contractTypesAliases[product.contract_type]
            specs[pair] = product.contract_size
            break
          case 'swap':
          case 'linear':
            pair = product.contract_code
            specs[pair] = product.contract_size
            break
        }

        types[pair] = type

        products.push(pair)
      }
    }

    return {
      products,
      specs,
      types
    }
  }

  async subscribe(api: Api, pair: string) {
    if (!(await super.subscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        sub: `market.${pair}.trade.detail`,
        id: pair
      })
    )

    this.subscribeLiquidations(api, pair)

    return true
  }

  async unsubscribe(api: Api, pair: string) {
    if (!(await super.unsubscribe(api, pair))) {
      return
    }

    api.send(
      JSON.stringify({
        unsub: 'market.' + pair + '.trade.detail',
        id: pair
      })
    )

    return true
  }

  onMessage(event: MessageEvent, api: Api) {
    const json = JSON.parse(pako.inflate(event.data, { to: 'string' }))

    if (!json) {
      return
    }

    if (json.ping) {
      api.send(JSON.stringify({ pong: json.ping }))
      return
    } else if (json.tick && json.tick.data && json.tick.data.length) {
      const pair = json.ch.replace(/market.(.*).trade.detail/, '$1')

      this.emitTrades(
        api._id,
        json.tick.data.map(trade => this.formatTrade(trade, pair))
      )

      return true
    }
  }

  formatTrade(trade, pair: string) {
    let size = +trade.amount

    if (typeof this.specs[pair] === 'number') {
      size =
        (size * this.specs[pair]) /
        (this.types[pair] === 'linear' ? 1 : trade.price)
    }

    this.prices[pair] = +trade.price

    return {
      exchange: this.id,
      pair: pair,
      timestamp: trade.ts,
      price: +trade.price,
      size: size,
      side: trade.direction
    }
  }

  formatLiquidation(trade, pair: string) {
    const price = this.prices[pair] || trade.price

    return {
      exchange: this.id,
      pair: pair,
      timestamp: +new Date(),
      price,
      size: +trade.amount,
      side: trade.direction,
      liquidation: true
    }
  }

  subscribeLiquidations(api: Api, pair: string, unsubscribe = false) {
    if (
      api._marketDataApi &&
      api._marketDataApi.readyState === WebSocket.OPEN &&
      (this.types[pair] === 'futures' ||
        this.types[pair] === 'swap' ||
        this.types[pair] === 'linear')
    ) {
      const symbol =
        this.types[pair] === 'futures'
          ? pair.replace(/\d+/, '').replace(/(-|_).*/, '')
          : pair

      api._marketDataApi.send(
        JSON.stringify({
          op: unsubscribe ? 'unsub' : 'sub',
          topic: 'public.' + symbol + '.liquidation_orders'
        })
      )
    }
  }

  onApiRemoved(api: Api) {
    if (api._marketDataApi) {
      if (api._marketDataApi.readyState === WebSocket.OPEN) {
        console.debug(
          `[${this.id}] close market data api ${api._marketDataApi.url} (associated with ${api._id})`
        )
        api._marketDataApi.close()
      }
    }
  }

  onApiCreated(api: Api) {
    this.liquidationOrdersSubscriptions[api._id] = []

    this.openMarketDataApi(api)
  }

  openMarketDataApi(api: Api) {
    if (api.url === 'wss://api.hbdm.com/swap-ws') {
      api._marketDataApi = new WebSocket('wss://api.hbdm.com/swap-notification') // coin margined
    } else if (api.url === 'wss://api.hbdm.com/linear-swap-ws') {
      api._marketDataApi = new WebSocket(
        'wss://api.hbdm.com/linear-swap-notification'
      ) // usdt margined
    }

    if (api._marketDataApi) {
      api._marketDataApi.binaryType = 'arraybuffer'

      // coin/linear swap & futures contracts
      console.debug(
        `[${this.id}] opened market data api ${api._marketDataApi.url} (associated with ${this.id})`
      )

      api._marketDataApi.onmessage = event => {
        const json = JSON.parse(pako.inflate(event.data, { to: 'string' }))
        if (json.op === 'ping') {
          api._marketDataApi.send(JSON.stringify({ op: 'pong', ts: json.ts }))
        } else if (json.data) {
          const pair = json.topic.replace(
            /public.(.*).liquidation_orders/,
            '$1'
          )

          this.emitLiquidations(
            api._id,
            json.data.map(trade => this.formatLiquidation(trade, pair))
          )
        }
      }

      api._marketDataApi.onopen = () => {
        for (const pair of api._connected) {
          this.subscribeLiquidations(api, pair)
        }
      }

      api._marketDataApi.onerror = () => {
        console.error(`[${this.id}] market data api errored`)
      }

      api._marketDataApi.onclose = () => {
        console.error(`[${this.id}] market data api closed`)
        api._marketDataApi = null

        setTimeout(() => {
          if (api.readyState === WebSocket.OPEN) {
            this.openMarketDataApi(api)
          }
        }, 1000)
      }
    }
  }
}
