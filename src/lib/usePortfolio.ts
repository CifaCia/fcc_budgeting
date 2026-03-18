import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { convertToEUR } from '@/lib/currency';
import { parseHoldingsFromRaw, Holding } from '@/lib/csvParsers';

export interface PortfolioPrice {
  isin: string;
  ticker: string | null;
  name: string | null;
  price: number;
  currency: string;
  price_date: string;
  geography: string | null;
  sector: string | null;
}

export interface Position extends Holding {
  currentPrice: number;
  priceDate: string;
  ticker: string;
  geography: string;
  sector: string;
  currentValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  isStale: boolean;
}

export function usePortfolio() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, PortfolioPrice>>({});

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const { data: transData } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });
    
    const { data: priceData } = await supabase
      .from('portfolio_prices')
      .select('*')
      .eq('user_id', user.id);

    setTransactions(transData || []);
    
    const priceMap: Record<string, PortfolioPrice> = {};
    (priceData || []).forEach(p => {
      priceMap[p.isin] = p;
    });
    setPrices(priceMap);
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const positions = useMemo(() => {
    const holdingsMap: Record<string, any> = {};
    const cashBySource: Record<string, number> = {};

    transactions.forEach(t => {
      const source = t.source;
      if (!cashBySource[source]) cashBySource[source] = 0;

      const info = parseHoldingsFromRaw(source, t.raw_csv_row);
      
      if (!info) {
        // Cash transaction (no ISIN)
        cashBySource[source] += convertToEUR(t.amount, t.currency);
        return;
      }

      const isin = info.isin;
      if (!holdingsMap[isin]) {
        holdingsMap[isin] = {
          isin,
          name: info.name,
          source: t.source,
          shares: 0,
          costBasis: 0,
          assetType: t.asset_type || 'other',
        };
      }

      const pos = holdingsMap[isin];
      const isBuy = t.amount > 0;
      const qty = Math.abs(info.quantity);
      
      if (isBuy) {
        pos.shares += qty;
        pos.costBasis += Math.abs(t.amount);
      } else {
        const sellRatio = qty / pos.shares;
        pos.costBasis -= pos.costBasis * (pos.shares > 0 ? sellRatio : 0);
        pos.shares -= qty;
      }
    });

    const result = Object.values(holdingsMap)
      .filter((p: any) => p.shares > 0.0001)
      .map((p: any) => {
        const priceInfo = prices[p.isin];
        const currentPrice = priceInfo?.price || 0;
        const avgCost = p.costBasis / p.shares;
        const currentValue = p.shares * currentPrice;
        const unrealizedPL = currentValue - p.costBasis;
        const unrealizedPLPercent = p.costBasis > 0 ? (unrealizedPL / p.costBasis) * 100 : 0;
        const priceDate = priceInfo?.price_date || '';
        const isStale = priceDate ? (new Date().getTime() - new Date(priceDate).getTime()) > 7 * 24 * 60 * 60 * 1000 : true;

        return {
          ...p,
          avgCost,
          currentPrice,
          currentValue,
          unrealizedPL,
          unrealizedPLPercent,
          priceDate,
          isStale,
          ticker: priceInfo?.ticker || '',
          geography: priceInfo?.geography || '',
          sector: priceInfo?.sector || '',
        };
      });

    return { positions: result, cashBySource };
  }, [transactions, prices]);

  const totalPortfolioValue = useMemo(() => 
    positions.positions.reduce((sum, p) => sum + p.currentValue, 0)
  , [positions]);

  const cashTotal = useMemo(() => 
    Object.values(positions.cashBySource).reduce((sum, val) => sum + val, 0)
  , [positions]);

  const hasPricesForAll = useMemo(() => 
    positions.positions.length > 0 && positions.positions.every(p => p.currentPrice > 0)
  , [positions]);

  return { 
    loading, 
    positions: positions.positions, 
    cashBySource: positions.cashBySource,
    cashTotal,
    totalPortfolioValue,
    hasPricesForAll,
    refresh: fetchData 
  };
}