/**
 * Frontend WebSocket Server
 * Accepts connections from the React frontend, sends initial state,
 * and streams real-time ticker updates as they arrive from WEEX.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { marketCache } from './marketCache.js';
import { weexSocket } from './weexSocket.js';
import { symbolManager } from './symbolManager.js';

class ClientSocketServer {
  constructor() {
    /** @type {WebSocketServer|null} */
    this.wss = null;
    /** @type {Set<WebSocket>} */
    this.clients = new Set();
    this.heartbeatInterval = null;
  }

  /**
   * Attaches the WebSocket server to an existing HTTP server instance
   * @param {import('http').Server} httpServer
   * @param {string} path WebSocket path (default '/ws')
   */
  attach(httpServer, path = '/ws') {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: path
    });

    console.log(`[clientSocket] Frontend WebSocket server listening on path: ${path}`);

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Wire up WEEX updates
    weexSocket.onTickerUpdate((ticker) => {
      this.broadcastTicker(ticker);
    });

    weexSocket.onStatusChange((status, stats) => {
      this.broadcastStatus(status, stats);
    });

    // Start heartbeat to drop dead client sockets
    this.startHeartbeat();
  }

  handleConnection(ws, req) {
    ws.isAlive = true;
    this.clients.add(ws);
    const ip = req.socket.remoteAddress;
    console.log(`[clientSocket] New frontend client connected from ${ip}. Total clients: ${this.clients.size}`);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (parsed.type === 'request_snapshot') {
          // Client can request fresh snapshot
          this.sendSnapshot(ws);
        }
      } catch (e) {
        // ignore
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[clientSocket] Frontend client disconnected. Remaining clients: ${this.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[clientSocket] Client socket error:', err.message);
      this.clients.delete(ws);
    });

    // Send initial snapshot & status immediately
    this.sendInit(ws);
  }

  /**
   * Sends initial state to newly connected client
   * @param {WebSocket} ws
   */
  sendInit(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const allTickers = marketCache.getAllTickers();
      const status = weexSocket.getAggregateStatus();
      const stats = weexSocket.getConnectionStats();

      const payload = {
        type: 'init',
        data: {
          status: status,
          totalSymbols: symbolManager.getTotalCount(),
          connections: stats,
          tickers: allTickers,
          timestamp: Date.now()
        }
      };

      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('[clientSocket] Error sending init to client:', err.message);
    }
  }

  /**
   * Sends snapshot of all tickers
   * @param {WebSocket} ws
   */
  sendSnapshot(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({
        type: 'snapshot',
        data: {
          tickers: marketCache.getAllTickers(),
          timestamp: Date.now()
        }
      }));
    } catch (e) {
      // ignore
    }
  }

  /**
   * Broadcasts the full active snapshot to all connected clients
   */
  broadcastSnapshot() {
    if (this.clients.size === 0) return;
    const message = JSON.stringify({
      type: 'snapshot',
      data: {
        tickers: marketCache.getAllTickers(),
        timestamp: Date.now()
      }
    });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Broadcasts a single ticker update to all connected frontend clients
   * Exactly matching requested example message structure:
   * {
   *   "type": "ticker",
   *   "data": {
   *     "symbol": "BTCUSDT",
   *     "lastPrice": "68920.40",
   *     "priceChangePercent": "1.25",
   *     "highPrice": "70000.00",
   *     "lowPrice": "68000.00",
   *     "lastUpdateTime": 1773295738000
   *   }
   * }
   * @param {Object} ticker
   */
  broadcastTicker(ticker) {
    if (this.clients.size === 0) return;

    const message = JSON.stringify({
      type: 'ticker',
      data: {
        symbol: ticker.symbol,
        lastPrice: ticker.lastPrice,
        priceChange: ticker.priceChange,
        priceChangePercent: ticker.priceChangePercent,
        highPrice: ticker.highPrice,
        lowPrice: ticker.lowPrice,
        bidPrice: ticker.bidPrice,
        askPrice: ticker.askPrice,
        volume: ticker.volume,
        quoteVolume: ticker.quoteVolume,
        lastUpdateTime: ticker.lastUpdateTime
      }
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Broadcasts status changes (connected, connecting, reconnecting, disconnected)
   */
  broadcastStatus(status, stats) {
    if (this.clients.size === 0) return;

    const message = JSON.stringify({
      type: 'status',
      data: {
        status: status,
        connections: stats,
        totalSymbols: symbolManager.getTotalCount(),
        timestamp: Date.now()
      }
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch (e) {
          this.clients.delete(client);
        }
      }
    }, 30000);
  }

  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
  }
}

export const clientSocket = new ClientSocketServer();
export default clientSocket;
