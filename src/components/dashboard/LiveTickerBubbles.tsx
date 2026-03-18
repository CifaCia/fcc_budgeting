import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/currency';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Position } from '@/lib/usePortfolio';

interface LivePrice {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

export function LiveTickerBubbles({ positions }: { positions: Position[] }) {
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [loading, setLoading] = useState(false);

  const fetchPrices = async () => {
    // Only fetch for positions that have a ticker set
    const tickers = positions
      .filter(p => p.ticker && p.ticker !== 'CASH')
      .map(p => p.ticker);
    
    if (tickers.length === 0) return;
    
    setLoading(true);
    const newPrices: Record<string, LivePrice> = {};

    try {
      // Fetch from Yahoo Finance via a CORS proxy to bypass browser restrictions
      await Promise.all(tickers.map(async (ticker) => {
        try {
          const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`)}`);
          if (!res.ok) throw new Error('Proxy failed');
          const data = await res.json();
          const result = data.chart.result[0];
          const meta = result.meta;
          
          // Get the very last closed price from the indicators if available, otherwise regularMarketPrice
          const prices = result.indicators.quote[0].close || [];
          const latestCalculatedPrice = prices.filter((p: any) => p !== null).pop();
          const finalPrice = latestCalculatedPrice || meta.regularMarketPrice;

          newPrices[ticker] = {
            ticker,
            price: finalPrice,
            change: finalPrice - meta.previousClose,
            changePercent: ((finalPrice - meta.previousClose) / meta.previousClose) * 100
          };
        } catch (e) {
          console.warn(`Failed to fetch ${ticker} via proxy, trying direct...`, e);
          try {
            const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1m&range=1d`);
            const data = await res.json();
            const result = data.chart.result[0];
            const meta = result.meta;
            const prices = result.indicators.quote[0].close || [];
            const latestCalculatedPrice = prices.filter((p: any) => p !== null).pop();
            const finalPrice = latestCalculatedPrice || meta.regularMarketPrice;

            newPrices[ticker] = {
              ticker,
              price: finalPrice,
              change: finalPrice - meta.previousClose,
              changePercent: ((finalPrice - meta.previousClose) / meta.previousClose) * 100
            };
          } catch (e2) {
            console.error(`Full failure for ${ticker}`, e2);
          }
        }
      }));
      setLivePrices(newPrices);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    // Auto-refresh every 5 minutes if page is open
    const interval = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [positions.map(p => p.ticker).join(',')]);

  const activeHoldings = positions.filter(p => p.ticker && p.ticker !== 'CASH');

  if (activeHoldings.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-8 animate-fade-in">
      {activeHoldings.map((p) => {
        const live = livePrices[p.ticker];
        const totalValue = live ? live.price * p.shares : p.currentValue;
        
        return (
          <div 
            key={p.isin}
            className="group flex items-center gap-3 bg-card border border-white/5 rounded-2xl px-4 py-2 hover:border-accent/30 transition-all hover:shadow-[0_0_20px_rgba(0,229,195,0.05)]"
          >
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold text-accent">{p.ticker}</span>
                {live && (
                  <span className={cn(
                    "text-[9px] font-mono font-bold",
                    live.change >= 0 ? "text-accent" : "text-destructive"
                  )}>
                    {live.change >= 0 ? '+' : ''}{live.changePercent.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono font-bold">
                  {live ? formatCurrency(live.price) : formatCurrency(p.currentPrice)}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  × {p.shares.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </div>
            </div>
            
            <div className="h-8 w-px bg-white/5 mx-1" />
            
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">Holding</span>
              <span className="text-sm font-mono font-bold text-foreground">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </div>
        );
      })}
      
      <button 
        onClick={() => fetchPrices()}
        disabled={loading}
        className="p-2 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
      >
        <RefreshCw size={14} className={cn(loading && "animate-spin text-accent")} />
      </button>
    </div>
  );
}