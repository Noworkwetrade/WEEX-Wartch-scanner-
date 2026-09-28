/**
 * In-Memory Market Cache
 * Stores the latest market data for all symbols
 */

class MarketCache {
  constructor() {
    /** @type {Map<string, Object>} */
    this.tickers = new Map();
    this.connectionStatus = 'disconnected'; // 'connected' | 'connecting' | 'reconnecting' | 'disconnected'
    this.lastUpdateTime = 0;
    this.totalUpdates = 0;
  }

  /**
   * Initializes symbols in the cache
   * @param {Array<Object>} symbolsList
   */
  initSymbols(symbolsList) {
    for (const item of symbolsList) {
      const sym = item.symbol;
      if (!this.tickers.has(sym)) {
        this.tickers.set(sym, {
          symbol: sym,
          baseAsset: item.baseAsset || '',
          quoteAsset: item.quoteAsset || '',
          lastPrice: '--',
          priceChange: '0.00',
          priceChangePercent: '0.00',
          highPrice: '--',
          lowPrice: '--',
          bidPrice: '--',
          askPrice: '--',
          volume: '0',
          quoteVolume: '0',
          lastUpdateTime: 0,
          connectionStatus: this.connectionStatus
        });
      }
    }
  }

  /**
   * Updates only a specific symbol's ticker
   * WEEX ticker event data item format:
   * d: [{ p: priceChange, P: priceChangePercent, c: lastPrice, h: highPrice, l: lowPrice, v: volume, q: quoteVolume, ... }]
   * @param {string} symbol
   * @param {Object} rawData
   * @param {number} eventTime
   * @returns {Object} Updated ticker object
   */
  updateTicker(symbol, rawData, eventTime = Date.now()) {
    const existing = this.tickers.get(symbol) || {
      symbol,
      baseAsset: '',
      quoteAsset: '',
      lastPrice: '--',
      priceChange: '0.00',
      priceChangePercent: '0.00',
      highPrice: '--',
      lowPrice: '--',
      bidPrice: '--',
      askPrice: '--',
      volume: '0',
      quoteVolume: '0',
      lastUpdateTime: 0,
      connectionStatus: this.connectionStatus
    };

    // WEEX ticker field mapping:
    // c = lastPrice (close)
    // p = priceChange
    // P = priceChangePercent (ratio string, e.g. "0.002314" or percentage)
    // h = highPrice
    // l = lowPrice
    // v = volume
    // q = quoteVolume
    // b = bidPrice (if available)
    // a = askPrice (if available)
    
    let lastPrice = existing.lastPrice;
    if (rawData.c !== undefined && rawData.c !== null) {
      lastPrice = String(rawData.c);
    }

    let priceChange = existing.priceChange;
    if (rawData.p !== undefined && rawData.p !== null) {
      priceChange = String(rawData.p);
    }

    let priceChangePercent = existing.priceChangePercent;
    if (rawData.P !== undefined && rawData.P !== null) {
      const numP = parseFloat(rawData.P);
      if (!isNaN(numP)) {
        // If WEEX sends ratio (e.g. 0.0125 = 1.25%), convert to percent:
        // Note: if the absolute value is < 1.0 (excluding edge cases), WEEX sends ratio e.g. 0.002314
        const percentValue = numP * 100;
        priceChangePercent = percentValue.toFixed(2);
      } else {
        priceChangePercent = String(rawData.P);
      }
    }

    let highPrice = existing.highPrice;
    if (rawData.h !== undefined && rawData.h !== null) {
      highPrice = String(rawData.h);
    }

    let lowPrice = existing.lowPrice;
    if (rawData.l !== undefined && rawData.l !== null) {
      lowPrice = String(rawData.l);
    }

    let bidPrice = existing.bidPrice;
    if (rawData.b !== undefined && rawData.b !== null) {
      bidPrice = String(rawData.b);
    }

    let askPrice = existing.askPrice;
    if (rawData.a !== undefined && rawData.a !== null) {
      askPrice = String(rawData.a);
    }

    let volume = existing.volume;
    if (rawData.v !== undefined && rawData.v !== null) {
      volume = String(rawData.v);
    }

    let quoteVolume = existing.quoteVolume;
    if (rawData.q !== undefined && rawData.q !== null) {
      quoteVolume = String(rawData.q);
    }

    const updatedTicker = {
      ...existing,
      symbol,
      lastPrice,
      priceChange,
      priceChangePercent,
      highPrice,
      lowPrice,
      bidPrice,
      askPrice,
      volume,
      quoteVolume,
      lastUpdateTime: eventTime || Date.now(),
      connectionStatus: this.connectionStatus
    };

    this.tickers.set(symbol, updatedTicker);
    this.lastUpdateTime = updatedTicker.lastUpdateTime;
    this.totalUpdates++;

    return updatedTicker;
  }

