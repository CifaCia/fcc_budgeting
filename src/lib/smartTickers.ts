import { supabase } from './supabase';

const SMART_MAPPINGS = [
  { isin: 'IE00BK5BQT80', ticker: 'VWCE.AS', name: 'Vanguard FTSE All-World' },
  { isin: 'IE00B4L5Y983', ticker: 'IWDA.AS', name: 'iShares Core MSCI World' },
  { isin: 'IE00BKM4GZ66', ticker: 'EMIM.AS', name: 'iShares Core MSCI EM IMI' }
];

export async function applySmartTickers(userId: string) {
  const upserts = SMART_MAPPINGS.map(m => ({
    user_id: userId,
    isin: m.isin,
    ticker: m.ticker,
    name: m.name,
    price: 0, // Will be updated by live fetch
    price_date: new Date().toISOString().split('T')[0]
  }));

  const { error } = await supabase
    .from('portfolio_prices')
    .upsert(upserts, { onConflict: 'user_id,isin' });

  return { success: !error, error };
}
