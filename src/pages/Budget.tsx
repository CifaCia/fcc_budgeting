import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/currency';
import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber';
import { Tooltip } from '@/components/ui/Tooltip';
import { 
  Plus, Trash2, TrendingUp,
  Check, X, ChevronLeft, ChevronRight, PieChart as PieChartIcon,
  Target, Info, ArrowUpRight, ArrowDownRight, LayoutDashboard,
  Edit2
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS = [
  '#00E5C3', // Electric Teal
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Violet
  '#10B981', // Emerald
  '#F43F5E', // Rose
];

interface BudgetItem {
  id: string;
  category: string;
  label: string | null;
  expected_monthly: number;
  is_fixed: boolean;
}

export default function Budget() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('monthly_income');
      return cached ? parseFloat(cached) : 0;
    }
    return 0;
  });
  const [incomeInput, setIncomeInput] = useState(monthlyIncome.toString());
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [actualSpend, setActualSpend] = useState<Record<string, number>>({});
  
  // New Entry State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ category: '', label: '', amount: '', isFixed: true });
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<BudgetItem | null>(null);

  const availableCategories = useMemo(() => {
    const fromBudget = budgetItems.map(i => i.category);
    const fromTransactions = Object.keys(actualSpend);
    return Array.from(new Set([...fromBudget, ...fromTransactions])).sort();
  }, [budgetItems, actualSpend]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    try {
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
      
      if (settingsData?.monthly_income !== undefined) {
        const income = Number(settingsData.monthly_income);
        setMonthlyIncome(income);
        setIncomeInput(income.toString());
        localStorage.setItem('monthly_income', income.toString());
      }

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
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, selectedMonth]);

  const handleAddRow = async () => {
    if (!user) return;
    
    const category = isAddingNewCategory ? newCategoryName : newItem.category;
    if (!category || !newItem.amount) {
      alert("Please fill in both category and amount.");
      return;
    }

    const { data, error } = await supabase.from('budget_items').insert({
      user_id: user.id,
      category,
      label: newItem.label,
      expected_monthly: parseFloat(newItem.amount),
      is_fixed: newItem.isFixed
    }).select().single();

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    if (data) {
      setBudgetItems([...budgetItems, data]);
      setNewItem({ category: '', label: '', amount: '', isFixed: true });
      setIsAddingNewCategory(false);
      setNewCategoryName('');
      setShowAddForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (!error) setBudgetItems(budgetItems.filter(item => item.id !== id));
  };

  useEffect(() => {
    const timer = setTimeout(async () => {
      const amount = parseFloat(incomeInput) || 0;
      if (amount !== monthlyIncome) {
        setMonthlyIncome(amount);
        localStorage.setItem('monthly_income', amount.toString());
        if (user) {
          await supabase.from('user_settings').upsert({ user_id: user.id, monthly_income: amount }, { onConflict: 'user_id' });
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [incomeInput, user]);

  const handleUpdateIncomeInput = (val: string) => {
    setIncomeInput(val);
  };

  const startEdit = (item: BudgetItem) => {
    setEditingId(item.id);
    setEditValue({ ...item });
  };

  const saveEdit = async () => {
    if (!editValue) return;

    const { error } = await supabase.from('budget_items').update({
      category: editValue.category,
      label: editValue.label,
      expected_monthly: editValue.expected_monthly,
      is_fixed: editValue.is_fixed
    }).eq('id', editValue.id);

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    setBudgetItems(budgetItems.map(i => i.id === editValue.id ? editValue : i));
    setEditingId(null);
  };

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

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    budgetItems.forEach(item => {
      totals[item.category] = (totals[item.category] || 0) + item.expected_monthly;
    });
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [budgetItems]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-accent" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Monthly Income</span>
            </div>
            <Tooltip content="Your total after-tax income for this month." />
          </div>
          <div className="flex items-baseline gap-2 group">
            <span className="text-2xl font-mono font-bold text-accent">€</span>
            <input 
              type="number"
              value={incomeInput}
              onChange={(e) => handleUpdateIncomeInput(e.target.value)}
              className="text-4xl font-mono font-bold w-full bg-transparent border-none p-0 focus:ring-0 text-foreground"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-4 font-mono uppercase">Adjustable input</p>
        </div>

        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up delay-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-blue-400" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Savings Target</span>
            </div>
            <Tooltip content="The amount you aim to save after all budgeted expenses are paid." />
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

        <div className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up delay-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChartIcon size={14} className="text-amber-500" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Actual Savings</span>
            </div>
            <Tooltip content="Income minus actual tracked spending for the selected month." />
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

        <div className="bg-card p-4 rounded-2xl border-t border-white/5 animate-slide-up delay-300 flex items-center gap-4">
          <div className="w-24 h-24 shrink-0">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={25}
                    outerRadius={35}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categoryData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center rounded-full border-2 border-dashed border-white/5 bg-white/[0.02]">
                <PieChartIcon size={16} className="text-muted-foreground/20" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <LayoutDashboard size={12} className="text-accent" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Allocation</span>
            </div>
            <div className="space-y-1">
              {categoryData.length > 0 ? (
                categoryData.slice(0, 3).map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      <span className="text-[10px] font-mono text-muted-foreground truncate">{cat.name}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold whitespace-nowrap">{totalBudgeted > 0 ? Math.round((cat.value / totalBudgeted) * 100) : 0}%</span>
                  </div>
                ))
              ) : (
                <span className="text-[9px] font-mono text-muted-foreground/40 italic uppercase tracking-tighter">No data</span>
              )}
              {categoryData.length > 3 && (
                <span className="text-[9px] font-mono text-muted-foreground/50 italic">+{categoryData.length - 3} more</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <section className="flex-1 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Allocation</h2>
              <Tooltip content="Define your monthly spending plan." />
            </div>
            <button 
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-mono font-bold uppercase transition-all shadow-xl",
                showAddForm ? "bg-white text-black" : "bg-accent text-black"
              )}
            >
              {showAddForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Entry</>}
            </button>
          </div>

          {showAddForm && (
            <div className="bg-card p-6 md:p-8 rounded-3xl border border-accent/30 animate-slide-up space-y-6 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono text-accent uppercase tracking-widest font-bold">1. Category</label>
                  {isAddingNewCategory ? (
                    <div className="flex gap-2">
                      <input 
                        placeholder="Type category name..." 
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:ring-accent" 
                        value={newCategoryName} 
                        onChange={e => setNewCategoryName(e.target.value)} 
                        autoFocus
                      />
                      <button type="button" onClick={() => setIsAddingNewCategory(false)} className="p-3 text-destructive bg-white/5 rounded-xl"><X size={18} /></button>
                    </div>
                  ) : (
                    <select 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:ring-accent"
                      value={newItem.category}
                      onChange={e => e.target.value === 'ADD_NEW' ? setIsAddingNewCategory(true) : setNewItem({...newItem, category: e.target.value})}
                    >
                      <option value="">Select Category...</option>
                      {availableCategories.map(cat => <option key={cat} value={cat} className="bg-black">{cat}</option>)}
                      <option value="ADD_NEW" className="bg-black font-bold text-accent">+ Add New Category...</option>
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-accent uppercase tracking-widest font-bold">2. Entry Name</label>
                  <input 
                    placeholder="e.g. Netflix, Rent..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:ring-accent" 
                    value={newItem.label} 
                    onChange={e => setNewItem({...newItem, label: e.target.value})} 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono text-accent uppercase tracking-widest font-bold">3. Monthly Amount (€)</label>
                  <input 
                    type="number"
                    placeholder="0.00" 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-foreground focus:ring-accent" 
                    value={newItem.amount} 
                    onChange={e => setNewItem({...newItem, amount: e.target.value})} 
                    onKeyDown={e => e.key === 'Enter' && handleAddRow()}
                  />
                </div>

                <div className="flex items-end">
                  <button 
                    type="button"
                    onClick={() => setNewItem({...newItem, isFixed: !newItem.isFixed})}
                    className={cn(
                      "w-full h-[46px] rounded-xl border flex items-center justify-center gap-3 transition-all font-mono text-xs uppercase font-bold",
                      newItem.isFixed ? "bg-accent/10 border-accent/30 text-accent" : "bg-white/5 border-white/10 text-muted-foreground"
                    )}
                  >
                    <Check size={16} className={newItem.isFixed ? "opacity-100" : "opacity-20"} />
                    Fixed / Recurring
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <button 
                  type="button"
                  onClick={handleAddRow}
                  className="w-full bg-accent text-black h-14 rounded-2xl font-mono font-bold text-base uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 shadow-lg shadow-accent/20"
                >
                  <Plus size={24} /> Confirm and Add Entry
                </button>
              </div>
            </div>
          )}

          <div className="bg-card rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
            <div className="hidden md:grid grid-cols-[1fr_120px_100px_80px] gap-4 px-8 py-5 bg-white/[0.02] border-b border-white/5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Category & Entry</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Plan</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest text-center">Type</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest text-right"></span>
            </div>

            <div className="divide-y divide-white/5">
              {budgetItems.map((item, idx) => (
                <div key={item.id} className="group hover:bg-white/[0.01] transition-colors">
                  {editingId === item.id ? (
                    <div className="p-6 md:p-8 bg-white/[0.03] space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <input className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-accent" value={editValue?.category} onChange={e => setEditValue(v => v ? {...v, category: e.target.value} : null)} />
                        <input className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-accent" value={editValue?.label || ''} onChange={e => setEditValue(v => v ? {...v, label: e.target.value} : null)} />
                        <input type="number" className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-accent" value={editValue?.expected_monthly} onChange={e => setEditValue(v => v ? {...v, expected_monthly: parseFloat(e.target.value)} : null)} onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                      </div>
                      <div className="flex gap-4">
                        <button type="button" onClick={saveEdit} className="flex-[2] bg-accent text-black h-12 rounded-xl font-mono font-bold text-xs uppercase flex items-center justify-center gap-2 shadow-lg"><Check size={18} /> Save Changes</button>
                        <button type="button" onClick={() => setEditingId(null)} className="flex-1 bg-white/5 text-muted-foreground h-12 rounded-xl font-mono font-bold text-xs uppercase">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col md:grid md:grid-cols-[1fr_120px_100px_80px] gap-4 px-6 md:px-8 py-5 items-center">
                      <div className="w-full flex items-center gap-4 min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-accent/60 mb-0.5">{item.category}</span>
                          <span className="text-sm font-bold text-foreground truncate">{item.label || '—'}</span>
                        </div>
                      </div>
                      <div className="w-full md:w-auto flex items-center justify-between md:justify-start">
                        <span className="md:hidden text-[10px] font-mono text-muted-foreground uppercase">Budget:</span>
                        <span className="text-sm font-mono font-bold text-muted-foreground">{formatCurrency(item.expected_monthly)}</span>
                      </div>
                      <div className="w-full md:w-auto flex items-center justify-between md:justify-center">
                        <span className="md:hidden text-[10px] font-mono text-muted-foreground uppercase">Type:</span>
                        <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border", item.is_fixed ? "bg-white/10 text-foreground border-white/20" : "bg-accent/10 text-accent border-accent/20")}>{item.is_fixed ? 'Fixed' : 'Var'}</span>
                      </div>
                      <div className="w-full md:w-auto flex items-center justify-end gap-4 md:gap-2">
                        <button type="button" onClick={() => startEdit(item)} className="p-2 text-muted-foreground hover:text-accent"><Edit2 size={16} /></button>
                        <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full lg:w-[400px] space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Monthly Status</h2>
          </div>
          <div className="bg-card rounded-3xl border border-white/5 overflow-hidden h-fit shadow-xl">
            <div className="p-6 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Actual Spending</span>
              <span className="text-sm font-mono font-bold text-destructive uppercase">{formatCurrency(totalActual)}</span>
            </div>
            <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
              {budgetItems.map(item => {
                const actual = actualSpend[item.category] || 0;
                const diff = item.expected_monthly - actual;
                const progress = Math.min(100, (actual / item.expected_monthly) * 100);
                return (
                  <div key={`actual-${item.id}`} className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-0.5 truncate">{item.category}</span>
                        <span className="text-xs font-bold text-foreground truncate">{item.label || '—'}</span>
                      </div>
                      <div className={cn("text-right text-[11px] font-mono font-bold flex items-center gap-1", diff >= 0 ? "text-accent" : "text-destructive")}>
                        {diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {formatCurrency(Math.abs(diff))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-muted-foreground">Used {formatCurrency(actual)}</span>
                        <span className="font-bold">{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className={cn("h-full transition-all duration-700", diff >= 0 ? "bg-accent" : "bg-destructive")} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {Object.keys(actualSpend).filter(cat => !budgetItems.some(bi => bi.category === cat)).map(cat => (
                <div key={`uncat-${cat}`} className="p-6 bg-destructive/5">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-mono text-destructive uppercase tracking-widest mb-1">Uncategorized</span>
                      <span className="text-xs font-bold text-destructive italic truncate">{cat}</span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-xs font-mono font-bold text-destructive">-{formatCurrency(actualSpend[cat])}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
