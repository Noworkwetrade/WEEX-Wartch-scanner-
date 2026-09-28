/**
 * TradingView Style Watchlist Table Component
 * High performance, sorting, live price flashes, clean financial formatting
 */

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, Eye } from 'lucide-react';
import { TickerData, SortField, SortConfig, Timeframe } from '../types.ts';
import { CandlestickChart } from './CandlestickChart.tsx';

interface WatchlistTableProps {
  tickers: TickerData[];
  sortConfig: SortConfig;
  onSort: (field: SortField) => void;
  selectedSymbol: string | null;
  onSelectSymbol: (ticker: TickerData) => void;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
}

/**
 * Format numeric price dynamically according to precision
 */
export function formatPrice(priceStr: string | number): string {
  if (priceStr === '--' || priceStr === undefined || priceStr === null) return '--';
  const num = typeof priceStr === 'number' ? priceStr : parseFloat(priceStr);
  if (isNaN(num)) return String(priceStr);

  if (num >= 1000) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num >= 1) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  } else if (num >= 0.0001) {
    return num.toFixed(6);
  } else {
    return num.toFixed(8);
  }
}

/**
 * Format volume in K, M, B
 */
export function formatVolume(volStr: string | number): string {
  if (volStr === '--' || volStr === undefined || volStr === null) return '--';
  const num = typeof volStr === 'number' ? volStr : parseFloat(volStr);
  if (isNaN(num)) return String(volStr);

  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(2) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  return num.toFixed(2);
}

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  tickers,
  sortConfig,
  onSort,
  selectedSymbol,
  onSelectSymbol,
  timeframe = '15m',
  onTimeframeChange = () => {}
}) => {
  // Page size for buttery smooth rendering of large datasets
  const [displayLimit, setDisplayLimit] = useState<number>(100);

  const renderSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-500 opacity-60 group-hover:opacity-100" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-blue-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-blue-400" />
    );
  };

  const visibleTickers = tickers.slice(0, displayLimit);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#131722]">
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full border-collapse text-left text-xs font-sans select-none">
          {/* Table Header */}
          <thead className="bg-[#181c27] text-slate-400 sticky top-0 z-10 border-b border-[#2a2e39] shadow-sm uppercase tracking-wider text-[10px]">
            <tr>
              {/* Symbol */}
              <th
                onClick={() => onSort('symbol')}
                className="py-2.5 px-4 font-semibold hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span>Symbol</span>
                  {renderSortIcon('symbol')}
                </div>
              </th>

              {/* Live Price */}
              <th
                onClick={() => onSort('lastPrice')}
                className="py-2.5 px-4 font-semibold text-right hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Last Price</span>
                  {renderSortIcon('lastPrice')}
                </div>
              </th>

              {/* 24h Change */}
              <th
                onClick={() => onSort('priceChange')}
                className="py-2.5 px-4 font-semibold text-right hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>24h Change</span>
                  {renderSortIcon('priceChange')}
                </div>
              </th>

              {/* 24h % */}
              <th
                onClick={() => onSort('priceChangePercent')}
                className="py-2.5 px-4 font-semibold text-right hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>24h %</span>
                  {renderSortIcon('priceChangePercent')}
                </div>
              </th>

              {/* 24h High */}
              <th
                onClick={() => onSort('highPrice')}
                className="py-2.5 px-4 font-semibold text-right hidden md:table-cell hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>24h High</span>
                  {renderSortIcon('highPrice')}
                </div>
              </th>

              {/* 24h Low */}
              <th
                onClick={() => onSort('lowPrice')}
                className="py-2.5 px-4 font-semibold text-right hidden md:table-cell hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>24h Low</span>
                  {renderSortIcon('lowPrice')}
                </div>
              </th>

              {/* 24h Volume */}
              <th
                onClick={() => onSort('volume')}
                className="py-2.5 px-4 font-semibold text-right hidden lg:table-cell hover:text-slate-200 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Volume</span>
                  {renderSortIcon('volume')}
                </div>
              </th>

              {/* 24h Range Bar */}
              <th className="py-2.5 px-4 text-center hidden xl:table-cell">
                <span>24h Range</span>
              </th>

              {/* Action */}
              <th className="py-2.5 px-3 text-center w-10"></th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-[#1e222d]">
            {visibleTickers.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  No matching WEEX trading pairs found.
                </td>
              </tr>
            ) : (
              visibleTickers.map((ticker) => {
                const isSelected = selectedSymbol === ticker.symbol;
                const changeNum = parseFloat(ticker.priceChange);
                const percentNum = parseFloat(ticker.priceChangePercent);
                const isPositive = !isNaN(percentNum) && percentNum > 0;
                const isNegative = !isNaN(percentNum) && percentNum < 0;

                // Live flash detection (flashes green/red when price ticks)
                const isRecentFlash =
                  ticker.flashTimestamp && Date.now() - ticker.flashTimestamp < 1000;
                const flashClass = isRecentFlash
                  ? ticker.priceDirection === 'up'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : ticker.priceDirection === 'down'
                    ? 'bg-rose-500/20 text-rose-300'
                    : ''
                  : '';

                // Range bar calculation
                const high = parseFloat(ticker.highPrice);
                const low = parseFloat(ticker.lowPrice);
                const current = parseFloat(ticker.lastPrice);
                let rangePercent = 50;
                if (!isNaN(high) && !isNaN(low) && !isNaN(current) && high > low) {
                  rangePercent = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
                }

                return (
                  <React.Fragment key={ticker.symbol}>
                    <tr
                      onClick={() => onSelectSymbol(ticker)}
                      className={`transition-colors cursor-pointer group ${
                        isSelected
                          ? 'bg-blue-950/40 border-l-2 border-l-blue-500'
                          : 'hover:bg-[#1a1e29]'
                      }`}
                    >
                      {/* Symbol */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors font-mono">
                            {ticker.symbol}
                          </div>
                          {ticker.baseAsset && (
                            <span className="text-[10px] text-slate-500 font-normal">
                              {ticker.baseAsset}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Live Price with Real-time Flash */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono font-medium text-slate-100">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded transition-all duration-300 ${flashClass}`}
                        >
                          {formatPrice(ticker.lastPrice)}
                        </span>
                      </td>

                      {/* 24h Change */}
                      <td
                        className={`py-2.5 px-4 text-right whitespace-nowrap font-mono text-[11px] ${
                          isPositive
                            ? 'text-emerald-400'
                            : isNegative
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {formatPrice(ticker.priceChange)}
                      </td>

                      {/* 24h % Badge */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-end px-2 py-0.5 rounded text-[11px] font-mono font-medium min-w-[65px] ${
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isNegative
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {!isNaN(percentNum) ? percentNum.toFixed(2) : ticker.priceChangePercent}%
                        </span>
                      </td>

                      {/* 24h High */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono text-slate-300 hidden md:table-cell">
                        {formatPrice(ticker.highPrice)}
                      </td>

                      {/* 24h Low */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono text-slate-300 hidden md:table-cell">
                        {formatPrice(ticker.lowPrice)}
                      </td>

                      {/* 24h Volume */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap font-mono text-slate-400 hidden lg:table-cell">
                        {formatVolume(ticker.volume)}
                      </td>

                      {/* 24h Range Bar */}
                      <td className="py-2.5 px-4 whitespace-nowrap hidden xl:table-cell">
                        <div className="w-24 mx-auto">
                          <div className="h-1.5 w-full bg-[#2a2e39] rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 rounded-full"
                              style={{ width: '100%' }}
                            />
                            {/* Marker */}
                            <div
                              className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow"
                              style={{ left: `${rangePercent}%`, transform: 'translateX(-50%)' }}
                            />
                          </div>
                          <div className="flex justify-between text-[9px] text-slate-500 mt-0.5 font-mono">
                            <span>L</span>
                            <span>H</span>
                          </div>
                        </div>
                      </td>

                      {/* Detail action */}
                      <td className="py-2.5 px-3 text-center text-slate-500 group-hover:text-slate-300">
                        {isSelected ? (
                          <ChevronDown className="w-4 h-4 ml-auto text-blue-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 ml-auto" />
                        )}
                      </td>
                    </tr>

                    {/* Inline Candlestick Chart Dropdown directly underneath the clicked asset */}
                    {isSelected && (
                      <tr
                        key={`${ticker.symbol}-chart`}
                        className="bg-[#121620]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <td colSpan={9} className="p-0 border-y-2 border-blue-500/40">
                          <div className="sticky left-0 w-full min-w-full max-w-[100vw] bg-[#131722] border-t border-[#2a2e39] overflow-hidden shadow-2xl">
                            <div className="h-[460px] w-full flex flex-col">
                              <CandlestickChart
                                symbol={ticker.symbol}
                                ticker={ticker}
                                timeframe={timeframe}
                                onTimeframeChange={onTimeframeChange}
                                onClose={() => onSelectSymbol(ticker)}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination / Load More Footer */}
      {tickers.length > displayLimit && (
        <div className="p-3 bg-[#181c27] border-t border-[#2a2e39] flex items-center justify-between text-xs text-slate-400">
          <span>
            Displaying {displayLimit} of {tickers.length} pairs
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setDisplayLimit((prev) => Math.min(tickers.length, prev + 100))}
              className="px-3 py-1 bg-[#1e222d] hover:bg-[#252a37] text-slate-200 rounded border border-[#2a2e39] font-medium transition-colors cursor-pointer"
            >
              Load Next 100
            </button>
            <button
              onClick={() => setDisplayLimit(tickers.length)}
              className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded border border-blue-500/40 font-medium transition-colors cursor-pointer"
            >
              Show All ({tickers.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchlistTable;
