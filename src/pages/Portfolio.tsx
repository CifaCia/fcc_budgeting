import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { convertToEUR, formatCurrency } from '@/lib/currency';
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
  cash: '#00E5C3',     // Electric Teal
  stock: '#3B82F6',    // Blue
  etf: '#6366F1',      // Indigo
  crypto: '#F59E0B',   // Amber
  other: '#94A3B8',    // Slate
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
  const { loading, positions: basePositions, cashBySource, refresh } = usePortfolio();
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

  const allocationBySource = useMemo(() => {
    const breakdown = positions.reduce((acc, p) => {
      acc[p.source] = (acc[p.source] || 0) + p.currentValue;
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
      {/* Header Row */}
      <section className="bg-card p-8 rounded-2xl border-t border-white/5 accent-glow animate-slide-up">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Total Portfolio Value</h2>
              <Tooltip content="Sum of all your positions at current prices." />
            </div>
            <div className="text-5xl md:text-7xl font-mono font-bold tracking-tight text-accent">
              <AnimatedNumber 
                value={stats.totalValue} 
                formatter={(v) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} 
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
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Cost Basis: {formatCurrency(stats.totalCost)}
              </span>
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                Cash: {formatCurrency(stats.cashValue)}
              </span>
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <button 
              onClick={() => refresh()}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-mono font-bold uppercase transition-colors"
            >
              <RefreshCw size={14} />
              Refresh all
            </button>
            {stats.daysSinceUpdate !== null && (
              <p className={cn(
                "text-[10px] font-mono uppercase tracking-widest",
                stats.daysSinceUpdate > 7 ? "text-orange-400" : "text-muted-foreground"
              )}>
                Prices last updated {stats.daysSinceUpdate} days ago
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Holdings Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-xl font-display font-bold">Holdings</h2>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase">
            <Search size={12} />
            <span>Click any field to edit</span>
          </div>
        </div>

        <div className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/5">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('name')}>Name</th>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('isin')}>ISIN / Ticker</th>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase">Source</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('shares')}>Shares</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('avgCost')}>Avg Cost</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('currentPrice')}>Price</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('currentValue')}>Value</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase cursor-pointer hover:text-accent" onClick={() => toggleSort('unrealizedPL')}>P&L</th>
                  <th className="px-4 py-4 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {positions.map((p) => (
                  <React.Fragment key={p.isin}>
                    <tr className={cn(
                      "hover:bg-white/[0.02] transition-colors group",
                      p.isStale && "border-l-2 border-orange-500/50"
                    )}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground truncate max-w-[180px]">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono uppercase">{p.assetType}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono text-muted-foreground">{p.isin}</span>
                          <div className="flex items-center gap-1 group/ticker">
                            {editingField?.isin === p.isin && editingField.field === 'ticker' ? (
                              <input 
                                autoFocus
                                className="bg-white/10 border border-white/20 rounded px-1 text-[10px] font-mono w-20"
                                value={tempValue}
                                onChange={e => setTempValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleUpdateField(p.isin, 'ticker', tempValue);
                                  if (e.key === 'Escape') setEditingField(null);
                                }}
                                onBlur={() => handleUpdateField(p.isin, 'ticker', tempValue)}
                              />
                            ) : (
                              <span 
                                className="text-[10px] font-mono text-accent cursor-pointer flex items-center gap-1"
                                onClick={() => { setEditingField({ isin: p.isin, field: 'ticker' }); setTempValue(p.ticker); }}
                              >
                                {p.ticker || 'SET TICKER'}
                                <Edit2 size={8} className="opacity-0 group-hover/ticker:opacity-100 transition-opacity" />
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border",
                          SOURCE_COLORS[p.source as keyof typeof SOURCE_COLORS] || 'bg-white/5 border-white/10 text-white'
                        )}>
                          {p.source.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-mono font-bold">{p.shares.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right text-xs font-mono text-muted-foreground">{formatCurrency(p.avgCost)}</td>
                      <td className="px-6 py-4 text-right">
                        {editingPrice === p.isin ? (
                          <div className="flex justify-end gap-1">
                            <input 
                              autoFocus
                              type="number"
                              step="0.0001"
                              className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs font-mono text-right w-24"
                              value={tempValue}
                              onChange={e => setTempValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleUpdatePrice(p.isin, parseFloat(tempValue));
                                if (e.key === 'Escape') setEditingPrice(null);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-end group/price cursor-pointer" onClick={() => { setEditingPrice(p.isin); setTempValue(p.currentPrice.toString()); }}>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono font-bold">{formatCurrency(p.currentPrice)}</span>
                              <Edit2 size={10} className="opacity-0 group-hover/price:opacity-100 transition-opacity text-accent" />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">as of {p.priceDate ? new Date(p.priceDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never'}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-xs font-mono font-bold text-foreground">{formatCurrency(p.currentValue)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className={cn(
                          "flex flex-col items-end text-xs font-mono font-bold",
                          p.unrealizedPL >= 0 ? 'text-accent' : 'text-destructive'
                        )}>
                          <span>{p.unrealizedPL >= 0 ? '+' : ''}{formatCurrency(p.unrealizedPL)}</span>
                          <span className="text-[10px]">{p.unrealizedPLPercent.toFixed(2)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <button 
                          onClick={() => setExpandedRows(prev => ({ ...prev, [p.isin]: !prev[p.isin] }))}
                          className="p-1 hover:bg-white/5 rounded transition-colors"
                        >
                          {expandedRows[p.isin] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    
                    {expandedRows[p.isin] && (
                      <tr className="bg-black/40">
                        <td colSpan={9} className="px-8 py-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">Allocation Details</h4>
                              <div className="flex gap-4">
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] text-muted-foreground uppercase font-mono">Geography</span>
                                  {editingField?.isin === p.isin && editingField.field === 'geography' ? (
                                    <select 
                                      className="bg-white/10 border border-white/20 rounded text-[10px] font-mono"
                                      value={p.geography}
                                      onChange={e => handleUpdateField(p.isin, 'geography', e.target.value)}
                                      onBlur={() => setEditingField(null)}
                                    >
                                      {GEOGRAPHIES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                  ) : (
                                    <span 
                                      className="text-xs font-bold text-accent cursor-pointer flex items-center gap-1"
                                      onClick={() => setEditingField({ isin: p.isin, field: 'geography' })}
                                    >
                                      {p.geography || 'Set Geo'} <Edit2 size={8} />
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] text-muted-foreground uppercase font-mono">Sector</span>
                                  {editingField?.isin === p.isin && editingField.field === 'sector' ? (
                                    <select 
                                      className="bg-white/10 border border-white/20 rounded text-[10px] font-mono"
                                      value={p.sector}
                                      onChange={e => handleUpdateField(p.isin, 'sector', e.target.value)}
                                      onBlur={() => setEditingField(null)}
                                    >
                                      {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                  ) : (
                                    <span 
                                      className="text-xs font-bold text-accent cursor-pointer flex items-center gap-1"
                                      onClick={() => setEditingField({ isin: p.isin, field: 'sector' })}
                                    >
                                      {p.sector || 'Set Sector'} <Edit2 size={8} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Allocation Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-card p-6 rounded-2xl border-t border-white/5">
          <div className="flex items-center gap-2 mb-8">
            <Layers size={16} className="text-accent" />
            <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Asset Type Allocation</h3>
          </div>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={allocationByType} 
                  cx="50%" cy="50%" 
                  innerRadius={60} outerRadius={80} 
                  paddingAngle={8} dataKey="value"
                >
                  {allocationByType.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={ASSET_COLORS[entry.name] || ASSET_COLORS.other} stroke="none" />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0A0A0A', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono' }}
                  itemStyle={{ color: '#00E5C3' }}
                  formatter={(val: any) => formatCurrency(val)}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="bg-card p-6 rounded-2xl border-t border-white/5">
          <div className="flex items-center gap-2 mb-8">
            <Globe size={16} className="text-accent" />
            <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Source Allocation</h3>
          </div>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={allocationBySource} 
                  cx="50%" cy="50%" 
                  innerRadius={60} outerRadius={80} 
                  paddingAngle={8} dataKey="value"
                >
                  {allocationBySource.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={['#00E5C3', '#3B82F6', '#6366F1', '#F59E0B'][index % 4]} stroke="none" />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0A0A0A', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono' }}
                  itemStyle={{ color: '#00E5C3' }}
                  formatter={(val: any) => formatCurrency(val)}
                />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Geography Breakdown */}
      <section className="bg-card p-8 rounded-2xl border-t border-white/5">
        <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground mb-8">Allocation Breakdown</h3>
        
        {positions.every(p => !p.geography && !p.sector && p.assetType !== 'cash') ? (
          <div className="h-48 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01] p-8 text-center space-y-3">
             <AlertTriangle size={24} className="text-muted-foreground/40" />
             <p className="text-sm font-bold text-muted-foreground">No Breakdown Data</p>
             <p className="text-[10px] text-muted-foreground/60 font-mono uppercase">Add geography and sector to your holdings to see allocation breakdown</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic font-mono uppercase">Expand rows to view or set geography and sector data</p>
        )}
      </section>
    </div>
  );
}