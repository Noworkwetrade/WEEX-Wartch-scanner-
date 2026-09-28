/**
 * Symbol Manager
 * Loads trading symbols dynamically from WEEX Spot v3 API
 * Divides symbols into chunks of <= 100 to strictly respect WEEX's 100-channel limit per connection
 */

import { fetchExchangeInfo, fetchSpotTickers } from './weexRest.js';
import { marketCache } from './marketCache.js';

// WEEX has a strict limit of 20 concurrent WebSocket connections per IP address.
// To avoid 403 Forbidden handshake rejections and allow headroom for reconnects,
// we cap concurrent connections at 16, dividing all trading symbols across them.
const MAX_CONCURRENT_CONNECTIONS = 16;
const MAX_CHANNELS_PER_CONNECTION = 100;

class SymbolManager {
  constructor() {
    /** @type {Array<Object>} */
    this.rawSymbols = [];
    /** @type {Array<string>} */
    this.symbolNames = [];
    /** @type {Map<string, Object>} */
    this.symbolMetaMap = new Map();
    /** @type {Array<Array<string>>} */
    this.symbolChunks = [];
    this.isLoaded = false;
    this.lastLoadedTime = 0;
  }

  /**
   * Loads symbols dynamically from WEEX REST API
   * Divides them into groups of <= 100, respecting WEEX concurrent IP limit
   */
  async loadSymbols() {
    try {
      console.log('[symbolManager] Fetching trading symbols from WEEX Spot v3 API...');
      const exchangeInfo = await fetchExchangeInfo();
      this.rawSymbols = exchangeInfo.symbols;
      
      this.symbolNames = [];
      this.symbolMetaMap.clear();

      for (const item of this.rawSymbols) {
        this.symbolNames.push(item.symbol);
        this.symbolMetaMap.set(item.symbol, {
          symbol: item.symbol,
          baseAsset: item.baseAsset,
          quoteAsset: item.quoteAsset,
          tickSize: item.tickSize,
          stepSize: item.stepSize,
          minTradeAmount: item.minTradeAmount,
          maxTradeAmount: item.maxTradeAmount
        });
      }

      // Group symbols into chunks:
      // If symbol count <= 1600, use 100 per connection (at most 16 connections)
      // If symbol count > 1600, distribute across MAX_CONCURRENT_CONNECTIONS (16)
      const numGroups = Math.min(
        MAX_CONCURRENT_CONNECTIONS,
        Math.max(1, Math.ceil(this.symbolNames.length / MAX_CHANNELS_PER_CONNECTION))
      );
      const chunkSize = Math.ceil(this.symbolNames.length / numGroups);

      this.symbolChunks = [];
      for (let i = 0; i < this.symbolNames.length; i += chunkSize) {
        this.symbolChunks.push(this.symbolNames.slice(i, i + chunkSize));
      }

      console.log(
        `[symbolManager] Loaded ${this.symbolNames.length} trading symbols. ` +
        `Divided into ${this.symbolChunks.length} connection groups (~${chunkSize} symbols each, within 20 IP conn limit).`
      );

      // Initialize the market cache with all symbols
      marketCache.initSymbols(this.rawSymbols);

      // Immediately fetch live 24hr statistics and prices for all symbols from WEEX v2 tickers
      try {
        console.log('[symbolManager] Fetching live 24hr prices snapshot for all WEEX pairs...');
        const v2Tickers = await fetchSpotTickers();
        if (v2Tickers && v2Tickers.length > 0) {
          marketCache.updateFromV2Snapshot(v2Tickers);
          console.log(`[symbolManager] Populated prices for ${v2Tickers.length} WEEX pairs!`);
        }
      } catch (err) {
        console.warn('[symbolManager] Note fetching initial prices snapshot:', err.message);
      }

      // Schedule periodic snapshot refresh every 20 seconds to keep all pairs updated and prune any stale assets
      if (!this.snapshotInterval) {
        this.snapshotInterval = setInterval(async () => {
          try {
            const tickers = await fetchSpotTickers();
            if (tickers && tickers.length > 0) {
              marketCache.updateFromV2Snapshot(tickers);
              if (typeof this.onSnapshotUpdate === 'function') {
                this.onSnapshotUpdate();
              }
            }
          } catch (err) {
            // ignore
          }
        }, 20000);
      }

      this.isLoaded = true;
      this.lastLoadedTime = Date.now();

      return {
        totalSymbols: this.symbolNames.length,
        totalGroups: this.symbolChunks.length,
        groups: this.symbolChunks
      };
    } catch (error) {
      console.error('[symbolManager] Error loading symbols:', error);
      throw error;
    }
  }

  /**
   * Returns symbol groups (each array <= 100 symbols)
   * @returns {Array<Array<string>>}
   */
  getSymbolChunks() {
    return this.symbolChunks;
  }

  /**
   * Returns list of all symbol names
   * @returns {Array<string>}
   */
  getAllSymbols() {
    return this.symbolNames;
  }

  getTotalCount() {
    return this.symbolNames.length;
  }

  getSymbolMeta(symbol) {
    return this.symbolMetaMap.get(symbol) || null;
  }

  getAllSymbolMeta() {
    return Array.from(this.symbolMetaMap.values());
  }
}

export const symbolManager = new SymbolManager();
export default symbolManager;
