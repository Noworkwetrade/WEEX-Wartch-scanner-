/**
 * WEEX WebSocket Pool Manager
 * Manages multiple WebSocket connections to WEEX Spot v3 Public WebSocket
 * Automatically divides symbols into groups of <= 100 channels per connection
 * Handles ping/pong, automatic reconnect, and subscription restoration
 */

import WebSocket from 'ws';
import { marketCache } from './marketCache.js';

const WEEX_WS_URL = 'wss://ws-spot.weex.com/v3/ws/public';
const USER_AGENT = 'NWWT-WEEX-WATCHLIST/1.0';

/**
 * Represents a single managed connection to WEEX WebSocket
 * Handles <= 100 symbols
 */
class WeexSingleConnection {
  /**
   * @param {number} connectionId 1-based connection index
   * @param {Array<string>} symbols Array of symbol names (max 100)
   * @param {Object} callbacks Callbacks for ticker updates and status changes
   */
  constructor(connectionId, symbols, callbacks) {
    this.connectionId = connectionId;
    this.symbols = symbols; // e.g. ["BTCUSDT", "ETHUSDT", ...]
    this.callbacks = callbacks || {};
    
    this.ws = null;
    this.status = 'disconnected'; // 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.pingInterval = null;
    this.watchdogTimeout = null;
    this.isDestroyed = false;
    this.lastMessageTime = 0;
    this.subscribed = false;
    this.isForbidden = false;
  }

