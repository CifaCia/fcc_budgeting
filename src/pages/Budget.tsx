import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/currency';
import { 
  Plus, Trash2, Save, TrendingUp, Wallet, ArrowRightLeft, 
  Check, X, AlertCircle, ChevronLeft, ChevronRight 
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

    // 1. Fetch Budget Items
    const { data: budgetData } = await supabase
      .from('budget_items')
      .select('*')
      .eq('user_id', user.id)
      .order('category', { ascending: true });
    setBudgetItems(budgetData || []);

    // 2. Fetch Monthly Income from Settings
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('monthly_income')
      .eq('user_id', user.id)
      .maybeSingle();
    setMonthlyIncome(Number(settingsData?.monthly_income) || 0);

    // 3. Fetch Actual Spend for selected month
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
      // We only care about expenses (negative amounts) for the budget comparison
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

  if (loading) return <div className="flex items-center justify-center h-full">Loading Budget...</div>;

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Tracker</h1>
          <p className="text-gray-500">Plan your expenses and monitor saving rates.</p>
        </div>
        <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-1">
          <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-50 rounded-md"><ChevronLeft size={18} /></button>
          <span className="px-4 font-bold text-sm min-w-[120px] text-center">
            {new Date(selectedMonth + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-50 rounded-md"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center">
            <TrendingUp size={14} className="mr-1 text-green-500" /> Monthly Income
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">€</span>
            <input 
              type="number"
              value={monthlyIncome}
              onChange={(e) => handleUpdateIncome(e.target.value)}
              className="text-2xl font-bold w-full bg-transparent border-none p-0 focus:ring-0"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">Adjust your expected take-home pay.</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center">
            <Wallet size={14} className="mr-1 text-indigo-500" /> Savings Target
          </h3>
          <div className="text-2xl font-bold">{formatCurrency(expectedSaving)}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
              {expectedSavingRate.toFixed(1)}% Goal
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center">
            <ArrowRightLeft size={14} className="mr-1 text-pink-500" /> Actual Savings
          </h3>
          <div className={cn("text-2xl font-bold", actualSaving >= expectedSaving ? "text-green-600" : "text-amber-600")}>
            {formatCurrency(actualSaving)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded",
              actualSavingRate >= expectedSavingRate ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
            )}>
              {actualSavingRate.toFixed(1)}% Realized
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Section 1: Budget Definition */}
        <section className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">Define Budget</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/30">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Monthly</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase">Fixed?</th>
                  <th className="px-6 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {budgetItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    {editingId === item.id ? (
                      <>
                        <td className="px-6 py-3"><input className="w-full border rounded px-2 py-1 text-sm" value={editValue?.category} onChange={e => setEditValue(v => v ? {...v, category: e.target.value} : null)} /></td>
                        <td className="px-6 py-3"><input type="number" className="w-full border rounded px-2 py-1 text-sm" value={editValue?.expected_monthly} onChange={e => setEditValue(v => v ? {...v, expected_monthly: parseFloat(e.target.value)} : null)} /></td>
                        <td className="px-6 py-3 text-center"><input type="checkbox" checked={editValue?.is_fixed} onChange={e => setEditValue(v => v ? {...v, is_fixed: e.target.checked} : null)} /></td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={saveEdit} className="text-green-600"><Check size={16} /></button>
                            <button onClick={() => setEditingId(null)} className="text-red-600"><X size={16} /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 cursor-pointer" onClick={() => startEdit(item)}>{item.category}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 cursor-pointer" onClick={() => startEdit(item)}>{formatCurrency(item.expected_monthly)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase", item.is_fixed ? "bg-blue-50 text-blue-600" : "bg-gray-50 text-gray-500")}>
                            {item.is_fixed ? 'Fixed' : 'Var'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {/* Add Row */}
                <tr className="bg-gray-50/30">
                  <td className="px-6 py-3"><input placeholder="New Category..." className="w-full border-gray-200 rounded px-2 py-1 text-sm" value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} /></td>
                  <td className="px-6 py-3"><input type="number" placeholder="0.00" className="w-full border-gray-200 rounded px-2 py-1 text-sm" value={newItem.amount} onChange={e => setNewItem({...newItem, amount: e.target.value})} /></td>
                  <td className="px-6 py-3 text-center"><input type="checkbox" checked={newItem.isFixed} onChange={e => setNewItem({...newItem, isFixed: e.target.checked})} /></td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={handleAddRow} className="bg-indigo-600 text-white p-1.5 rounded-md hover:bg-indigo-700 transition-colors"><Plus size={16} /></button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 uppercase">Total Budgeted</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">{formatCurrency(totalBudgeted)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Section 2: Monthly Comparison */}
        <section className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-bold text-gray-900">Monthly Actuals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/30">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Budget</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Diff</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {budgetItems.map(item => {
                  const actual = actualSpend[item.category] || 0;
                  const diff = item.expected_monthly - actual;
                  return (
                    <tr key={`actual-${item.id}`} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 text-right">{formatCurrency(item.expected_monthly)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">{formatCurrency(actual)}</td>
                      <td className={cn(
                        "px-6 py-4 text-sm text-right font-bold",
                        diff >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                      </td>
                    </tr>
                  );
                })}
                {/* Uncategorized actuals */}
                {Object.keys(actualSpend).filter(cat => !budgetItems.some(bi => bi.category === cat)).map(cat => (
                  <tr key={`uncat-${cat}`} className="bg-amber-50/30">
                    <td className="px-6 py-4 text-sm italic text-amber-700">{cat}*</td>
                    <td className="px-6 py-4 text-sm text-gray-400 text-right">{formatCurrency(0)}</td>
                    <td className="px-6 py-4 text-sm text-amber-700 text-right font-medium">{formatCurrency(actualSpend[cat])}</td>
                    <td className="px-6 py-4 text-sm text-red-600 text-right font-bold">-{formatCurrency(actualSpend[cat])}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 uppercase">Total Expenses</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-500 text-right">{formatCurrency(totalBudgeted)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">{formatCurrency(totalActual)}</td>
                  <td className={cn(
                    "px-6 py-4 text-sm font-bold text-right",
                    (totalBudgeted - totalActual) >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {formatCurrency(totalBudgeted - totalActual)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 bg-gray-50 text-[10px] text-gray-400">
            * Items with asterisk are transactions not matching any defined budget category.
          </div>
        </section>
      </div>
    </div>
  );
}
