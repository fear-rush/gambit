# Gambit

Real-time cryptocurrency trade aggregator. Connects to 27+ exchange WebSockets simultaneously, processes and aggregates trades server-side, and streams live data to a React frontend over WebSocket.

## How It Works

```
Exchange WebSockets ──► Server (Bun)
                         ├─ Exchange Adapters (parse raw WS messages)
                         ├─ Aggregator (merge, threshold, bucket trades)
                         └─ Broadcast via ServerWebSocket
                              │
                              ▼
                         Client (React)
                         ├─ WebSocket connection to /ws
                         ├─ Candlestick chart (lightweight-charts v5)
                         ├─ Trade feed, volume, indicators
                         └─ Market search & multi-exchange connect
```

The server connects directly to exchange WebSockets — no CORS proxies, no browser limitations. Each exchange has a dedicated adapter that normalizes trade data into a common format. The aggregator merges trades across exchanges, computes thresholds, and broadcasts structured payloads to all connected browser clients.

The client is a thin display layer. It receives pre-processed trade data over a single WebSocket and renders candlestick charts, volume histograms, EMA/RSI indicators, and a real-time trade feed. No heavy processing happens in the browser.

## Supported Exchanges

Binance, Binance Futures, Binance US, Bitfinex, Bitget, BitMart, BitMEX, Bitunix, Bybit, Coinbase, Crypto.com, Deribit, dYdX, Gate.io, HitBTC, Huobi, Hyperliquid, Kraken, KuCoin, MEXC, OKX, Phemex, Poloniex, WhiteBit

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.2.4+

### Install

```bash
bun install
```

This installs all workspace dependencies and automatically builds the `shared` and `server` packages so types are available immediately.

### Development

```bash
# Run both server and client with hot reload
bun run dev

# Or run individually
bun run dev:server    # Bun server on :3000
bun run dev:client    # Vite dev server on :5173
```

The server auto-connects to `BINANCE:btcusdt` and `BITSTAMP:btcusd` on startup. Open the client and you'll see live chart data immediately.

### Build

```bash
bun run build           # Build all workspaces
bun run build:client    # Client only
bun run build:server    # Server only
```

### Lint & Type Check

```bash
bun run lint            # Biome linter
bun run format          # Biome formatter
bun run type-check      # TypeScript across all workspaces
bun run test            # Run tests
```

## Architecture

### Monorepo Structure

```
gambit/
├── server/                 # Bun server — exchange connections & aggregation
│   └── src/
│       ├── index.ts        # Bun.serve() — HTTP + WebSocket handlers
│       ├── aggregator.ts   # Trade aggregation, thresholds, broadcasting
│       ├── exchange.ts     # Base Exchange class (WS lifecycle, subscriptions)
│       ├── productsService.ts  # Exchange product fetching + cache
│       ├── settings.ts     # Aggregator runtime settings
│       ├── proxy.ts        # Generic WebSocket proxy
│       ├── helpers/
│       │   └── utils.ts
│       └── exchanges/      # 27 exchange adapters
│           ├── binance.ts
│           ├── coinbase.ts
│           ├── ...
│           └── index.ts    # Registry of all adapters
├── client/                 # React frontend — display layer
│   └── src/
│       ├── routes/         # TanStack Router file-based routes
│       ├── hooks/
│       │   ├── useAggregator.tsx  # WS lifecycle & event wiring
│       │   ├── useChart.ts        # lightweight-charts setup & trade rendering
│       │   ├── useTrades.ts       # Real-time trade feed (connection-aware filtering)
│       │   └── useConnections.ts  # Market connect/disconnect (optimistic UI)
│       ├── services/
│       │   ├── aggregatorService.ts  # WebSocket client (EventEmitter3)
│       │   ├── productIndex.ts       # Product search & filtering
│       │   └── productsService.ts    # Price formatting utilities
│       ├── stores/         # Zustand stores (chart settings, etc.)
│       ├── components/     # React components
│       └── lib/
│           └── chart/      # Chart options, indicators, grouping
├── shared/                 # Shared TypeScript types
│   └── src/types/
│       ├── trade.ts        # Trade, Connection, Ticker, ProductsData
│       └── worker.ts       # AggregatorPayload, AggregatorSettings
├── turbo.json              # Turbo build orchestration
├── biome.json              # Linting & formatting config
└── package.json
```

