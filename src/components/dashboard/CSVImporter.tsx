import React, { useState, useEffect } from 'react';
import { parseCSV } from '@/lib/csvParsers';
import type { CSVSource, NormalizedTransaction } from '@/lib/csvParsers';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle, AlertCircle, FileText, AlertTriangle } from 'lucide-react';
import { updateLastUploadMetadata } from '@/lib/settings';

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
    <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <select value={source} onChange={(e) => setSource(e.target.value as CSVSource)} className="block w-full rounded-md border-gray-300 p-2 border sm:text-sm">
            <option value="abn_amro_checking">ABN AMRO (Checking)</option>
            <option value="abn_amro_savings">ABN AMRO (Savings)</option>
            <option value="degiro">DEGIRO (Transactions)</option>
            <option value="degiro_portfolio">DEGIRO (Portfolio Override)</option>
            <option value="trade_republic">Trade Republic</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
          <input type="file" accept=".csv,.txt,.tab" onChange={handleFileChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
        </div>
      </div>

      {source === 'degiro_portfolio' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
          <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
          <p className="text-xs text-amber-800"><strong>OVERRIDE MODE:</strong> This replaces all DEGIRO data.</p>
        </div>
      )}

      {status && (
        <div className={`p-4 rounded-md flex items-center gap-3 ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{status.message}</span>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2"><FileText size={20} className="text-gray-400" /> Preview ({transactions.length} rows)</h3>
            <button onClick={handleImport} disabled={isImporting} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {isImporting ? 'Importing...' : 'Import Data'}
            </button>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-left">Category</th><th className="px-4 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.slice(0, 10).map((t, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 truncate max-w-xs">{t.description}</td>
                    <td className="px-4 py-2 font-bold text-indigo-600">{t.category}</td>
                    <td className={`px-4 py-2 text-right font-medium ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{t.amount.toFixed(2)}</td>
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
