/**
 * Header Component
 * Displays system status, ticker stream metrics, and connection controls
 */

import React from 'react';
import { Activity, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react';
import { ConnectionStatus, ConnectionPoolStats } from '../types.ts';

interface HeaderProps {
  status: ConnectionStatus;
  poolStats: ConnectionPoolStats | null;
  totalSymbols: number;
  ticksPerSecond: number;
  onOpenNetworkModal: () => void;
  onReconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  poolStats,
  totalSymbols,
  ticksPerSecond,
  onOpenNetworkModal,
  onReconnect
}) => {
  const getStatusBadge = () => {
    switch (status) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>CONNECTED</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span>CONNECTING...</span>
          </div>
        );
      case 'reconnecting':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-semibold tracking-wide">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            <span>RECONNECTING...</span>
          </div>
        );
      case 'disconnected':
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold tracking-wide">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            <span>DISCONNECTED</span>
          </div>
        );
    }
  };

  const connectedCount = poolStats?.connected ?? 0;
  const totalConns = poolStats?.total ?? 0;

  return (
    <header className="border-b border-[#2a2e39] bg-[#131722]/95 backdrop-blur px-4 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 text-white">
      {/* Logo & Platform Info */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 font-bold text-white text-base tracking-wider">
          WX
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-100 tracking-tight">WEEX SPOT</h1>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-semibold">
              V3 API
            </span>
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span>Direct Public WebSocket Stream</span>
            <span className="text-slate-600">•</span>
            <span>100-Ch Limit Grouping</span>
          </p>
        </div>
      </div>

      {/* Metrics & Status */}
      <div className="flex items-center flex-wrap gap-2 md:gap-4 text-xs">
        {/* Ticks Velocity */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1e222d] border border-[#2a2e39] text-slate-300">
          <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
          <span className="font-mono font-medium text-slate-100">{ticksPerSecond}</span>
          <span className="text-slate-400 text-[11px]">ticks/sec</span>
        </div>

        {/* Total Symbols */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1e222d] border border-[#2a2e39] text-slate-300">
          <span className="text-slate-400 text-[11px]">Pairs:</span>
          <span className="font-mono font-medium text-slate-100">{totalSymbols.toLocaleString()}</span>
        </div>

        {/* WebSocket Pool Info */}
        <button
          onClick={onOpenNetworkModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1e222d] hover:bg-[#252a37] border border-[#2a2e39] hover:border-blue-500/40 text-slate-300 transition-colors cursor-pointer"
          title="Click to view connection pool status"
        >
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-mono font-medium text-slate-100">
            {connectedCount}/{totalConns}
          </span>
          <span className="text-slate-400 text-[11px]">WS Conns</span>
        </button>

        {/* Connection Status Badge */}
        {getStatusBadge()}

        {/* Reconnect button */}
        <button
          onClick={onReconnect}
          className="p-1.5 rounded-md bg-[#1e222d] hover:bg-[#252a37] border border-[#2a2e39] text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Force reconnect WEEX streams"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

export default Header;