### Server

Built on raw `Bun.serve()` with no framework. Exposes four endpoints:

| Endpoint | Type | Description |
|----------|------|-------------|
| `/ws` | WebSocket | Aggregator stream — clients connect here for live trade data |
| `/ws-proxy` | WebSocket | Generic WS proxy (pass `?target=<url>`) |
| `/api/products/search` | REST | Search/filter pairs (`?q=BTC&exchanges=BINANCE&types=spot`) |
| `/api/products/pair` | REST | Products for a specific pair (`?local=BTCUSD`) |
| `/api/products/exchanges` | REST | List of all available exchanges |
| `/health` | REST | Health check |

**Exchange adapters** (`server/src/exchanges/`) each implement:
- `formatProducts()` — normalize exchange's product list
- `subscribe()` / `unsubscribe()` — send WS subscription messages
- `formatTrade()` — parse raw WS message into a common `Trade` object
- `onMessage()` — handle incoming WS frames

The base `Exchange` class (`server/src/exchange.ts`) manages WebSocket connections, automatic reconnection, keep-alive pings, and subscription routing across multiple API connections per exchange.

The **Aggregator** (`server/src/aggregator.ts`) receives `connect`/`disconnect` commands from clients, manages exchange subscriptions with reference counting, and broadcasts trade data, tickers, and connection state to all connected clients.

### Client

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TanStack Router | File-based routing |
| TanStack Query | Server state management |
| Tailwind CSS v4 | Styling |
| lightweight-charts v5 | Candlestick & indicator charts |
| EventEmitter3 | Aggregator event bus |
| Zustand | Local UI state (chart settings) |

Trade data bypasses React state for performance — the `aggregatorService` emits events directly to chart and trade feed hooks, which perform imperative DOM/canvas updates via `requestAnimationFrame`.

### Shared Types

Types are defined in `shared/src/types/` and imported by both client and server:

```typescript
import type { Trade, AggregatorPayload, Ticker } from "shared";
```

### Code Style

