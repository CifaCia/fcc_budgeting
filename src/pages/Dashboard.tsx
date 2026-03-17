import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { convertToEUR, formatCurrency } from '@/lib/currency';
import CSVImporter from '@/components/dashboard/CSVImporter';
import ManualTradeRepublic from '@/components/dashboard/ManualTradeRepublic';
import ManualABNAMRO from '@/components/dashboard/ManualABNAMRO';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Plus, Edit2, Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  cash: '#10B981',     // Emerald
  stock: '#3B82F6',    // Blue
  etf: '#6366F1',      // Indigo
  property: '#EC4899', // Pink
  other: '#94A3B8',    // Slate
};

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [lastUpload, setLastUpload] = useState<LastUpload | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

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
      await createSnapshot(trans, todayStr, settings, liquid, propEquity);
    }

    setLoading(false);
  };

  const createSnapshot = async (trans: Transaction[], date: string, settings: any, liquid: number, propEquity: number) => {
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

  const liquidNetWorth = transactions.reduce((sum, t) => sum + convertToEUR(t.amount, t.currency), 0);
  const propertyEquity = property ? property.value * property.ownership * property.debtFree : 0;
  const totalNetWorth = liquidNetWorth + propertyEquity;
  
  const breakdownData = Object.entries(
    transactions.reduce((acc, t) => {
      const type = t.asset_type || 'other';
      acc[type] = (acc[type] || 0) + convertToEUR(t.amount, t.currency);
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  if (propertyEquity > 0) breakdownData.push({ name: 'property', value: propertyEquity });

  const lastMonthSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : (snapshots[0] || null);
  const delta = lastMonthSnapshot ? totalNetWorth - lastMonthSnapshot.net_worth : 0;
  const deltaPercent = lastMonthSnapshot && lastMonthSnapshot.net_worth > 0 ? (delta / lastMonthSnapshot.net_worth) * 100 : 0;

  const handleEditCategory = async (id: string) => {
    const { error } = await supabase.from('transactions').update({ category: editValue }).eq('id', id);
    if (!error) {
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: editValue } : t));
      setEditingCategoryId(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading Dashboard...</div>;

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portfolio Overview</h1>
          <p className="text-gray-500">Welcome back, {user?.email}</p>
        </div>
        <button onClick={() => setShowImport(!showImport)} className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors shadow-sm font-medium">
          <Plus size={18} className="mr-2" /> Update Data
        </button>
      </div>

      {showImport && (
        <div className="space-y-8 bg-gray-50 p-6 rounded-xl border-2 border-dashed border-gray-200">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <CSVImporter onComplete={fetchData} />
            <ManualTradeRepublic onComplete={fetchData} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <ManualABNAMRO onComplete={fetchData} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between min-h-[240px]">
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider flex justify-between">
                <span>Total Net Worth</span>
                {property && property.value > 0 && (
                  <span className="text-[10px] text-pink-500 bg-pink-50 px-2 py-0.5 rounded border border-pink-100">
                    House Price: {formatCurrency(property.value)}
                  </span>
                )}
              </h3>
              <div className="mt-2 text-4xl font-bold text-gray-900">{formatCurrency(totalNetWorth)}</div>
              <div className="mt-2 flex items-center space-x-2">
                <div className={cn("flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", delta >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>
                  {delta >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                  {formatCurrency(Math.abs(delta))}
                </div>
                <span className="text-xs text-gray-500">{deltaPercent.toFixed(1)}% vs last snapshot</span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-50 grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Liquid Assets</h3>
                <div className="mt-1 text-xl font-bold text-indigo-600">{formatCurrency(liquidNetWorth)}</div>
              </div>
              <div className="text-right">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Property Equity</h3>
                <div className="mt-1 text-xl font-bold text-pink-600">{formatCurrency(propertyEquity)}</div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400 flex items-center">
            <Clock size={14} className="mr-1" />
            {lastUpload ? <span>Last update: {new Date(lastUpload.date).toLocaleString()}</span> : <span>No upload history found.</span>}
          </div>
        </div>

        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Asset Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdownData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {breakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={ASSET_COLORS[entry.name] || ASSET_COLORS.other} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(val: any) => formatCurrency(val)} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-y-auto">
           <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">Breakdown</h3>
           <div className="space-y-4">
              {breakdownData.sort((a,b) => b.value - a.value).map(item => (
                <div key={item.name} className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: ASSET_COLORS[item.name] || ASSET_COLORS.other }} />
                    <span className="text-sm font-medium text-gray-700 capitalize">{item.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.value)}</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">Net Worth History</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshots}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis dataKey="snapshot_date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} tickFormatter={(val) => `€${(val/1000).toFixed(0)}k`} />
              <RechartsTooltip formatter={(val: any) => formatCurrency(val)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="net_worth" stroke="#6366F1" strokeWidth={3} dot={{ r: 4, fill: '#6366F1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-900">Recent Transactions</h2>
          <button onClick={fetchData} className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500 italic">No transactions found.</td></tr>
              ) : (
                transactions.slice(0, 10).map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{t.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn("px-2 py-1 rounded text-[10px] font-bold uppercase", t.source.includes('abn') ? "bg-teal-100 text-teal-800" : t.source === 'degiro' ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800")}>
                        {t.source.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium truncate max-w-xs">{t.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {editingCategoryId === t.id ? (
                        <div className="flex items-center space-x-2">
                          <input autoFocus className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-indigo-500" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEditCategory(t.id)} />
                          <button onClick={() => handleEditCategory(t.id)} className="text-green-600"><Check size={16} /></button>
                          <button onClick={() => setEditingCategoryId(null)} className="text-red-600"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center group">
                          <span>{t.category || 'Uncategorized'}</span>
                          <button onClick={() => { setEditingCategoryId(t.id); setEditValue(t.category || ''); }} className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-600"><Edit2 size={14} /></button>
                        </div>
                      )}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(convertToEUR(t.amount, t.currency))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
