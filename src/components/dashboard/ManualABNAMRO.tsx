import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { generateRowHash } from '@/lib/csvParsers';
import { CheckCircle, AlertCircle, Landmark } from 'lucide-react';
import { updateLastUploadMetadata } from '@/lib/settings';

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

    // Create a unique hash for this manual entry
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

      setStatus({ type: 'success', message: 'ABN AMRO transaction recorded!' });
      setFormData({
        ...formData,
        amount: '',
        description: '',
        balance: '',
      });
      if (onComplete) onComplete();
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save transaction.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
        <Landmark size={20} className="text-teal-600" />
        Manual ABN AMRO Entry
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Account</label>
            <select
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border"
            >
              <option value="abn_amro_checking">Checking Account</option>
              <option value="abn_amro_savings">Savings Account</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount (EUR)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. -15.50 or 1000"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
            <input
              type="text"
              placeholder="Rent, Salary, Transfer..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Remaining Balance (Optional)</label>
            <input
              type="number"
              step="0.01"
              placeholder="Total in this account"
              value={formData.balance}
              onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        {status && (
          <div className={`p-3 rounded-md flex items-center gap-2 ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {status.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="text-sm font-medium">{status.message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Add Transaction'}
        </button>
      </form>
    </div>
  );
}