  /**
   * Connects to WEEX WebSocket
   */
  connect() {
    if (this.isDestroyed) return;
    
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(WEEX_WS_URL, {
        headers: {
          'User-Agent': USER_AGENT
        },
        handshakeTimeout: 10000
      });

      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('error', (err) => this.handleError(err));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason));
      this.ws.on('ping', (data) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong(data);
        }
      });
      this.ws.on('pong', () => {
        this.resetWatchdog();
      });
    } catch (err) {
      console.error(`[weexSocket][Conn #${this.connectionId}] Connection creation error:`, err.message);
      this.scheduleReconnect();
    }
  }

  handleOpen() {
    console.log(`[weexSocket][Conn #${this.connectionId}] Connected to WEEX! Subscribing to ${this.symbols.length} symbols...`);
    this.setStatus('connected');
    this.reconnectAttempts = 0;
    this.isForbidden = false;
    this.lastMessageTime = Date.now();
    this.startHeartbeat();
    this.subscribe();
  }

  /**
   * Subscribes to the assigned symbols in format "SYMBOL@ticker"
   * Divides params into batches of <= 100 channels per SUBSCRIBE request
   */
  subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Convert symbols to format "SYMBOL@ticker"
    const params = this.symbols.map((sym) => `${sym}@ticker`);
    const BATCH_SIZE = 100;

    try {
      for (let i = 0; i < params.length; i += BATCH_SIZE) {
        const batch = params.slice(i, i + BATCH_SIZE);
        const subMessage = {
          method: 'SUBSCRIBE',
          params: batch,
          id: this.connectionId * 1000 + i
        };
        this.ws.send(JSON.stringify(subMessage));
      }
      this.subscribed = true;
      console.log(`[weexSocket][Conn #${this.connectionId}] Sent SUBSCRIBE for ${params.length} symbols in batches of <= 100 channels`);
    } catch (err) {
      console.error(`[weexSocket][Conn #${this.connectionId}] Error sending subscribe:`, err.message);
    }
  }

  handleMessage(raw) {
    this.lastMessageTime = Date.now();
    this.resetWatchdog();

    try {
      const text = raw.toString();
      const msg = JSON.parse(text);

      // Handle WEEX JSON Ping
      if (msg.ping) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ pong: msg.ping }));
        }
        return;
      }

      // Handle subscription ack
      if (msg.result !== undefined && msg.id !== undefined) {
        // Ack for SUBSCRIBE
        return;
      }

      // Handle ticker data
      // Structure: { e: "ticker", E: timestamp, s: "BTCUSDT", d: [{ p, P, c, h, l, v, q, ... }] }
      if (msg.e === 'ticker' && msg.s && Array.isArray(msg.d) && msg.d.length > 0) {
        const symbol = msg.s;
        const tickerData = msg.d[0];
        const eventTime = msg.E || Date.now();

        // Update in-memory market cache
        const updatedTicker = marketCache.updateTicker(symbol, tickerData, eventTime);

        // Notify callback (to push to frontend clients)
        if (typeof this.callbacks.onTickerUpdate === 'function') {
          this.callbacks.onTickerUpdate(updatedTicker);
        }
        return;
      }

      // Handle other potential WEEX event formats
      if (msg.action === 'ping' || msg.event === 'ping') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'pong', event: 'pong' }));
        }
      }
    } catch (err) {
      // Ignore unparseable or binary frames
    }
  }

  handleError(err) {
    if (err.message && err.message.includes('403')) {
      this.isForbidden = true;
      console.warn(`[weexSocket][Conn #${this.connectionId}] 403 Forbidden received (IP connection limit reached). Backing off gracefully.`);
    } else {
      console.error(`[weexSocket][Conn #${this.connectionId}] WS Error:`, err.message);
    }
  }

  handleClose(code, reason) {
    console.warn(`[weexSocket][Conn #${this.connectionId}] WS Closed (Code: ${code}, Reason: ${reason ? reason.toString() : 'None'})`);
    this.cleanupSocket();
    this.scheduleReconnect();
  }

  startHeartbeat() {
    this.stopHeartbeat();

    // Check connection health every 15 seconds
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
          // Send JSON ping as well for exchanges requiring application-level heartbeat
          this.ws.send(JSON.stringify({ ping: Date.now() }));
        } catch (e) {
          // ignore
        }
      }
    }, 15000);

    this.resetWatchdog();
  }

  resetWatchdog() {
    if (this.watchdogTimeout) {
      clearTimeout(this.watchdogTimeout);
    }
    // If no message or pong received in 45 seconds, assume stale and reconnect
    this.watchdogTimeout = setTimeout(() => {
      console.warn(`[weexSocket][Conn #${this.connectionId}] Watchdog timeout: no data for 45s, reconnecting...`);
      if (this.ws) {
        this.ws.terminate();
      }
    }, 45000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.watchdogTimeout) {
      clearTimeout(this.watchdogTimeout);
      this.watchdogTimeout = null;
    }
  }

  cleanupSocket() {
    this.stopHeartbeat();
    this.subscribed = false;
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
  }

  scheduleReconnect() {
    if (this.isDestroyed) return;
    this.setStatus('reconnecting');

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;

    // If connection received 403 Forbidden (IP limit reached), back off 30s to allow IP tables to clear
    let delay;
    if (this.isForbidden) {
      delay = 30000 + Math.random() * 5000;
      console.warn(`[weexSocket][Conn #${this.connectionId}] Rate-limited / 403 backoff for ${Math.round(delay / 1000)}s...`);
      this.isForbidden = false;
    } else {
      // Exponential backoff: 1s, 2s, 4s, 8s, up to 15s + jitter
      delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000) + Math.random() * 1000;
      console.log(`[weexSocket][Conn #${this.connectionId}] Reconnecting in ${Math.round(delay)}ms (Attempt ${this.reconnectAttempts})...`);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      if (typeof this.callbacks.onStatusChange === 'function') {
        this.callbacks.onStatusChange(this.connectionId, status);
      }
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanupSocket();
    this.setStatus('disconnected');
  }

  getStats() {
    return {
      connectionId: this.connectionId,
      status: this.status,
      symbolsCount: this.symbols.length,
      subscribed: this.subscribed,
      lastMessageTime: this.lastMessageTime,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

/**
 * Pool Manager for all WEEX WebSocket connections
 */
class WeexSocketPool {
  constructor() {
    /** @type {Array<WeexSingleConnection>} */
    this.connections = [];
    this.tickerUpdateListener = null;
    this.statusChangeListener = null;
    this.aggregateStatus = 'disconnected';
  }

  /**
   * Initializes the pool with symbol chunks
   * Staggers connection establishment to avoid network spikes
   * @param {Array<Array<string>>} symbolChunks Array of symbol arrays (<= 100 symbols each)
   */
  async start(symbolChunks) {
    this.stop();
    console.log(`[weexSocket] Starting pool with ${symbolChunks.length} connections...`);
    this.connections = [];

    const callbacks = {
      onTickerUpdate: (ticker) => {
        if (typeof this.tickerUpdateListener === 'function') {
          this.tickerUpdateListener(ticker);
        }
      },
      onStatusChange: (connId, status) => {
        this.updateAggregateStatus();
      }
    };

    // Stagger opening connections (350ms apart) to respect handshake rate limits
    for (let i = 0; i < symbolChunks.length; i++) {
      const conn = new WeexSingleConnection(i + 1, symbolChunks[i], callbacks);
      this.connections.push(conn);
      
      setTimeout(() => {
        conn.connect();
      }, i * 350);
    }

    this.updateAggregateStatus();
  }

  updateAggregateStatus() {
    if (this.connections.length === 0) {
      this.setAggregateStatus('disconnected');
      return;
    }

    const statuses = this.connections.map((c) => c.status);
    const connectedCount = statuses.filter((s) => s === 'connected').length;
    const reconnectingCount = statuses.filter((s) => s === 'reconnecting').length;
    const connectingCount = statuses.filter((s) => s === 'connecting').length;

    let newStatus = 'disconnected';
    if (connectedCount === this.connections.length) {
      newStatus = 'connected';
    } else if (connectedCount > 0 && reconnectingCount > 0) {
      newStatus = 'reconnecting';
    } else if (reconnectingCount > 0) {
      newStatus = 'reconnecting';
    } else if (connectingCount > 0 || connectedCount > 0) {
      newStatus = 'connecting';
    } else {
      newStatus = 'disconnected';
    }

    this.setAggregateStatus(newStatus);
  }

  setAggregateStatus(status) {
    if (this.aggregateStatus !== status) {
      this.aggregateStatus = status;
      marketCache.setConnectionStatus(status);
      if (typeof this.statusChangeListener === 'function') {
        this.statusChangeListener(this.aggregateStatus, this.getConnectionStats());
      }
    }
  }

  onTickerUpdate(listener) {
    this.tickerUpdateListener = listener;
  }

  onStatusChange(listener) {
    this.statusChangeListener = listener;
  }

  getAggregateStatus() {
    return this.aggregateStatus;
  }

  getConnectionStats() {
    const total = this.connections.length;
    const connected = this.connections.filter((c) => c.status === 'connected').length;
    const reconnecting = this.connections.filter((c) => c.status === 'reconnecting').length;
    const connecting = this.connections.filter((c) => c.status === 'connecting').length;
    const disconnected = this.connections.filter((c) => c.status === 'disconnected').length;

    return {
      total,
      connected,
      reconnecting,
      connecting,
      disconnected,
      aggregateStatus: this.aggregateStatus,
      connections: this.connections.map((c) => c.getStats())
    };
  }

  stop() {
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections = [];
    this.setAggregateStatus('disconnected');
  }
}

export const weexSocket = new WeexSocketPool();
export default weexSocket;