  /**
   * Returns a single ticker
   * @param {string} symbol
   */
  getTicker(symbol) {
    return this.tickers.get(symbol) || null;
  }

  /**
   * Bulk updates tickers from REST snapshot (from /api/v2/market/tickers)
   * Automatically removes any assets that WEEX is no longer actively pushing.
   * @param {Array<Object>} rawTickersList
   * @returns {{ updated: number, removed: number }}
   */
  updateFromV2Snapshot(rawTickersList) {
    if (!Array.isArray(rawTickersList)) return { updated: 0, removed: 0 };

    const activeWeexSymbols = new Set();
    let updatedCount = 0;
    let removedCount = 0;

    for (const item of rawTickersList) {
      if (!item || !item.symbol) continue;
      const cleanSymbol = item.symbol.replace(/_SPBL$/i, "").replace(/_/, "").toUpperCase();
      const price = item.lastPrice || item.close;
      if (!price || price === '--') continue;

      activeWeexSymbols.add(cleanSymbol);
      const existing = this.tickers.get(cleanSymbol);

      const change = item.priceChange !== undefined ? String(item.priceChange) : (existing?.priceChange || '0.00');
      let changePercent = '0.00';
      if (item.priceChangePercent !== undefined) {
        const pNum = parseFloat(item.priceChangePercent);
        changePercent = !isNaN(pNum) ? (pNum * 100).toFixed(2) : '0.00';
      } else if (existing?.priceChangePercent) {
        changePercent = existing.priceChangePercent;
      }

      this.tickers.set(cleanSymbol, {
        symbol: cleanSymbol,
        baseAsset: existing?.baseAsset || cleanSymbol.replace(/USDT$|USDC$|BTC$|ETH$/, ''),
        quoteAsset: existing?.quoteAsset || (cleanSymbol.endsWith('USDC') ? 'USDC' : 'USDT'),
        lastPrice: String(price),
        priceChange: change,
        priceChangePercent: changePercent,
        highPrice: item.high !== undefined ? String(item.high) : (existing?.highPrice || '--'),
        lowPrice: item.low !== undefined ? String(item.low) : (existing?.lowPrice || '--'),
        bidPrice: existing?.bidPrice || '--',
        askPrice: existing?.askPrice || '--',
        volume: item.size !== undefined ? String(item.size) : (existing?.volume || '0'),
        quoteVolume: item.value !== undefined ? String(item.value) : (existing?.quoteVolume || '0'),
        lastUpdateTime: item.ts || Date.now(),
        connectionStatus: this.connectionStatus,
        priceDirection: existing?.priceDirection || 'neutral',
        flashTimestamp: existing?.flashTimestamp || 0
      });
      this.totalUpdates++;
      updatedCount++;
    }

    // Automatically remove any asset no longer actively pushed by WEEX
    if (activeWeexSymbols.size > 0) {
      for (const sym of this.tickers.keys()) {
        if (!activeWeexSymbols.has(sym)) {
          this.tickers.delete(sym);
          removedCount++;
        }
      }
    }

    this.lastUpdateTime = Date.now();
    return { updated: updatedCount, removed: removedCount };
  }

  /**
   * Returns all tickers as array
   * @returns {Array<Object>}
   */
  getAllTickers() {
    return Array.from(this.tickers.values());
  }

  /**
   * Set connection status for all tickers
   * @param {'connected' | 'connecting' | 'reconnecting' | 'disconnected'} status
   */
  setConnectionStatus(status) {
    this.connectionStatus = status;
    for (const [sym, ticker] of this.tickers.entries()) {
      ticker.connectionStatus = status;
    }
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  getStats() {
    return {
      totalSymbols: this.tickers.size,
      connectionStatus: this.connectionStatus,
      lastUpdateTime: this.lastUpdateTime,
      totalUpdates: this.totalUpdates
    };
  }
}

export const marketCache = new MarketCache();
export default marketCache;
