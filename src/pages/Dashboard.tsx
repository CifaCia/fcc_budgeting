import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { convertToEUR, formatCurrency } from '@/lib/currency';
import CSVImporter from '@/components/dashboard/CSVImporter';
import ManualTradeRepublic from '@/components/dashboard/ManualTradeRepublic';
import ManualABNAMRO from '@/components/dashboard/ManualABNAMRO';
import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber';
import { Tooltip } from '@/components/ui/Tooltip';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { TrendingUp, Plus, ArrowUpRight, ArrowDownRight, MoreHorizontal, PieChart as PieChartIcon, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePortfolio } from '@/lib/usePortfolio';
import { Link } from 'react-router-dom';
import { LiveTickerBubbles } from '@/components/dashboard/LiveTickerBubbles';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  category: string;
  source: string;
  asset_type: string;
  balance?: number;
}

interface Snapshot {
  snapshot_date: string;
  net_worth: number;
  breakdown: Record<string, number>;
}

interface LastUpload {
  date: string;
  source: string;
  count: number;
}

interface PropertyData {
  value: number;
  ownership: number;
  debtFree: number;
  lastUpdate: string;
}

const ASSET_COLORS: Record<string, string> = {
  cash: '#00E5C3',     // Electric Teal
  stock: '#3B82F6',    // Blue
  etf: '#6366F1',      // Indigo
  property: '#FF6B6B', // Muted Coral
  other: '#94A3B8',    // Slate
};

