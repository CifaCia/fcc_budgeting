import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, RefreshCcw, Home, Percent, Euro, Save, Tag, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CSVSource } from '@/lib/csvParsers';

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [sourceToWipe, setSourceToWipe] = useState<CSVSource | 'all'>('all');

  const [propertySettings, setPropertySettings] = useState({ value: 0, ownership: 50, debtFree: 0 });
  const [mappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [newMapping, setNewMapping] = useState({ keyword: '', category: '' });
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchSettings = async () => {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (settings) {
        setPropertySettings({
          value: Number(settings.property_value) || 0,
          ownership: (Number(settings.property_ownership_pct) || 0.5) * 100,
          debtFree: (Number(settings.property_debt_free_pct) || 0) * 100,
        });
        setCategoryMappings(settings.category_mappings || {});
      }

      const { data: budgetItems } = await supabase
        .from('budget_items')
        .select('category')
        .eq('user_id', user.id);
      
      const cats = Array.from(new Set((budgetItems || []).map(i => i.category)));
      setAvailableCategories(cats);
    };
    fetchSettings();
  }, [user]);

  const saveMappings = async (newMappings: Record<string, string>) => {
    if (!user) return;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, category_mappings: newMappings }, { onConflict: 'user_id' });
    
    if (!error) {
      setCategoryMappings(newMappings);
      setMessage({ type: 'success', text: 'Category mappings updated.' });
    }
  };

  const addMapping = () => {
    if (!newMapping.keyword || !newMapping.category) return;
    const updated = { ...mappings, [newMapping.keyword.toLowerCase()]: newMapping.category };
    saveMappings(updated);
    setNewMapping({ keyword: '', category: '' });
  };

  const removeMapping = (keyword: string) => {
    const updated = { ...mappings };
    delete updated[keyword];
    saveMappings(updated);
  };

  const updatePropertyValue = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, property_value: propertySettings.value }, { onConflict: 'user_id' });
    if (!error) setMessage({ type: 'success', text: 'Property value updated.' });
    setLoading(false);
  };

  const updatePropertyEquity = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      property_ownership_pct: propertySettings.ownership / 100,
      property_debt_free_pct: propertySettings.debtFree / 100,
      property_last_auto_update: new Date().toISOString().split('T')[0]
    }, { onConflict: 'user_id' });
    if (!error) setMessage({ type: 'success', text: 'Equity updated.' });
    setLoading(false);
  };

  const wipeData = async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase.from('transactions').delete().eq('user_id', user.id);
    if (sourceToWipe !== 'all') query = query.eq('source', sourceToWipe);
    const { error } = await query;
    if (!error && sourceToWipe === 'all') await supabase.from('snapshots').delete().eq('user_id', user.id);
    setConfirmWipe(false);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Customize your finance tracking rules.</p>
      </div>

      {message && (
        <div className={cn("p-4 rounded-md text-sm font-medium border", message.type === 'success' ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200")}>
          {message.text}
        </div>
      )}

      {/* Category Mappings Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Tag className="mr-2 h-5 w-5 text-indigo-600" />
            Category Auto-Matching
          </h2>
          <p className="text-sm text-gray-500 mt-1">Map keywords in descriptions to specific budget categories.</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
            <input 
              placeholder="Keyword (e.g. Netflix)" 
              className="rounded-md border-gray-300 p-2 text-sm border"
              value={newMapping.keyword}
              onChange={e => setNewMapping({...newMapping, keyword: e.target.value})}
            />
            <select 
              className="rounded-md border-gray-300 p-2 text-sm border"
              value={newMapping.category}
              onChange={e => setNewMapping({...newMapping, category: e.target.value})}
            >
              <option value="">Select Category...</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Uncategorized">Uncategorized</option>
            </select>
            <button 
              onClick={addMapping}
              className="bg-indigo-600 text-white rounded-md text-sm font-bold flex items-center justify-center hover:bg-indigo-700"
            >
              <Plus size={16} className="mr-1" /> Add Rule
            </button>
          </div>

          <div className="space-y-2">
            {Object.entries(mappings).map(([kw, cat]) => (
              <div key={kw} className="flex items-center justify-between p-3 border border-gray-50 rounded-lg hover:bg-gray-50/50">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">"{kw}"</span>
                  <ArrowRightLeft size={12} className="text-gray-300" />
                  <span className="text-sm font-bold text-indigo-600">{cat}</span>
                </div>
                <button onClick={() => removeMapping(kw)} className="text-gray-300 hover:text-red-600 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {Object.keys(mappings).length === 0 && <p className="text-sm text-gray-400 text-center py-4 italic">No mapping rules defined yet.</p>}
          </div>
        </div>
      </div>

      {/* Property Sections */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center"><Home className="mr-2 h-5 w-5 text-pink-600" /> Property Market Value</h2>
        </div>
        <div className="p-6 flex flex-col md:flex-row items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2 flex items-center"><Euro size={12} className="mr-1" /> Market Price</label>
            <input type="number" value={propertySettings.value} onChange={(e) => setPropertySettings({...propertySettings, value: parseFloat(e.target.value)})} className="w-full rounded-md border-gray-300 p-2 border" />
          </div>
          <button onClick={updatePropertyValue} className="px-6 py-2 bg-pink-600 text-white rounded-md font-medium hover:bg-pink-700 flex items-center"><Save size={16} className="mr-2" /> Update Value</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center"><Percent className="mr-2 h-5 w-5 text-indigo-600" /> Mortgage & Ownership</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">My Ownership %</label><input type="number" value={propertySettings.ownership} onChange={(e) => setPropertySettings({...propertySettings, ownership: parseFloat(e.target.value)})} className="w-full rounded-md border-gray-300 p-2 border" /></div>
            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Current Debt-Free %</label><input type="number" step="0.01" value={propertySettings.debtFree} onChange={(e) => setPropertySettings({...propertySettings, debtFree: parseFloat(e.target.value)})} className="w-full rounded-md border-gray-300 p-2 border" /></div>
          </div>
          <button onClick={updatePropertyEquity} className="w-full py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 flex items-center justify-center"><Save size={16} className="mr-2" /> Save Equity Data</button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
        <div className="p-6 border-b border-red-50 bg-red-50/50">
          <h2 className="text-lg font-semibold text-red-900 flex items-center"><AlertTriangle className="mr-2 h-5 w-5" /> Danger Zone</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="p-4 border border-red-100 rounded-lg bg-red-50/30 space-y-4">
            <h3 className="text-sm font-bold text-red-900 uppercase">Surgical Wipe</h3>
            <div className="flex flex-col md:flex-row gap-4">
              <select value={sourceToWipe} onChange={(e) => setSourceToWipe(e.target.value as any)} className="flex-1 rounded-md border-gray-300 p-2 border sm:text-sm">
                <option value="all">WIPE EVERYTHING</option>
                <option value="degiro">DEGIRO</option>
                <option value="abn_amro_checking">ABN AMRO Checking</option>
                <option value="abn_amro_savings">ABN AMRO Savings</option>
                <option value="trade_republic">Trade Republic</option>
              </select>
              {!confirmWipe ? <button onClick={() => setConfirmWipe(true)} className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700">Wipe Data</button> : <div className="flex items-center space-x-2"><button onClick={wipeData} className="bg-red-700 text-white px-3 py-1 rounded text-xs font-bold">YES</button><button onClick={() => setConfirmWipe(false)} className="bg-gray-200 px-3 py-1 rounded text-xs font-bold">NO</button></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { ArrowRightLeft } from 'lucide-react';
