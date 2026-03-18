import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { convertToEUR, formatCurrency } from '@/lib/currency';
import { parseHoldingsFromRaw } from '@/lib/csvParsers';
import { usePortfolio, Position } from '@/lib/usePortfolio';
import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber';
import { Tooltip } from '@/components/ui/Tooltip';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, Search, 
  Edit2, RefreshCw, ChevronDown, ChevronUp, Globe, Layers, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ASSET_COLORS: Record<string, string> = {
  cash: '#00E5C3',
  stock: '#3B82F6',
  etf: '#6366F1',
  crypto: '#F59E0B',
  other: '#94A3B8',
};

const SOURCE_COLORS: Record<string, string> = {
  abn_amro_checking: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  abn_amro_savings: 'bg-teal-600/10 text-teal-500 border-teal-600/20',
  degiro: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  trade_republic: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const GEOGRAPHIES = ['US', 'Europe', 'World', 'EM', 'Asia', 'Netherlands', 'Other'];
const SECTORS = ['Tech', 'Finance', 'Healthcare', 'Energy', 'Consumer', 'Industrial', 'Real Estate', 'Bonds', 'Cash', 'Other'];

export default function Portfolio() {
  const { user } = useAuth();
  const { loading, positions: basePositions, cashBySource, cashTotal, refresh } = usePortfolio();
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ isin: string, field: string } | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Position, direction: 'asc' | 'desc' }>(() => {
    const saved = localStorage.getItem('portfolio_sort');
    return saved ? JSON.parse(saved) : { key: 'currentValue', direction: 'desc' };
  });

  useEffect(() => {
    localStorage.setItem('portfolio_sort', JSON.stringify(sortConfig));
  }, [sortConfig]);

  const positions = useMemo(() => {
    const result = [...basePositions];
    
    Object.entries(cashBySource).forEach(([source, balance]) => {
      if (Math.abs(balance) > 0.01) {
        result.push({
          isin: `CASH-${source.toUpperCase()}`,
          name: `${source.replace('_', ' ').toUpperCase()} Cash`,
          source,
          shares: 1,
          costBasis: balance,
          avgCost: 1,
          assetType: 'cash',
          currentPrice: 1,
          currentValue: balance,
          unrealizedPL: 0,
          unrealizedPLPercent: 0,
          priceDate: new Date().toISOString().split('T')[0],
          isStale: false,
          ticker: 'CASH',
          geography: source.startsWith('abn') ? 'Netherlands' : 'Europe',
          sector: 'Cash',
        } as Position);
      }
    });

    return result.sort((a: any, b: any) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [basePositions, cashBySource, sortConfig]);

  const stats = useMemo(() => {
    const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0);
    const totalPL = totalValue - totalCost;
    const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
    const cashValue = positions.filter(p => p.assetType === 'cash').reduce((sum, p) => sum + p.currentValue, 0);
    
    const oldestPriceDate = positions
      .filter(p => p.assetType !== 'cash' && p.priceDate)
      .map(p => new Date(p.priceDate).getTime())
      .sort((a, b) => a - b)[0];
    
    const daysSinceUpdate = oldestPriceDate ? Math.floor((new Date().getTime() - oldestPriceDate) / (1000 * 60 * 60 * 24)) : null;

    return { totalValue, totalCost, totalPL, totalPLPercent, cashValue, daysSinceUpdate };
  }, [positions]);

  const allocationByType = useMemo(() => {
    const breakdown = positions.reduce((acc, p) => {
      acc[p.assetType] = (acc[p.assetType] || 0) + p.currentValue;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(breakdown).map(([name, value]) => ({ name, value }));
  }, [positions]);

  const handleUpdatePrice = async (isin: string, price: number) => {
    if (!user) return;
    const { error } = await supabase.from('portfolio_prices').upsert({
      user_id: user.id,
      isin,
      price,
      price_date: new Date().toISOString().split('T')[0],
    }, { onConflict: 'user_id,isin' });

    if (!error) refresh();
    setEditingPrice(null);
  };

  const handleUpdateField = async (isin: string, field: string, value: string) => {
    if (!user) return;
    const { error } = await supabase.from('portfolio_prices').upsert({
      user_id: user.id,
      isin,
      [field]: value,
      price: basePositions.find(p => p.isin === isin)?.currentPrice || 0,
      price_date: basePositions.find(p => p.isin === isin)?.priceDate || new Date().toISOString().split('T')[0]
    }, { onConflict: 'user_id,isin' });

    if (!error) refresh();
    setEditingField(null);
  };

  const toggleSort = (key: keyof Position) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-muted-foreground font-mono text-sm animate-pulse">Reconstructing Portfolio...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <section className="bg-card p-8 rounded-2xl border-t border-white/5 accent-glow animate-slide-up">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Total Portfolio Value</h2>
            <div className="text-5xl md:text-7xl font-mono font-bold tracking-tight text-accent">
              <AnimatedNumber 
                value={stats.totalValue} 
                formatter={(v) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 0 })}`} 
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                stats.totalPL >= 0 ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
              )}>
                {stats.totalPL >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {formatCurrency(Math.abs(stats.totalPL))} ({stats.totalPLPercent.toFixed(2)}%)
              </div>
            </div>
          </div>
          <button onClick={() => refresh()} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono font-bold uppercase transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </section>

      <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden overflow-x-auto">
        <table className="min-w-full divide-y divide-white/5">
          <thead>
            <tr className="bg-white/[0.02]">
              <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase cursor-pointer" onClick={() => toggleSort('name')}>Name</th>
              <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase cursor-pointer" onClick={() => toggleSort('isin')}>ISIN</th>
              <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer" onClick={() => toggleSort('shares')}>Shares</th>
              <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer" onClick={() => toggleSort('currentPrice')}>Price</th>
              <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer" onClick={() => toggleSort('currentValue')}>Value</th>
              <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase">P&L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {positions.map((p) => (
              <tr key={p.isin} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold truncate max-w-[180px]">{p.name}</span>
                    <span className="text-[9px] text-muted-foreground uppercase">{p.assetType}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-[11px] font-mono text-muted-foreground">{p.isin}</td>
                <td className="px-6 py-4 text-right text-xs font-mono">{p.shares.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-xs font-mono">{formatCurrency(p.currentPrice)}</td>
                <td className="px-6 py-4 text-right text-xs font-mono font-bold">{formatCurrency(p.currentValue)}</td>
                <td className="px-6 py-4 text-right">
                  <span className={cn("text-xs font-mono font-bold", p.unrealizedPL >= 0 ? "text-accent" : "text-destructive")}>
                    {p.unrealizedPLPercent.toFixed(2)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}