/**
 * Custom React Hook for WEEX Real-Time Market Streaming
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { TickerData, ConnectionStatus, ConnectionPoolStats } from '../types.ts';

export function useWeexMarket() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [poolStats, setPoolStats] = useState<ConnectionPoolStats | null>(null);
  const [totalSymbols, setTotalSymbols] = useState<number>(0);
  const [tickersList, setTickersList] = useState<TickerData[]>([]);
  const [ticksPerSecond, setTicksPerSecond] = useState<number>(0);
  const [lastTickTime, setLastTickTime] = useState<number>(0);

  // High-performance ticker storage
  const tickersMapRef = useRef<Map<string, TickerData>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);
  const tickCounterRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(false);
  const updateTimerRef = useRef<number | null>(null);

  // Sync tickers map to state at a throttled frame rate for smooth 60fps UI
  const flushUpdates = useCallback(() => {
    if (dirtyRef.current) {
      setTickersList(Array.from(tickersMapRef.current.values()));
      dirtyRef.current = false;
    }
  }, []);

  // Set up animation frame loop for flushing dirty ticker updates
  useEffect(() => {
    const interval = setInterval(() => {
      flushUpdates();
    }, 100); // 10 times a second update to UI state for maximum smoothness without layout thrash

    return () => clearInterval(interval);
  }, [flushUpdates]);

  // Calculate ticks per second
  useEffect(() => {
    const secInterval = setInterval(() => {
      setTicksPerSecond(tickCounterRef.current);
      tickCounterRef.current = 0;
    }, 1000);

    return () => clearInterval(secInterval);
  }, []);

  const connect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      console.log('[useWeexMarket] Connecting to backend WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[useWeexMarket] Connected to backend WS!');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'init' || msg.type === 'snapshot') {
            const data = msg.data;
            if (data.status) setConnectionStatus(data.status);
            if (data.connections) setPoolStats(data.connections);
            if (data.totalSymbols) setTotalSymbols(data.totalSymbols);

            if (Array.isArray(data.tickers)) {
              const activeSymbols = new Set(data.tickers.map((t: TickerData) => t.symbol));
              // Automatically remove stale assets no longer actively pushed by WEEX
              for (const sym of tickersMapRef.current.keys()) {
                if (!activeSymbols.has(sym)) {
                  tickersMapRef.current.delete(sym);
                }
              }
              for (const t of data.tickers) {
                tickersMapRef.current.set(t.symbol, t);
              }
              dirtyRef.current = true;
              flushUpdates();
            }
          } else if (msg.type === 'ticker') {
            const t = msg.data;
            if (!t || !t.symbol) return;

            tickCounterRef.current++;
            setLastTickTime(t.lastUpdateTime || Date.now());

            const existing = tickersMapRef.current.get(t.symbol);
            let direction: 'up' | 'down' | 'neutral' = 'neutral';

            if (existing && existing.lastPrice !== '--' && t.lastPrice !== '--') {
              const oldPriceNum = parseFloat(existing.lastPrice);
              const newPriceNum = parseFloat(t.lastPrice);
              if (!isNaN(oldPriceNum) && !isNaN(newPriceNum)) {
                if (newPriceNum > oldPriceNum) direction = 'up';
                else if (newPriceNum < oldPriceNum) direction = 'down';
                else direction = existing.priceDirection || 'neutral';
              }
            }

            const updated: TickerData = {
              ...(existing || {}),
              ...t,
              priceDirection: direction,
              flashTimestamp: direction !== 'neutral' ? Date.now() : (existing?.flashTimestamp || 0)
            };

            tickersMapRef.current.set(t.symbol, updated);
            dirtyRef.current = true;
          } else if (msg.type === 'status') {
            const data = msg.data;
            if (data.status) setConnectionStatus(data.status);
            if (data.connections) setPoolStats(data.connections);
            if (data.totalSymbols) setTotalSymbols(data.totalSymbols);
          }
        } catch (err) {
          // ignore parsing error
        }
      };

      ws.onerror = () => {
        setConnectionStatus('disconnected');
      };

      ws.onclose = () => {
        console.warn('[useWeexMarket] Backend WS closed. Scheduling reconnect in 2s...');
        setConnectionStatus('reconnecting');
        socketRef.current = null;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };
    } catch (err) {
      console.error('[useWeexMarket] Connection error:', err);
      setConnectionStatus('disconnected');
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [flushUpdates]);

  useEffect(() => {
    connect();

    // Tab visibility recovery: if the user left the browser and returned,
    // ensure socket connection is alive and request fresh market snapshot
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const ws = socketRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          console.log('[useWeexMarket] Tab became visible and socket is closed, reconnecting...');
          connect();
        } else if (ws.readyState === WebSocket.OPEN) {
          console.log('[useWeexMarket] Tab became visible, requesting fresh market snapshot...');
          try {
            ws.send(JSON.stringify({ type: 'request_snapshot' }));
          } catch (e) {
            // ignore
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  // Force reconnect action
  const reconnectBackend = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    fetch('/api/reconnect', { method: 'POST' }).catch(() => {});
    connect();
  }, [connect]);

  return {
    connectionStatus,
    poolStats,
    totalSymbols,
    tickersList,
    tickersMap: tickersMapRef.current,
    ticksPerSecond,
    lastTickTime,
    reconnectBackend
  };
}