const SOURCE_COLORS: Record<string, string> = {
  abn_amro: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  degiro: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  trade_republic: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  manual: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

export default function Dashboard() {
  const { user } = useAuth();
  const { totalPortfolioValue, hasPricesForAll, cashTotal, positions } = usePortfolio();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [lastUpload, setLastUpload] = useState<LastUpload | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [showImport, setShowImport] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: transData } = await supabase
      .from('transactions')
      .select('*')
      .neq('asset_type', 'property')
      .order('date', { ascending: false });
    const trans = (transData || []) as Transaction[];
    setTransactions(trans);

    const { data: snapData } = await supabase
      .from('snapshots')
      .select('*')
      .order('snapshot_date', { ascending: true });
    const currentSnaps = (snapData || []) as Snapshot[];
    setSnapshots(currentSnaps);

    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    
    let currentProp: PropertyData | null = null;

    if (settings) {
      if (settings.last_upload) setLastUpload(settings.last_upload as LastUpload);
      
      let currentDebtFree = Number(settings.property_debt_free_pct) || 0;
      const lastUpdate = settings.property_last_auto_update;
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      if (lastUpdate && currentDebtFree < 1) {
        const lastDate = new Date(lastUpdate);
        const monthsDiff = (today.getFullYear() - lastDate.getFullYear()) * 12 + (today.getMonth() - lastDate.getMonth());
        
        if (monthsDiff > 0) {
          const increase = (1/720) * monthsDiff;
          currentDebtFree = Math.min(1, currentDebtFree + increase);
          await supabase.from('user_settings').update({
            property_debt_free_pct: currentDebtFree,
            property_last_auto_update: todayStr
          }).eq('user_id', user.id);
        }
      }

      currentProp = {
        value: Number(settings.property_value) || 0,
        ownership: Number(settings.property_ownership_pct) || 0.5,
        debtFree: currentDebtFree,
        lastUpdate: lastUpdate || todayStr
      };
      setProperty(currentProp);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const hasTodaySnapshot = currentSnaps.some(s => s.snapshot_date === todayStr);
    const liquid = trans.reduce((sum, t) => sum + convertToEUR(t.amount, t.currency), 0);
    const propEquity = currentProp ? currentProp.value * currentProp.ownership * currentProp.debtFree : 0;
    
    if (!hasTodaySnapshot && (liquid > 0 || propEquity > 0)) {
      await createSnapshot(trans, todayStr, liquid, propEquity);
    }

    setLoading(false);
  };

  const createSnapshot = async (trans: Transaction[], date: string, liquid: number, propEquity: number) => {
    const breakdown: Record<string, number> = { cash: 0, stock: 0, etf: 0, property: 0, other: 0 };
    trans.forEach(t => {
      const amountEUR = convertToEUR(t.amount, t.currency);
      const type = t.asset_type || 'other';
      breakdown[type] = (breakdown[type] || 0) + amountEUR;
    });
    if (propEquity > 0) breakdown['property'] = propEquity;

    const { data, error } = await supabase.from('snapshots').insert({
      user_id: user?.id,
      snapshot_date: date,
      net_worth: liquid + propEquity,
      breakdown
    }).select().single();

    if (!error && data) setSnapshots(prev => [...prev, data as Snapshot]);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const liquidNetWorth = useMemo(() => {
    if (hasPricesForAll) {
      return totalPortfolioValue + cashTotal;
    }
    return transactions.reduce((sum, t) => sum + convertToEUR(t.amount, t.currency), 0);
  }, [transactions, totalPortfolioValue, hasPricesForAll, cashTotal]);

  const propertyEquity = property ? property.value * property.ownership * property.debtFree : 0;
  const totalNetWorth = liquidNetWorth + propertyEquity;
  
  const breakdownData = useMemo(() => {
    if (hasPricesForAll) {
      const data = [
        { name: 'cash', value: cashTotal },
        { name: 'portfolio', value: totalPortfolioValue }
      ];
      if (propertyEquity > 0) data.push({ name: 'property', value: propertyEquity });
      return data;
    }

    const breakdown = transactions.reduce((acc, t) => {
      const type = t.asset_type || 'other';
      acc[type] = (acc[type] || 0) + convertToEUR(t.amount, t.currency);
      return acc;
    }, {} as Record<string, number>);

    const data = Object.entries(breakdown).map(([name, value]) => ({ name, value }));
    if (propertyEquity > 0) data.push({ name: 'property', value: propertyEquity });
    return data;
  }, [transactions, propertyEquity, hasPricesForAll, cashTotal, totalPortfolioValue]);

  const lastMonthSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : (snapshots[0] || null);
  const delta = lastMonthSnapshot ? totalNetWorth - lastMonthSnapshot.net_worth : 0;
  const deltaPercent = lastMonthSnapshot && lastMonthSnapshot.net_worth > 0 ? (delta / lastMonthSnapshot.net_worth) * 100 : 0;

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-muted-foreground font-mono text-sm animate-pulse">Initializing Dashboard...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32">
      <LiveTickerBubbles positions={positions} />
      
      {hasPricesForAll && (
        <Link to="/portfolio" className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-accent uppercase tracking-widest hover:underline mb-2">
          <ExternalLink size={12} />
          Holdings data available — view Portfolio
        </Link>
      )}

      {/* Hero Section */}
      <section className="bg-card p-8 rounded-2xl border-t border-white/5 accent-glow animate-slide-up">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Total Net Worth</h2>
              <Tooltip content="Sum of all your liquid assets (cash, stocks, ETFs) and real estate equity." />
            </div>
            <div className="text-5xl md:text-7xl font-mono font-bold tracking-tight text-accent overflow-hidden whitespace-nowrap">
              <AnimatedNumber 
                value={totalNetWorth} 
                formatter={(v) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} 
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <div className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                delta >= 0 ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"
              )}>
                {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {formatCurrency(Math.abs(delta))}
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                {deltaPercent >= 0 ? '+' : ''}{deltaPercent.toFixed(1)}% since last month
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-8 md:gap-12 pb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Liquid Assets</p>
                <Tooltip content="Cash and investments that can be quickly converted to currency." />
              </div>
              <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(liquidNetWorth)}</p>
            </div>
            <div className="text-right md:text-left">
              <div className="flex items-center justify-end md:justify-start gap-2 mb-1">
                <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">Real Estate</p>
                <Tooltip content="Current market value of your property adjusted by your ownership % and mortgage pay-down." />
              </div>
              <p className="text-xl font-bold font-mono text-foreground">{formatCurrency(propertyEquity)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Grid: Charts and Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Net Worth Chart */}
        <section className="bg-card p-6 rounded-2xl border-t border-white/5 min-h-[350px]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Wealth Growth</h3>
              <Tooltip content="Historical view of your total net worth over time." />
            </div>
            <TrendingUp size={16} className="text-accent" />
          </div>
          <div className="h-64 w-full">
            {snapshots.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={snapshots} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5C3" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00E5C3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis 
                    dataKey="snapshot_date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#666', fontFamily: 'DM Mono' }} 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short' })}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: '#444', fontFamily: 'DM Mono' }}
                    tickFormatter={(val) => val >= 1000 ? `€${(val/1000).toFixed(0)}k` : `€${val}`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0A0A0A', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono' }}
                    itemStyle={{ color: '#00E5C3' }}
                    formatter={(val: any) => formatCurrency(val)}
                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="net_worth" 
                    stroke="#00E5C3" 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill="url(#colorNetWorth)" 
                    animationDuration={1200}
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl bg-white/[0.01] p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                  <TrendingUp size={24} className="text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground">No Historical Data</p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono uppercase">Upload CSV to start tracking growth</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Allocation */}
        <section className="bg-card p-6 rounded-2xl border-t border-white/5 min-h-[350px]">
           <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Asset Allocation</h3>
              <Tooltip content="Distribution of your wealth across different asset classes." />
            </div>
            <MoreHorizontal size={16} className="text-muted-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-48">
              {breakdownData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={breakdownData} 
                      cx="50%" 
                      cy="50%" 
                      innerRadius={55} 
                      outerRadius={70} 
                      paddingAngle={8} 
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1000}
                    >
                      {breakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={ASSET_COLORS[entry.name] || ASSET_COLORS.other} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center rounded-full border-4 border-white/5 bg-white/[0.01]">
                   <PieChartIcon size={20} className="text-muted-foreground/20" />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center space-y-3">
              {breakdownData.length > 0 ? (
                breakdownData.sort((a,b) => b.value - a.value).map(item => (
                  <div key={item.name} className="flex justify-between items-center group">
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: ASSET_COLORS[item.name] || ASSET_COLORS.other }} />
                      <span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground transition-colors capitalize">{item.name}</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold">{formatCurrency(item.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] font-mono text-muted-foreground/40 italic">Sync data to see breakdown</p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Transactions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-lg font-display font-bold">Recent Activity</h2>
          <button onClick={fetchData} className="text-xs font-mono text-accent uppercase tracking-wider">Sync</button>
        </div>
        
        <div className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="min-w-full divide-y divide-white/5">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Asset</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-sm text-muted-foreground font-mono">No transactions recorded yet.</td></tr>
                ) : (
                  transactions.slice(0, 15).map((t, idx) => (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group animate-fade-in" style={{ animationDelay: `${idx * 40}ms` }}>
                      <td className="px-6 py-4 whitespace-nowrap text-[11px] font-mono text-muted-foreground">{t.date}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border",
                          SOURCE_COLORS[t.source] || SOURCE_COLORS.manual
                        )}>
                          {t.source.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-foreground truncate max-w-[150px]">{t.description}</span>
                          <span className="text-[10px] text-muted-foreground font-mono capitalize">{t.asset_type || 'Other'}</span>
                        </div>
                      </td>
                      <td className={cn(
                        "px-6 py-4 whitespace-nowrap text-right text-xs font-mono font-bold",
                        t.amount < 0 ? 'text-destructive' : 'text-accent'
                      )}>
                        {t.amount > 0 ? '+' : ''}{formatCurrency(convertToEUR(t.amount, t.currency))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {transactions.length > 15 && (
            <div className="p-4 text-center border-t border-white/5">
              <button className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest hover:text-accent transition-colors">
                View Full History
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Import FAB */}
      <div className="fixed bottom-24 right-6 md:right-10 z-40">
        <button 
          onClick={() => setShowImport(!showImport)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 accent-glow",
            showImport ? "bg-white text-black rotate-45" : "bg-accent text-black"
          )}
        >
          <Plus size={28} />
        </button>
      </div>

      {/* Import Sheet (Improved Modal) */}
      {showImport && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in" onClick={() => setShowImport(false)}>
          <div 
            className="bg-[#0A0A0A] w-full max-w-xl rounded-[2.5rem] border border-white/10 animate-slide-up shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag Handle Decor */}
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-12 h-1.5 bg-white/10 rounded-full" />
            </div>

            <div className="p-8 pt-4 overflow-y-auto custom-scrollbar">
              <header className="mb-8">
                <h3 className="text-3xl font-display font-bold text-accent tracking-tight">Sync Data</h3>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-[0.2em] mt-2">Update your financial engines</p>
              </header>
              
              <div className="space-y-8 pb-4">
                <CSVImporter onComplete={() => { fetchData(); setShowImport(false); }} />
                <ManualTradeRepublic onComplete={() => { fetchData(); setShowImport(false); }} />
                <ManualABNAMRO onComplete={() => { fetchData(); setShowImport(false); }} />
              </div>
            </div>
            
            {/* Bottom Safe Area Padding */}
            <div className="h-6 shrink-0" />
          </div>
        </div>
      )}

      {/* Status Footer */}
      <div className="px-2 pt-4 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>Real-time tracking active</span>
        </div>
        {lastUpload && (
          <span>Updated {new Date(lastUpload.date).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
