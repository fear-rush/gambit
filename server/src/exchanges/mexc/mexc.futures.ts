export function handleFuturesMessage(
  json: unknown,
  contractSizes: { [pair: string]: number },
  inversed: { [pair: string]: boolean }
) {
  const data = json as Record<string, unknown>
  // Futures trade messages
  if (data.channel === 'push.deal' && data.data && Array.isArray(data.data)) {
    return data.data.map(trade =>
      formatFuturesTrade(trade, data.symbol as string, contractSizes, inversed)
    )
  }

  // Handle futures subscription responses and pong
  if (data.channel === 'rs.sub.deal' || data.channel === 'pong') {
    return true
  }

  return false
}

function formatFuturesTrade(
  trade: Record<string, unknown>,
  pair: string,
  contractSizes: { [pair: string]: number },
  inversed: { [pair: string]: boolean }
) {
  // MEXC Futures: trade.v is number of contracts
  const contractSize = contractSizes[pair] || 1
  const isInverse = inversed[pair]

  // For linear (USDT): v * contractSize = base amount (BTC)
  // For inverse (USD): v * contractSize = USD value, divide by price for base
  const size = isInverse
    ? (+trade.v * contractSize) / +trade.p
    : +trade.v * contractSize

  return {
    exchange: 'MEXC' as const,
    pair: pair,
    timestamp: trade.t as number,
    price: +(trade.p as number),
    size: size,
    side: (trade.T === 1 ? 'buy' : 'sell') as 'buy' | 'sell'
  }
}
