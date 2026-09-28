/**
 * Watchlist Toolbar Component
 * Provides search filtering, quote currency tabs, and gainers/losers presets
 */

import React from 'react';
import { Search, X, TrendingUp, TrendingDown, Flame, BarChart2 } from 'lucide-react';
import { FilterPreset } from '../types.ts';

interface WatchlistToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedQuote: string;
  onQuoteChange: (quote: string) => void;
  selectedPreset: FilterPreset;
  onPresetChange: (preset: FilterPreset) => void;
  filteredCount: number;
  totalCount: number;
}

const QUOTE_OPTIONS = ['ALL', 'USDT', 'USDC', 'BTC', 'ETH'];

export const WatchlistToolbar: React.FC<WatchlistToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedQuote,
  onQuoteChange,
  selectedPreset,
  onPresetChange,
  filteredCount,
  totalCount
}) => {
  return (
    <div className="bg-[#131722] border-b border-[#2a2e39] px-4 py-2.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search symbols (e.g. BTC, ETH, SOL)..."
          className="w-full bg-[#1e222d] border border-[#2a2e39] focus:border-blue-500 focus:outline-none rounded-md pl-9 pr-8 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Quote Currencies & Presets */}
      <div className="flex items-center flex-wrap gap-2 text-xs">
        {/* Quote Asset Pills */}
        <div className="flex items-center bg-[#1e222d] p-0.5 rounded-md border border-[#2a2e39]">
          {QUOTE_OPTIONS.map((quote) => (
            <button
              key={quote}
              onClick={() => onQuoteChange(quote)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                selectedQuote === quote
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {quote}
            </button>
          ))}
        </div>

        {/* Preset Filters */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPresetChange('all')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              selectedPreset === 'all'
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                : 'bg-[#1e222d] text-slate-400 hover:text-slate-200 border-[#2a2e39]'
            }`}
          >
            <BarChart2 className="w-3 h-3" />
            <span>All</span>
          </button>

          <button
            onClick={() => onPresetChange('gainers')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              selectedPreset === 'gainers'
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                : 'bg-[#1e222d] text-slate-400 hover:text-slate-200 border-[#2a2e39]'
            }`}
          >
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span>Gainers</span>
          </button>

          <button
            onClick={() => onPresetChange('losers')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              selectedPreset === 'losers'
                ? 'bg-rose-600/20 text-rose-400 border-rose-500/40'
                : 'bg-[#1e222d] text-slate-400 hover:text-slate-200 border-[#2a2e39]'
            }`}
          >
            <TrendingDown className="w-3 h-3 text-rose-400" />
            <span>Losers</span>
          </button>

          <button
            onClick={() => onPresetChange('highVolume')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              selectedPreset === 'highVolume'
                ? 'bg-amber-600/20 text-amber-400 border-amber-500/40'
                : 'bg-[#1e222d] text-slate-400 hover:text-slate-200 border-[#2a2e39]'
            }`}
          >
            <Flame className="w-3 h-3 text-amber-400" />
            <span>Volume</span>
          </button>
        </div>

        {/* Counter */}
        <div className="text-[11px] text-slate-400 ml-auto md:ml-2 font-mono">
          Showing <span className="text-slate-200 font-semibold">{filteredCount}</span> of {totalCount}
        </div>
      </div>
    </div>
  );
};

export default WatchlistToolbar;
