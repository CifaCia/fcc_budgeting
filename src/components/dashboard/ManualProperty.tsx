import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { generateRowHash } from '@/lib/csvParsers';
import { CheckCircle, AlertCircle, Home } from 'lucide-react';
import { updateLastUploadMetadata } from '@/lib/settings';

export default function ManualProperty({ onComplete }: { onComplete?: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setStatus(null);

    const amountNum = parseFloat(formData.amount);

    // Create a unique hash
    const rawRow = { ...formData, timestamp: Date.now(), asset_type: 'property' };
    const hash = generateRowHash(rawRow);

    try {
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        date: formData.date,
        amount: amountNum,
        currency: 'EUR',
        description: formData.description || 'Property Value',
        category: 'Property',
        source: 'manual',
        asset_type: 'property',
        raw_csv_row: rawRow,
        row_hash: hash,
      });

      if (error) throw error;

      await updateLastUploadMetadata(user.id, 'property', 1);

      setStatus({ type: 'success', message: 'Property value updated!' });
      setFormData({
        ...formData,
        amount: '',
        description: '',
      });
      if (onComplete) onComplete();
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save property.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
        <Home size={20} className="text-orange-600" />
        Manual Property Entry
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Total Value (EUR)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. 350000"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Primary Residence, Investment Apartment"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 sm:text-sm p-2 border"
          />
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
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Add Property Value'}
        </button>
      </form>
    </div>
  );
}
