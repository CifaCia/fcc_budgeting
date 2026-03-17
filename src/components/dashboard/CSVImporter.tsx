import React, { useState, useEffect } from 'react';
import { parseCSV } from '@/lib/csvParsers';
import type { CSVSource, NormalizedTransaction } from '@/lib/csvParsers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle, AlertCircle, FileText, AlertTriangle, Upload } from 'lucide-react';
import { updateLastUploadMetadata } from '@/lib/settings';
import { cn } from '@/lib/utils';

export default function CSVImporter({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuth();
  const [source, setSource] = useState<CSVSource>('abn_amro_checking');
  const [transactions, setTransactions] = useState<NormalizedTransaction[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const fetchMappings = async () => {
      const { data } = await supabase.from('user_settings').select('category_mappings').eq('user_id', user.id).maybeSingle();
      if (data?.category_mappings) setMappings(data.category_mappings);
    };
    fetchMappings();
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parseCSV(file, source, mappings);
      setTransactions(parsed);
      setStatus(null);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to parse CSV file.' });
    }
  };

  const handleImport = async () => {
    if (!user || transactions.length === 0) return;
    setIsImporting(true);
    setStatus(null);

    try {
      if (source === 'degiro_portfolio') {
        await supabase.from('transactions').delete().eq('user_id', user.id).eq('source', 'degiro');
      }

      const { error } = await supabase.from('transactions').upsert(
        transactions.map(t => ({ ...t, user_id: user.id })),
        { onConflict: 'user_id,row_hash', ignoreDuplicates: true }
      );

      if (error) throw error;
      await updateLastUploadMetadata(user.id, source, transactions.length);
      setStatus({ type: 'success', message: 'Import successful!' });
      setTransactions([]);
      if (onComplete) onComplete();
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 bg-white/[0.03] p-6 rounded-2xl border border-white/5 shadow-2xl">
      <div className="flex items-center gap-3 mb-2">
        <Upload size={20} className="text-accent" />
        <h3 className="text-lg font-display font-bold">CSV Engine</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Source Provider</label>
          <select 
            value={source} 
            onChange={(e) => setSource(e.target.value as CSVSource)} 
            className="block w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-accent text-foreground"
          >
            <option value="abn_amro_checking">ABN AMRO (Checking)</option>
            <option value="abn_amro_savings">ABN AMRO (Savings)</option>
            <option value="degiro">DEGIRO (Transactions)</option>
            <option value="degiro_portfolio">DEGIRO (Portfolio Override)</option>
            <option value="trade_republic">Trade Republic</option>
          </select>
        </div>
        
        <div>
          <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2">Select Data File</label>
          <div className="relative group">
            <input 
              type="file" 
              accept=".csv,.txt,.tab" 
              onChange={handleFileChange} 
              className="block w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-mono file:font-bold file:bg-accent file:text-black hover:file:opacity-90 cursor-pointer bg-white/5 rounded-xl p-2 border border-white/5" 
            />
          </div>
        </div>
      </div>

      {source === 'degiro_portfolio' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
          <p className="text-[10px] font-mono text-amber-200 uppercase leading-relaxed"><strong>Destructive Mode:</strong> This action will purge and replace all existing DEGIRO records.</p>
        </div>
      )}

      {status && (
        <div className={cn(
          "p-4 rounded-xl flex items-center gap-3 border",
          status.type === 'success' ? 'bg-accent/10 border-accent/20 text-accent' : 'bg-destructive/10 border-destructive/20 text-destructive'
        )}>
          {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-[11px] font-mono font-bold uppercase">{status.message}</span>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-muted-foreground uppercase flex items-center gap-2">
              <FileText size={14} /> Ready: {transactions.length} Rows
            </h3>
            <button 
              onClick={handleImport} 
              disabled={isImporting} 
              className="bg-accent text-black px-6 py-2 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest hover:scale-105 transition-transform disabled:opacity-50"
            >
              {isImporting ? 'Processing...' : 'Commit Data'}
            </button>
          </div>
          <div className="overflow-x-auto border border-white/5 rounded-xl bg-black/20">
            <table className="min-w-full divide-y divide-white/5 text-[10px] font-mono">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2 text-left text-muted-foreground">Description</th>
                  <th className="px-4 py-2 text-left text-muted-foreground">Type</th>
                  <th className="px-4 py-2 text-right text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.slice(0, 5).map((t, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 truncate max-w-[120px]">{t.description}</td>
                    <td className="px-4 py-2 text-accent">{t.category}</td>
                    <td className={cn("px-4 py-2 text-right font-bold", t.amount < 0 ? 'text-destructive' : 'text-accent')}>
                      {t.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
