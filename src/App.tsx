/**
 * WEEX Spot Market Real-Time Watchlist & Candlestick Analysis
 * TradingView style, live public ticker streams, real WEEX candles, and Market Structure.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useWeexMarket } from './hooks/useWeexMarket.ts';
import { Header } from './components/Header.tsx';
import { WatchlistToolbar } from './components/WatchlistToolbar.tsx';
import { WatchlistTable } from './components/WatchlistTable.tsx';
import { NetworkModal } from './components/NetworkModal.tsx';
import { TickerData, SortField, SortConfig, FilterPreset, Timeframe } from './types.ts';

export default function App() {
  const {
    connectionStatus,
    poolStats,
    totalSymbols,
    tickersList,
    tickersMap,
    ticksPerSecond,
    reconnectBackend
  } = useWeexMarket();

  // Persistent State Initializers
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    return localStorage.getItem('weex_search_query') || '';
  });

  const [selectedQuote, setSelectedQuote] = useState<string>(() => {
    return localStorage.getItem('weex_selected_quote') || 'ALL';
  });

  const [selectedPreset, setSelectedPreset] = useState<FilterPreset>(() => {
    return (localStorage.getItem('weex_selected_preset') as FilterPreset) || 'all';
  });

  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    try {
      const saved = localStorage.getItem('weex_sort_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { field: 'volume', direction: 'desc' };
  });

  const [selectedSymbolName, setSelectedSymbolName] = useState<string | null>(() => {
    return localStorage.getItem('weex_selected_symbol') || null;
  });

  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>(() => {
    return (localStorage.getItem('weex_selected_timeframe') as Timeframe) || '15m';
  });

  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState<boolean>(false);

  // Sync state changes to localStorage for 100% persistent SPA behavior
  useEffect(() => {
    localStorage.setItem('weex_search_query', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('weex_selected_quote', selectedQuote);
  }, [selectedQuote]);

  useEffect(() => {
    localStorage.setItem('weex_selected_preset', selectedPreset);
  }, [selectedPreset]);

  useEffect(() => {
    localStorage.setItem('weex_sort_config', JSON.stringify(sortConfig));
  }, [sortConfig]);

  useEffect(() => {
    if (selectedSymbolName) {
      localStorage.setItem('weex_selected_symbol', selectedSymbolName);
    } else {
      localStorage.removeItem('weex_selected_symbol');
    }
  }, [selectedSymbolName]);

  useEffect(() => {
    localStorage.setItem('weex_selected_timeframe', selectedTimeframe);
  }, [selectedTimeframe]);

  // Keyboard shortcut: close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isNetworkModalOpen) {
          setIsNetworkModalOpen(false);
        } else if (selectedSymbolName) {
          setSelectedSymbolName(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSymbolName, isNetworkModalOpen]);

  // Sorting handler
  const handleSort = (field: SortField) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return {
        field,
        direction: field === 'symbol' ? 'asc' : 'desc'
      };
    });
  };

  // Filter & Sort tickers with high performance memoization
  const filteredAndSortedTickers = useMemo(() => {
    let result = tickersList;

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      result = result.filter(
        (t) =>
          t.symbol.toUpperCase().includes(q) ||
          (t.baseAsset && t.baseAsset.toUpperCase().includes(q))
      );
    }

    // 2. Quote Asset Filter
    if (selectedQuote !== 'ALL') {
      result = result.filter(
        (t) =>
          t.symbol.endsWith(selectedQuote) ||
          (t.quoteAsset && t.quoteAsset.toUpperCase() === selectedQuote)
      );
    }

    // 3. Preset Filter
    if (selectedPreset === 'gainers') {
      result = result.filter((t) => {
        const p = parseFloat(t.priceChangePercent);
        return !isNaN(p) && p > 0;
      });
    } else if (selectedPreset === 'losers') {
      result = result.filter((t) => {
        const p = parseFloat(t.priceChangePercent);
        return !isNaN(p) && p < 0;
      });
    } else if (selectedPreset === 'highVolume') {
      result = result.filter((t) => {
        const v = parseFloat(t.volume);
        return !isNaN(v) && v > 0;
      });
    }

    // 4. Sorting
    const { field, direction } = sortConfig;
    const factor = direction === 'asc' ? 1 : -1;

    return [...result].sort((a, b) => {
      if (field === 'symbol') {
        return a.symbol.localeCompare(b.symbol) * factor;
      }

      // Numeric comparisons
      const aVal = parseFloat((a as any)[field]) || 0;
      const bVal = parseFloat((b as any)[field]) || 0;

      if (aVal === bVal) {
        return a.symbol.localeCompare(b.symbol);
      }
      return (aVal - bVal) * factor;
    });
  }, [tickersList, searchQuery, selectedQuote, selectedPreset, sortConfig]);

  // Selected ticker for the detail & chart drawer (keeps updating live from tickersMap)
  const selectedTicker = useMemo(() => {
    if (!selectedSymbolName) return null;
    return tickersMap.get(selectedSymbolName) || {
      symbol: selectedSymbolName,
      lastPrice: '--',
      priceChange: '0.00',
      priceChangePercent: '0.00',
      highPrice: '--',
      lowPrice: '--',
      bidPrice: '--',
      askPrice: '--',
      volume: '0',
      quoteVolume: '0',
      lastUpdateTime: Date.now()
    };
  }, [selectedSymbolName, tickersList, tickersMap]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0e1118] text-slate-100 overflow-hidden font-sans antialiased">
      {/* Top Header */}
      <Header
        status={connectionStatus}
        poolStats={poolStats}
        totalSymbols={totalSymbols}
        ticksPerSecond={ticksPerSecond}
        onOpenNetworkModal={() => setIsNetworkModalOpen(true)}
        onReconnect={reconnectBackend}
      />

      {/* Watchlist Controls Toolbar */}
      <WatchlistToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedQuote={selectedQuote}
        onQuoteChange={setSelectedQuote}
        selectedPreset={selectedPreset}
        onPresetChange={setSelectedPreset}
        filteredCount={filteredAndSortedTickers.length}
        totalCount={tickersList.length}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Watchlist Table with inline chart dropdown */}
        <WatchlistTable
          tickers={filteredAndSortedTickers}
          sortConfig={sortConfig}
          onSort={handleSort}
          selectedSymbol={selectedSymbolName}
          onSelectSymbol={(ticker) =>
            setSelectedSymbolName((prev) => (prev === ticker.symbol ? null : ticker.symbol))
          }
          timeframe={selectedTimeframe}
          onTimeframeChange={setSelectedTimeframe}
        />
      </div>

      {/* Network Connection Pool Modal */}
      <NetworkModal
        isOpen={isNetworkModalOpen}
        onClose={() => setIsNetworkModalOpen(false)}
        poolStats={poolStats}
        onReconnect={reconnectBackend}
      />
    </div>
  );
}