[Biome](https://biomejs.dev) handles both linting and formatting. Tabs for indentation, double quotes. Exchange adapters have lint/format overrides disabled since they are ported from external source.

## Client-Server Protocol

Communication uses JSON `AggregatorPayload` messages over WebSocket:

```typescript
interface AggregatorPayload {
  op: string;       // "connect" | "disconnect" | "trades" | "price" | ...
  data?: unknown;
  trackingId?: string;  // For request/response pattern
}
```

**Client → Server:** `connect`, `disconnect`

**Server → Client:** `trades`, `price`, `connection`, `disconnection`, `tickers`, `notice`

The `trackingId` field enables async request/response over WebSocket — the client sends a payload with a generated ID, and the server echoes it back on the response so the client can resolve the matching promise.

## What's Been Done

### Server-Side Trade Processing
- Migrated all exchange adapters and aggregation logic from a client-side Web Worker to a Bun server process
- Server connects directly to 27+ exchange WebSockets — no CORS proxy needed for trade data
- Server builds and maintains a product index on startup, exposes REST endpoints for search/filter
- New clients receive full connection state and latest tickers on WebSocket connect (no cold start)
- Bun native pub/sub (`server.publish`/`ws.subscribe`) for O(1) broadcast to all clients — no manual client iteration
- Fixed WebSocket disconnect race condition — Bun fires `onclose` synchronously inside `api.close()`, which caused Promise constructor to fail. Resolver is now assigned before `close()` is called.

### Market Selector
- Server-side search and filtering (`/api/products/search`, `/api/products/pair`, `/api/products/exchanges`)
- TanStack Query on the client for caching, request deduplication, and automatic cancellation of stale requests
- Selector acts as source of truth — "Apply" diffs current vs desired connections, connects new markets and disconnects removed ones (default markets are permanent)
- Debounced search input (150ms) prevents spamming the server
- Optimistic UI — disconnected markets are removed from the store immediately on Apply, before the server confirms. Users see exactly what they picked with zero delay.

### Charting
- lightweight-charts v5 with candlestick + volume histogram
- Dynamic panel toggling (volume, delta, RSI) without recreating the chart — uses `addPane()`/`removePane()`
- Visibility-aware scheduling — `requestAnimationFrame` when tab is active, `setTimeout` fallback when hidden so chart processing continues in background
- Capped `barIndicators` Map (500 entries FIFO) and trade queue (5000 entries) to prevent unbounded memory growth

### Performance
- Trade data bypasses React state entirely — EventEmitter events go straight to imperative chart/DOM updates
- Zustand stores for connections and tickers with minimal re-renders
- Trade feed filters out trades from disconnected markets immediately — both purges existing trades and gates incoming ones
- `lightweight-charts` split into a separate chunk (168KB) via Vite `manualChunks`, lazy-loaded `SearchDialog` with preload on hover
- Exchange adapters excluded from strict TypeScript and Biome lint (ported as-is from aggr)
- Dead code eliminated: removed unused stores (tickerStore), hooks (useTickers), components (MarketSelector), services (randomString, listenUtilityEvents, SMA indicators, dead productsService exports)

## Testing Checklist

Manual test plan covering all client-server interactions. Run both `bun run dev:server` (port 3000) and `bun run dev:client` (port 5173).

### Server

- [ ] **Health endpoint** — `GET /health` returns `{ status: "ok", uptime: ... }`
- [ ] **Exchanges endpoint** — `GET /api/products/exchanges` returns all 27 exchange IDs
- [ ] **Product search** — `GET /api/products/search?q=btc` returns grouped pairs with counts
- [ ] **Product search with filters** — `GET /api/products/search?q=btc&types=spot&exchanges=BINANCE` filters correctly
- [ ] **Pair detail** — `GET /api/products/pair?local=BTCUSD` returns individual products per exchange
- [ ] **Pair detail with filters** — `GET /api/products/pair?local=BTCUSD&types=spot` respects type filter
- [ ] **Default connections on startup** — Server auto-connects `BINANCE:btcusdt` and `BITSTAMP:btcusd` after product fetch
- [ ] **WebSocket connect** — Client connects to `/ws`, receives `connection` events for all active markets
- [ ] **WebSocket initial tickers** — New client receives `tickers` payload with current prices on connect
- [ ] **Trade streaming** — Server broadcasts `trades` events with exchange/pair/price/side/size data
- [ ] **Ticker updates** — Server broadcasts periodic `tickers` updates
- [ ] **Connect command** — Client sends `{ op: "connect", data: ["BYBIT:BTCUSDT"] }`, server subscribes and broadcasts `connection` event
- [ ] **Disconnect command** — Client sends `{ op: "disconnect", data: ["BYBIT:BTCUSDT"] }`, server unsubscribes and broadcasts `disconnection` event
- [ ] **Disconnect completes without crash** — `exchange.removeWs()` Promise resolves correctly even though Bun fires `onclose` synchronously
- [ ] **Bulk disconnect** — Disconnecting 20+ markets at once completes without errors
- [ ] **Reconnection** — If an exchange WebSocket drops, the adapter reconnects automatically
- [ ] **Pub/sub broadcast** — Multiple clients connected to `/ws` all receive the same trade data
- [ ] **CORS headers** — All REST and WebSocket responses include proper CORS headers
- [ ] **WebSocket proxy** — `GET /ws-proxy?target=<url>` upgrades and proxies to target WebSocket

### Client

#### Connection Bar
- [ ] **Shows default markets** — `BINANCE:btcusdt` and `BITSTAMP:btcusd` visible on load with green styling
- [ ] **Shows added markets** — Newly connected markets appear with neutral styling
- [ ] **Dismiss button** — Non-default markets show `x` button, clicking it disconnects the market
- [ ] **Default markets undismissable** — Default markets do not show `x` button
- [ ] **Hidden scrollbar** — Horizontal overflow scrolls without visible scrollbar
- [ ] **Immediate removal** — Disconnected markets disappear from the bar instantly (optimistic UI)

#### Search Dialog
- [ ] **Opens** — Clicking the search trigger opens the dialog
- [ ] **Pre-populated** — Current connections are pre-checked on open
- [ ] **Search** — Typing filters pairs in real-time with 150ms debounce
- [ ] **Exchange filter** — Sidebar checkboxes filter results by exchange
- [ ] **Type filter** — Spot/Perp/Futures checkboxes filter results by market type
- [ ] **Clear filters** — "Clear filters" link resets exchange and type filters
- [ ] **Expand pair** — Clicking a pair row expands to show individual exchange markets
- [ ] **Select all toggle** — Pair checkbox toggles all markets for that pair
- [ ] **Individual toggle** — Each market row can be checked/unchecked independently
- [ ] **Selected count** — Header shows accurate count of selected markets
- [ ] **Apply** — Clicking Apply connects new markets and disconnects removed ones
- [ ] **Cancel** — Clicking Cancel or pressing Escape closes without changes
- [ ] **Stale results overlay** — "Updating..." indicator shows when refetching with stale data visible
- [ ] **Loading spinner** — Spinner shows during initial search load

#### Market Selection Flow (critical path)
- [ ] **Select all then deselect** — Select all BTCUSD spot markets (~50), then deselect to keep only 5. Connection bar should show exactly 7 (2 defaults + 5 selected). Not 24, not 50.
- [ ] **Rapid re-selection** — Quickly open dialog, change selection, apply, reopen, change again. No stale connections should remain.
- [ ] **Default markets persist** — After any selection change, `BINANCE:btcusdt` and `BITSTAMP:btcusd` always remain connected

#### Trade Feed
- [ ] **Shows trades** — Real-time trades appear with timestamp, exchange, price, amount
- [ ] **Buy/sell coloring** — Buy trades are green, sell trades are red
- [ ] **Min amount filter** — Setting a minimum dollar amount filters out small trades
- [ ] **Purges on disconnect** — When a market is disconnected, its trades are immediately removed from the feed
- [ ] **Gates new trades** — After disconnect, no new trades from that market appear even if the server is still sending them briefly
- [ ] **Max 100 trades** — Feed never exceeds 100 rows

#### Chart
- [ ] **Renders candlesticks** — Candlestick chart renders with incoming trade data
- [ ] **Volume histogram** — Volume bars appear below the candlestick chart
- [ ] **Panel toggles** — Volume/Delta/RSI panels can be toggled without chart recreation
- [ ] **Background tab** — Chart continues processing when tab is hidden (setTimeout fallback)
- [ ] **Memory bounded** — `barIndicators` Map stays under 500 entries, trade queue under 5000

#### General
- [ ] **WebSocket reconnect** — If server restarts, client reconnects and receives current state
- [ ] **No console errors** — No runtime errors in browser console during normal operation
- [ ] **Clean build** — `bun run lint && bun run type-check && bun run build` all pass with zero warnings

## To Do

- [ ] Persist market selections to localStorage or server so connections survive page reload
- [ ] Historical data backfill — fetch OHLCV history from exchange REST APIs to populate chart on initial load instead of starting empty
- [ ] Timeframe selector — currently hardcoded, should support 1s/5s/15s/1m/5m/15m/1h/4h/1d
- [ ] Multi-chart layout — split view to watch multiple pairs simultaneously
- [ ] Trade threshold alerts — configurable notifications for large trades (whale alerts)
- [ ] ClickHouse integration — persist trades to a time-series database for historical analysis and replay
- [ ] Order book depth visualization — aggregate L2 order book data across exchanges
- [ ] Liquidation tracking — track and display liquidation events from derivatives exchanges
- [ ] Audio alerts — configurable sounds for large trades, threshold crossings
- [ ] Dark/light theme toggle
- [ ] Mobile-responsive layout
- [ ] Docker deployment with compose file for server + client
- [ ] Rate limiting on REST endpoints
- [ ] WebSocket authentication for private deployments
- [ ] Exchange health monitoring dashboard — show connection status, latency, message rates per exchange

## Credits

- [aggr](https://github.com/Tucsky/aggr) by Tucsky — The exchange adapters, aggregation engine, and trade processing architecture are derived from aggr, a powerful open-source crypto trade aggregator. Gambit ports the core engine from a client-side Web Worker to a server-side Bun process.
- [bhvr](https://github.com/stevedylandev/bhvr) by Steve Simkins — The monorepo scaffolding (Bun + Vite + React + Turbo workspaces with shared types) was bootstrapped from the bhvr template.

## License

MIT
