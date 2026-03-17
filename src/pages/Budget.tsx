import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/currency';
import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber';
import { 
  Plus, Trash2, TrendingUp,
  Check, X, ChevronLeft, ChevronRight, PieChart,
  Target, Info, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BudgetItem {
  id: string;
  category: string;
  expected_monthly: number;
  is_fixed: boolean;
}

export default function Budget() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [actualSpend, setActualSpend] = useState<Record<string, number>>({});
  
  // Inline Add State
  const [newItem, setNewItem] = useState({ category: '', amount: '', isFixed: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<BudgetItem | null>(null);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: budgetData } = await supabase
      .from('budget_items')
      .select('*')
      .eq('user_id', user.id)
      .order('category', { ascending: true });
    setBudgetItems(budgetData || []);

    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('monthly_income')
      .eq('user_id', user.id)
      .maybeSingle();
    setMonthlyIncome(Number(settingsData?.monthly_income) || 0);

    const startOfMonth = `${selectedMonth}-01`;
    const lastDay = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).getDate();
    const endOfMonth = `${selectedMonth}-${lastDay}`;

    const { data: transData } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('user_id', user.id)
      .gte('date', startOfMonth)
      .lte('date', endOfMonth);

    const totals: Record<string, number> = {};
    (transData || []).forEach(t => {
      if (t.amount < 0) {
        const cat = t.category || 'Uncategorized';
        totals[cat] = (totals[cat] || 0) + Math.abs(t.amount);
      }
    });
    setActualSpend(totals);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user, selectedMonth]);

  const handleAddRow = async () => {
    if (!newItem.category || !newItem.amount) return;
    const { data, error } = await supabase.from('budget_items').insert({
      user_id: user?.id,
      category: newItem.category,
      expected_monthly: parseFloat(newItem.amount),
      is_fixed: newItem.isFixed
    }).select().single();

    if (!error && data) {
      setBudgetItems([...budgetItems, data]);
      setNewItem({ category: '', amount: '', isFixed: false });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (!error) setBudgetItems(budgetItems.filter(item => item.id !== id));
  };

  const handleUpdateIncome = async (val: string) => {
    const amount = parseFloat(val) || 0;
    setMonthlyIncome(amount);
    await supabase.from('user_settings').upsert({ user_id: user?.id, monthly_income: amount }, { onConflict: 'user_id' });
  };

  const startEdit = (item: BudgetItem) => {
    setEditingId(item.id);
    setEditValue({ ...item });
  };

  const saveEdit = async () => {
    if (!editValue) return;
    const { error } = await supabase.from('budget_items').update({
      category: editValue.category,
      expected_monthly: editValue.expected_monthly,
      is_fixed: editValue.is_fixed
    }).eq('id', editValue.id);

    if (!error) {
      setBudgetItems(budgetItems.map(i => i.id === editValue.id ? editValue : i));
      setEditingId(null);
    }
  };

  // Calculations
  const totalBudgeted = budgetItems.reduce((sum, i) => sum + i.expected_monthly, 0);
  const totalActual = Object.values(actualSpend).reduce((sum, v) => sum + v, 0);
  const expectedSaving = monthlyIncome - totalBudgeted;
  const expectedSavingRate = monthlyIncome > 0 ? (expectedSaving / monthlyIncome) * 100 : 0;
  const actualSaving = monthlyIncome - totalActual;
  const actualSavingRate = monthlyIncome > 0 ? (actualSaving / monthlyIncome) * 100 : 0;

  const changeMonth = (dir: number) => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() + dir);
    setSelectedMonth(date.toISOString().slice(0, 7));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-muted-foreground font-mono text-sm animate-pulse">Synchronizing Budget...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Budget Planner</h1>
          <p className="text-muted-foreground text-sm font-medium">Control your cash flow and optimize savings.</p>
        </div>
        
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
          <button onClick={() => changeMonth(-1)} className="p-2.5 text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft size={20} /></button>
          <div className="px-4 py-1 flex flex-col items-center min-w-[140px]">
            <span className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Monitoring</span>
            <span className="text-sm font-bold font-display uppercase tracking-tight">
              {new Date(selectedMonth + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <button onClick={() => changeMonth(1)} className="p-2.5 text-muted-foreground hover:text-foreground transition-colors"><ChevronRight size={20} /></button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-accent" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Monthly Income</span>
          </div>
          <div className="flex items-baseline gap-2 group">
            <span className="text-2xl font-mono font-bold text-accent">€</span>
            <input 
              type="number"
              value={monthlyIncome}
              onChange={(e) => handleUpdateIncome(e.target.value)}
              className="text-4xl font-mono font-bold w-full bg-transparent border-none p-0 focus:ring-0 text-foreground"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 font-mono uppercase">Adjustable input</p>
        </div>

        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up delay-100">
          <div className="flex items-center gap-2 mb-4">
            <Target size={14} className="text-blue-400" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Savings Target</span>
          </div>
          <div className="text-4xl font-mono font-bold">
            <AnimatedNumber value={expectedSaving} formatter={formatCurrency} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
              {expectedSavingRate.toFixed(1)}% GOAL
            </span>
          </div>
        </div>

        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up delay-200 shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <PieChart size={14} className="text-amber-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Actual Savings</span>
          </div>
          <div className={cn("text-4xl font-mono font-bold", actualSaving >= expectedSaving ? "text-accent" : "text-destructive")}>
            <AnimatedNumber value={actualSaving} formatter={formatCurrency} />
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className={cn(
              "text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border",
              actualSavingRate >= expectedSavingRate ? "bg-accent/10 text-accent border-accent/20" : "bg-destructive/10 text-destructive border-destructive/20"
            )}>
              {actualSavingRate.toFixed(1)}% REALIZED
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Definition */}
        <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Define Allocation</h2>
            <div className="text-[10px] font-mono font-bold bg-white/5 px-2 py-1 rounded text-muted-foreground uppercase">
              Total: {formatCurrency(totalBudgeted)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Plan</th>
                  <th className="px-6 py-4 text-center text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {budgetItems.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-white/[0.01] transition-colors group animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                    {editingId === item.id ? (
                      <>
                        <td className="px-6 py-4"><input className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-foreground focus:ring-accent" value={editValue?.category} onChange={e => setEditValue(v => v ? {...v, category: e.target.value} : null)} /></td>
                        <td className="px-6 py-4"><input type="number" className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-foreground focus:ring-accent font-mono" value={editValue?.expected_monthly} onChange={e => setEditValue(v => v ? {...v, expected_monthly: parseFloat(e.target.value)} : null)} /></td>
                        <td className="px-6 py-4 text-center"><input type="checkbox" checked={editValue?.is_fixed} onChange={e => setEditValue(v => v ? {...v, is_fixed: e.target.checked} : null)} className="accent-accent" /></td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={saveEdit} className="text-accent hover:scale-110 transition-transform"><Check size={18} /></button>
                            <button onClick={() => setEditingId(null)} className="text-destructive hover:scale-110 transition-transform"><X size={18} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-5 text-sm font-bold cursor-pointer" onClick={() => startEdit(item)}>{item.category}</td>
                        <td className="px-6 py-5 text-sm font-mono font-bold text-muted-foreground cursor-pointer" onClick={() => startEdit(item)}>{formatCurrency(item.expected_monthly)}</td>
                        <td className="px-6 py-5 text-center">
                          <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border", item.is_fixed ? "bg-white/10 text-foreground border-white/20" : "bg-accent/10 text-accent border-accent/20")}>
                            {item.is_fixed ? 'Fixed' : 'Var'}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {/* Add Inline */}
                <tr className="bg-white/[0.02]">
                  <td className="px-6 py-4"><input placeholder="Add Category..." className="w-full bg-transparent border-none p-0 text-xs placeholder:text-muted-foreground/30 focus:ring-0" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} /></td>
                  <td className="px-6 py-4"><input type="number" placeholder="0.00" className="w-full bg-transparent border-none p-0 text-xs font-mono placeholder:text-muted-foreground/30 focus:ring-0" value={newItem.amount} onChange={e => setNewItem({...newItem, amount: e.target.value})} /></td>
                  <td className="px-6 py-4 text-center"><input type="checkbox" checked={newItem.isFixed} onChange={e => setNewItem({...newItem, isFixed: e.target.checked})} className="accent-accent" /></td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={handleAddRow} className="text-accent p-1.5 hover:scale-110 transition-all"><Plus size={20} /></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Comparison */}
        <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden h-fit">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Monthly Status</h2>
            <div className="text-[10px] font-mono font-bold bg-destructive/10 px-2 py-1 rounded text-destructive uppercase">
              Actual: {formatCurrency(totalActual)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {budgetItems.map(item => {
                  const actual = actualSpend[item.category] || 0;
                  const diff = item.expected_monthly - actual;
                  const progress = Math.min(100, (actual / item.expected_monthly) * 100);
                  
                  return (
                    <tr key={`actual-${item.id}`} className="hover:bg-white/[0.01] transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-bold">{item.category}</span>
                          <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden">
                            <div className={cn("h-full transition-all duration-700", diff >= 0 ? "bg-accent" : "bg-destructive")} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex flex-col">
                          <span className="text-xs font-mono font-bold">{formatCurrency(actual)}</span>
                          <span className="text-[9px] font-mono text-muted-foreground tracking-tighter uppercase">of {formatCurrency(item.expected_monthly)}</span>
                        </div>
                      </td>
                      <td className={cn(
                        "px-6 py-5 text-right text-xs font-mono font-bold",
                        diff >= 0 ? "text-accent" : "text-destructive"
                      )}>
                        {diff >= 0 ? <ArrowUpRight size={14} className="inline mr-1" /> : <ArrowDownRight size={14} className="inline mr-1" />}
                        {formatCurrency(Math.abs(diff))}
                      </td>
                    </tr>
                  );
                })}
                {/* Uncategorized */}
                {Object.keys(actualSpend).filter(cat => !budgetItems.some(bi => bi.category === cat)).map(cat => (
                  <tr key={`uncat-${cat}`} className="bg-destructive/5">
                    <td className="px-6 py-4 text-xs italic text-destructive font-medium">{cat}</td>
                    <td className="px-6 py-4 text-right text-xs font-mono font-bold text-destructive">{formatCurrency(actualSpend[cat])}</td>
                    <td className="px-6 py-4 text-right text-xs font-mono font-bold text-destructive">-{formatCurrency(actualSpend[cat])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-white/[0.02] flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
            <Info size={14} className="text-accent" />
            <span>Uncategorized expenses are highlighted in red.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
