import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { generateRowHash } from '@/lib/csvParsers';
import { PlusCircle, CheckCircle, AlertCircle, Landmark } from 'lucide-react';
import { updateLastUploadMetadata } from '@/lib/settings';
import { cn } from '@/lib/utils';

export default function ManualABNAMRO({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    source: 'abn_amro_checking' as 'abn_amro_checking' | 'abn_amro_savings',
    balance: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setStatus(null);

    const amountNum = parseFloat(formData.amount);
    const balanceNum = formData.balance ? parseFloat(formData.balance) : undefined;

    const rawRow = { ...formData, timestamp: Date.now(), manual: true };
    const hash = generateRowHash(rawRow);

    try {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        date: formData.date,
        amount: amountNum,
        balance: balanceNum,
        currency: 'EUR',
        description: formData.description || `Manual ABN AMRO ${formData.source.includes('checking') ? 'Checking' : 'Savings'}`,
        category: 'Uncategorized',
        source: formData.source,
        asset_type: 'cash',
        raw_csv_row: rawRow,
        row_hash: hash,
      });

      if (error) throw error;

      await updateLastUploadMetadata(user.id, formData.source, 1);

      setStatus({ type: 'success', message: 'ABN AMRO recorded!' });
      setFormData({ ...formData, amount: '', description: '', balance: '' });
      if (onComplete) onComplete();
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white/[0.03] p-6 rounded-2xl border border-white/5 space-y-6">
      <div className="flex items-center gap-3">
        <Landmark size={20} className="text-teal-400" />
        <h3 className="text-lg font-display font-bold">ABN AMRO</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Account</label>
            <select
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground focus:ring-accent"
            >
              <option value="abn_amro_checking">Checking</option>
              <option value="abn_amro_savings">Savings</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Date</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-foreground focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Amount €</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-foreground focus:ring-accent"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Description</label>
              <input
                type="text"
                placeholder="e.g. Salary"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-foreground focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Balance (Optional)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Current total"
                value={formData.balance}
                onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-foreground focus:ring-accent"
              />
            </div>
          </div>
        </div>

        {status && (
          <div className={cn(
            "p-4 rounded-xl flex items-center gap-3 border",
            status.type === 'success' ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-destructive/10 border-destructive/20 text-destructive'
          )}>
            {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="text-[11px] font-mono font-bold uppercase">{status.message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 bg-teal-400 text-black rounded-xl font-mono font-bold text-xs uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50"
        >
          {loading ? 'SYNCING...' : 'SYNC TRANSACTION'}
        </button>
      </form>
    </div>
  );
}
