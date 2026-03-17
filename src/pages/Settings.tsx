import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, Home, Percent, Euro, Save, Tag, Plus, Trash2, Mail, Calendar, Bell, Send, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CSVSource } from '@/lib/csvParsers';

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [sourceToWipe, setSourceToWipe] = useState<CSVSource | 'all'>('all');

  const [propertySettings, setPropertySettings] = useState({ value: 0, ownership: 50, debtFree: 0 });
  const [reminderSettings, setReminderSettings] = useState({ email: '', day: 1, enabled: false });
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
        setReminderSettings({
          email: settings.reminder_email || user.email || '',
          day: settings.reminder_day_of_month || 1,
          enabled: settings.reminders_enabled || false,
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

  const updateReminderSettings = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      reminder_email: reminderSettings.email,
      reminder_day_of_month: reminderSettings.day,
      reminders_enabled: reminderSettings.enabled,
    }, { onConflict: 'user_id' });
    if (!error) setMessage({ type: 'success', text: 'Reminder settings updated.' });
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
    <div className="max-w-3xl mx-auto space-y-8 pb-32 animate-fade-in">
      <header>
        <h1 className="text-3xl font-display font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground text-sm font-medium">Fine-tune your financial engine.</p>
      </header>

      {message && (
        <div className={cn(
          "p-4 rounded-2xl text-xs font-mono font-bold tracking-tight border animate-slide-up",
          message.type === 'success' ? "bg-accent/10 text-accent border-accent/20" : "bg-destructive/10 text-destructive border-destructive/20"
        )}>
          {message.text.toUpperCase()}
        </div>
      )}

      {/* Category Mappings */}
      <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Tag size={18} className="text-accent" />
            <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Auto-Matching</h2>
          </div>
        </div>
        <div className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input 
              placeholder="Keyword (e.g. Netflix)" 
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-accent focus:border-accent text-foreground"
              value={newMapping.keyword}
              onChange={e => setNewMapping({...newMapping, keyword: e.target.value})}
            />
            <select 
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-accent focus:border-accent text-foreground"
              value={newMapping.category}
              onChange={e => setNewMapping({...newMapping, category: e.target.value})}
            >
              <option value="">Category...</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="Uncategorized">Uncategorized</option>
            </select>
            <button onClick={addMapping} className="bg-accent text-black rounded-xl font-mono font-bold text-xs uppercase tracking-widest hover:scale-[1.02] transition-transform h-12">
              Add Rule
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(mappings).map(([kw, cat]) => (
              <div key={kw} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl group animate-fade-in">
                <div className="flex items-center gap-6">
                  <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">"{kw}"</span>
                  <ArrowRightLeft size={12} className="text-white/20" />
                  <span className="text-xs font-bold text-accent uppercase tracking-tight">{cat}</span>
                </div>
                <button onClick={() => removeMapping(kw)} className="text-white/20 hover:text-destructive transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {Object.keys(mappings).length === 0 && <p className="text-xs text-muted-foreground font-mono italic text-center py-4">No mapping rules defined yet.</p>}
          </div>
        </div>
      </section>

      {/* Real Estate */}
      <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <Home size={18} className="text-blue-400" />
          <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Real Estate</h2>
        </div>
        <div className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Market Value</label>
              <div className="flex items-center gap-3">
                <input type="number" value={propertySettings.value} onChange={(e) => setPropertySettings({...propertySettings, value: parseFloat(e.target.value)})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 w-full font-mono text-sm focus:ring-accent" />
                <button onClick={updatePropertyValue} className="p-3 bg-white/5 border border-white/10 rounded-xl hover:text-accent transition-colors"><Save size={20} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Ownership %</label>
                <input type="number" value={propertySettings.ownership} onChange={(e) => setPropertySettings({...propertySettings, ownership: parseFloat(e.target.value)})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 w-full font-mono text-sm focus:ring-accent" />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Debt-Free %</label>
                <input type="number" step="0.01" value={propertySettings.debtFree} onChange={(e) => setPropertySettings({...propertySettings, debtFree: parseFloat(e.target.value)})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 w-full font-mono text-sm focus:ring-accent" />
              </div>
            </div>
          </div>
          <button onClick={updatePropertyEquity} className="w-full h-12 bg-blue-400 text-black rounded-xl font-mono font-bold text-xs uppercase tracking-widest">
            Sync Equity State
          </button>
        </div>
      </section>

      {/* Reminders */}
      <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <Bell size={18} className="text-amber-500" />
          <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Notification Engine</h2>
        </div>
        <div className="p-6 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Reminder Email</label>
              <input type="email" value={reminderSettings.email} onChange={(e) => setReminderSettings({...reminderSettings, email: e.target.value})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 w-full font-mono text-sm focus:ring-accent" />
            </div>
            <div className="space-y-3">
              <label className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">Scheduled Day</label>
              <select value={reminderSettings.day} onChange={(e) => setReminderSettings({...reminderSettings, day: parseInt(e.target.value)})} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 w-full font-mono text-sm focus:ring-accent">
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d} className="bg-black text-white">{d}</option>)}
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
            <div className="flex items-center gap-4">
              <button onClick={() => setReminderSettings({...reminderSettings, enabled: !reminderSettings.enabled})} className={cn("w-10 h-5 rounded-full transition-colors relative", reminderSettings.enabled ? "bg-accent" : "bg-white/10")}>
                <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", reminderSettings.enabled ? "right-1" : "left-1")} />
              </button>
              <span className="text-xs font-bold text-foreground uppercase tracking-tight">Active Reminders</span>
            </div>
            <button className="text-[10px] font-mono font-bold text-accent uppercase tracking-widest">Test Pulse</button>
          </div>
          
          <button onClick={updateReminderSettings} className="w-full h-12 bg-accent text-black rounded-xl font-mono font-bold text-xs uppercase tracking-widest">
            Lock Configuration
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-destructive/5 rounded-2xl border border-destructive/10 overflow-hidden">
        <div className="p-6 border-b border-destructive/10 flex items-center gap-3">
          <ShieldAlert size={18} className="text-destructive" />
          <h2 className="text-sm font-display font-semibold uppercase tracking-widest text-destructive">Danger Zone</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <select value={sourceToWipe} onChange={(e) => setSourceToWipe(e.target.value as any)} className="bg-white/5 border border-destructive/20 rounded-xl px-4 py-3 flex-1 font-mono text-xs text-destructive focus:ring-destructive">
              <option value="all" className="bg-black">ERASE ENTIRE SYSTEM</option>
              <option value="degiro" className="bg-black">WIPE DEGIRO ONLY</option>
              <option value="abn_amro_checking" className="bg-black">WIPE ABN AMRO ONLY</option>
              <option value="trade_republic" className="bg-black">WIPE TRADE REPUBLIC ONLY</option>
            </select>
            {!confirmWipe ? (
              <button onClick={() => setConfirmWipe(true)} className="bg-destructive text-white rounded-xl px-8 h-12 font-mono font-bold text-xs uppercase tracking-widest hover:bg-destructive/80 transition-colors">
                Initialize Wipe
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={wipeData} className="bg-destructive text-white rounded-xl px-6 h-12 font-mono font-bold text-xs uppercase">YES, DELETE</button>
                <button onClick={() => setConfirmWipe(false)} className="bg-white/5 text-foreground rounded-xl px-6 h-12 font-mono font-bold text-xs uppercase">ABORT</button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
