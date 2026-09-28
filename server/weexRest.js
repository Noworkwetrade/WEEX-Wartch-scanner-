/**
 * WEEX Spot REST API Client (v3 only)
 * Base URL: https://api-spot.weex.com
 */

import { marketCache } from './marketCache.js';

const BASE_URL = 'https://api-spot.weex.com';
const USER_AGENT = 'NWWT-WEEX-WATCHLIST/1.0';

function getTimeframeDurationMs(tf) {
  switch (tf) {
    case '1m': return 60 * 1000;
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '30m': return 30 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '2h': return 2 * 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '6h': return 6 * 60 * 60 * 1000;
    case '8h': return 8 * 60 * 60 * 1000;
    case '12h': return 12 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    case '1w': return 7 * 24 * 60 * 1000;
    case '1M': return 30 * 24 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

/**
 * Fetches all currently trading WEEX spot symbols dynamically
 * GET https://api-spot.weex.com/api/v3/exchangeInfo?symbolStatus=TRADING
 * @returns {Promise<Array>} Array of trading symbol objects
 */
export async function fetchExchangeInfo() {
  const url = `${BASE_URL}/api/v3/exchangeInfo?symbolStatus=TRADING`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`WEEX REST HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.symbols)) {
      throw new Error('Invalid exchangeInfo response format from WEEX');
    }

    // Filter to only displayable TRADING status symbols on WEEX
    const tradingSymbols = data.symbols.filter(
      (item) => item && item.symbol && item.enableDisplay !== false && (item.status === 'TRADING' || item.enableTrade === true)
    );

    return {
      serverTime: data.serverTime || Date.now(),
      timezone: data.timezone || 'UTC',
      symbols: tradingSymbols
    };
  } catch (error) {
    console.error('[weexRest] Failed to fetch exchangeInfo:', error.message);
    throw error;
  }
}

/**
 * Fetches 24hr market ticker statistics for all active spot pairs from WEEX v2
 * GET https://api-spot.weex.com/api/v2/market/tickers
 * @returns {Promise<Array>}
 */
export async function fetchSpotTickers() {
  const url = `${BASE_URL}/api/v2/market/tickers`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return [];
    const json = await response.json();
    if (json && json.code === '00000' && Array.isArray(json.data)) {
      return json.data;
    }
    return [];
  } catch (err) {
    console.warn('[weexRest] Failed to fetch v2 tickers snapshot:', err.message);
    return [];
  }
}

/**
 * Fetches real historical candlesticks from WEEX Spot v3 API
 * GET https://api-spot.weex.com/api/v3/market/klines?symbol=BTCUSDT&interval=15m&limit=200
 * @param {string} symbol e.g. "BTCUSDT"
 * @param {string} interval e.g. "1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "1w", "1M"
 * @param {number} limit number of candles to fetch (1-1000)
 * @returns {Promise<Array>} Array of parsed candle objects
 */
export async function fetchKlines(symbol, interval = '15m', limit = 200) {
  const cleanSymbol = (symbol || 'BTCUSDT').toUpperCase();
  const isMonth = interval === '1M';
  const apiInterval = isMonth ? '1d' : interval;
  const apiLimit = isMonth ? Math.min(1000, limit * 30) : Math.min(1000, Math.max(10, limit));

  const url = `${BASE_URL}/api/v3/market/klines?symbol=${cleanSymbol}&interval=${apiInterval}&limit=${apiLimit}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`[weexRest] WEEX Klines HTTP ${response.status} for ${cleanSymbol}`);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return [];
    }

    // Map raw WEEX kline array directly to candle objects - real WEEX market data only
    const candles = data.map((k) => ({
      openTime: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: Number(k[6])
    })).filter(c => !isNaN(c.open) && !isNaN(c.close) && !isNaN(c.high) && !isNaN(c.low));

    // Sort by openTime ascending (oldest to newest)
    candles.sort((a, b) => a.openTime - b.openTime);

    if (isMonth && candles.length > 0) {
      // Aggregate real WEEX 1d candles into 1M (monthly) candles
      const monthlyCandles = [];
      let currentMonthKey = '';
      let monthCandle = null;

      for (const c of candles) {
        const d = new Date(c.openTime);
        const monthKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;

        if (monthKey !== currentMonthKey) {
          if (monthCandle) monthlyCandles.push(monthCandle);
          currentMonthKey = monthKey;
          monthCandle = {
            openTime: c.openTime,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
            closeTime: c.closeTime
          };
        } else if (monthCandle) {
          monthCandle.high = Math.max(monthCandle.high, c.high);
          monthCandle.low = Math.min(monthCandle.low, c.low);
          monthCandle.close = c.close;
          monthCandle.volume += c.volume;
          monthCandle.closeTime = c.closeTime;
        }
      }
      if (monthCandle) monthlyCandles.push(monthCandle);
      return monthlyCandles.slice(-limit);
    }

    return candles;
  } catch (error) {
    console.error(`[weexRest] Failed to fetch klines for ${cleanSymbol} (${interval}):`, error.message);
    return [];
  }
}

export default {
  fetchExchangeInfo,
  fetchKlines,
  BASE_URL,
  USER_AGENT
};
