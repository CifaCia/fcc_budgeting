import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, convertToEUR } from '@/lib/currency';
import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber';
import { 
  TrendingUp, Target, Calendar, 
  Trash2,
  Landmark, PieChart as PieChartIcon, 
  Plus, Plane, Skull, ArrowUpRight
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { cn } from '@/lib/utils';

interface FIREContribution {
  id: string;
  label: string;
  monthly_amount: number;
  from_date: string; // YYYY-MM
  to_date: string | null; // YYYY-MM or null = open-ended
}

interface SimulationDataPoint {
  year: number;
  date: string;
  netWorth: number;
  netWorthOptimistic: number;
  netWorthPessimistic: number;
  netWorthNoTax: number;
  annualContribution: number;
  cumulativeContributions: number;
  annualWithdrawal: number;
  box3TaxThisYear: number;
  withdrawalTaxThisYear: number;
  cumulativeBox3Tax: number;
}

interface FIREResult {
  reached: boolean;
  date: string | null;
  years: number | null;
  data: SimulationDataPoint[];
  target: number;
  totalBox3Paid: number;
  noTaxYears: number | null;
}

export default function FIRE() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // UI States
  const [showAdvancedBox3, setShowAdvancedBox3] = useState(false);

  // Core Inputs
  const [cashBalanceOverride, setCashBalanceOverride] = useState<number | null>(null);
  const [etfBalanceOverride, setEtfBalanceOverride] = useState<number | null>(null);
  const [latestCash, setLatestCash] = useState(0);
  const [latestEtf, setLatestEtf] = useState(0);
  
  const [annualExpenses, setAnnualExpenses] = useState(0);
  const [nominalReturn, setNominalReturn] = useState(0.07); // This is for ETFs
  const [cashInterestRate, setCashInterestRate] = useState(0.015);
  const [inflationRate, setInflationRate] = useState(0.02);
  const [multiplier, setMultiplier] = useState(25);
  const [fireMode, setFireMode] = useState<'multiplier' | 'withdrawal'>('multiplier');
  const [withdrawalRate, setWithdrawalRate] = useState(0.04);
  const [forcedRetirementYear, setForcedRetirementYear] = useState<number | null>(null);
  const [deathYear, setDeathYear] = useState<number | null>(2086);

  const [moveAbroadEnabled, setMoveAbroadEnabled] = useState(false);
  const [moveAbroadYear, setMoveAbroadYear] = useState<number>(2035);
  const [moveAbroadTaxRate, setMoveAbroadTaxRate] = useState(0.30);
  
  // Contribution Schedule
  const [contributions, setContributions] = useState<FIREContribution[]>([]);
  const [growthEnabled, setGrowthEnabled] = useState(false);
  const [growthRate, setGrowthRate] = useState(0.02);

  // Box 3 Wealth Tax
  const [box3Enabled, setBox3Enabled] = useState(false);
  const [box3Model, setBox3Model] = useState<'bridging' | 'new'>('new');
  const [box3StartYear, setBox3StartYear] = useState(2028);
  const [box3FiscalPartner, setBox3FiscalPartner] = useState(false);
  const [box3Threshold, setBox3Threshold] = useState(57000);
  const [box3ReturnAllowance, setBox3ReturnAllowance] = useState(1800);
  const [box3DividendYield, setBox3DividendYield] = useState(0.07);
  const [box3TaxRate, setBox3TaxRate] = useState(0.36);

  // Persistence State
  const [saving, setSaving] = useState(false);

  // Sync Box 3 yield with nominal return
  useEffect(() => {
    if (nominalReturn !== box3DividendYield) {
       setBox3DividendYield(nominalReturn);
    }
  }, [nominalReturn]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: transData } = await supabase
      .from('transactions')
      .select('amount, currency, asset_type')
      .neq('asset_type', 'property');
    
    let liveCash = 0;
    let liveEtfStock = 0;
    
    if (transData) {
      transData.forEach(t => {
        const amountEUR = convertToEUR(t.amount, t.currency);
        const type = t.asset_type || 'other';
        if (type === 'cash') {
          liveCash += amountEUR;
        } else if (type === 'etf' || type === 'stock') {
          liveEtfStock += amountEUR;
        }
      });
      setLatestCash(liveCash);
      setLatestEtf(liveEtfStock);
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: budgetItems } = await supabase
      .from('budget_items')
      .select('expected_monthly')
      .eq('user_id', user.id);
    
    const budgetTotalMonthly = (budgetItems || []).reduce((sum, item) => sum + (Number(item.expected_monthly) || 0), 0);

    if (settings) {
      if (settings.fire_cash_balance != null) setCashBalanceOverride(Number(settings.fire_cash_balance));
      if (settings.fire_etf_balance != null) setEtfBalanceOverride(Number(settings.fire_etf_balance));
      if (settings.fire_cash_interest_rate != null) setCashInterestRate(Number(settings.fire_cash_interest_rate));
      
      if (settings.fire_monthly_expenses != null && Number(settings.fire_monthly_expenses) > 0) {
        setAnnualExpenses(Number(settings.fire_monthly_expenses) * 12);
      } else if (budgetTotalMonthly > 0) {
        setAnnualExpenses(budgetTotalMonthly * 12);
      } else {
        setAnnualExpenses(3000 * 12);
      }

      if (settings.fire_return_rate != null) {
        const rate = Number(settings.fire_return_rate);
        setNominalReturn(rate);
        if (settings.fire_box3_dividend_yield == null) setBox3DividendYield(rate);
      }
      if (settings.fire_inflation_rate != null) setInflationRate(Number(settings.fire_inflation_rate));
      if (settings.fire_target_multiplier != null) setMultiplier(Number(settings.fire_target_multiplier));
      if (settings.fire_mode != null) setFireMode(settings.fire_mode as 'multiplier' | 'withdrawal');
      if (settings.fire_withdrawal_rate != null) setWithdrawalRate(Number(settings.fire_withdrawal_rate));
      if (settings.fire_forced_retirement_year != null) setForcedRetirementYear(Number(settings.fire_forced_retirement_year));
      if (settings.fire_death_year != null) setDeathYear(Number(settings.fire_death_year));
      if (settings.fire_move_abroad_enabled != null) setMoveAbroadEnabled(Boolean(settings.fire_move_abroad_enabled));
      if (settings.fire_move_abroad_year != null) setMoveAbroadYear(Number(settings.fire_move_abroad_year));
      if (settings.fire_move_abroad_tax_rate != null) setMoveAbroadTaxRate(Number(settings.fire_move_abroad_tax_rate));

      if (settings.fire_contributions) setContributions(settings.fire_contributions as FIREContribution[]);
      if (settings.fire_contribution_growth_enabled != null) setGrowthEnabled(Boolean(settings.fire_contribution_growth_enabled));
      if (settings.fire_contribution_growth_rate != null) setGrowthRate(Number(settings.fire_contribution_growth_rate));
      
      if (settings.fire_box3_enabled != null) setBox3Enabled(Boolean(settings.fire_box3_enabled));
      if (settings.fire_box3_model != null) setBox3Model(settings.fire_box3_model as 'bridging' | 'new');
      if (settings.fire_box3_start_year != null) setBox3StartYear(Number(settings.fire_box3_start_year));
      if (settings.fire_box3_fiscal_partner != null) setBox3FiscalPartner(Boolean(settings.fire_box3_fiscal_partner));
      if (settings.fire_box3_threshold != null) setBox3Threshold(Number(settings.fire_box3_threshold));
      if (settings.fire_box3_return_allowance != null) setBox3ReturnAllowance(Number(settings.fire_box3_return_allowance));
      if (settings.fire_box3_dividend_yield != null) setBox3DividendYield(Number(settings.fire_box3_dividend_yield));
      if (settings.fire_box3_tax_rate != null) setBox3TaxRate(Number(settings.fire_box3_tax_rate));
    } else {
      if (budgetTotalMonthly > 0) setAnnualExpenses(budgetTotalMonthly * 12);
      else setAnnualExpenses(3000 * 12);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loading || !user) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      await supabase.from('user_settings').upsert({
        user_id: user.id,
        fire_cash_balance: cashBalanceOverride,
        fire_etf_balance: etfBalanceOverride,
        fire_cash_interest_rate: cashInterestRate,
        fire_monthly_expenses: (annualExpenses || 0) / 12,
        fire_return_rate: nominalReturn ?? 0,
        fire_inflation_rate: inflationRate ?? 0,
        fire_target_multiplier: multiplier ?? 25,
        fire_mode: fireMode,
        fire_withdrawal_rate: withdrawalRate ?? 0.04,
        fire_forced_retirement_year: forcedRetirementYear,
        fire_death_year: deathYear,
        fire_move_abroad_enabled: moveAbroadEnabled,
        fire_move_abroad_year: moveAbroadYear ?? 2035,
        fire_move_abroad_tax_rate: moveAbroadTaxRate ?? 0.30,
        fire_contributions: contributions || [],
        fire_contribution_growth_enabled: growthEnabled,
        fire_contribution_growth_rate: growthRate ?? 0,
        fire_box3_enabled: box3Enabled,
        fire_box3_model: box3Model,
        fire_box3_start_year: box3StartYear ?? 2028,
        fire_box3_fiscal_partner: box3FiscalPartner,
        fire_box3_threshold: box3Threshold ?? 57000,
        fire_box3_return_allowance: box3ReturnAllowance ?? 1800,
        fire_box3_dividend_yield: box3DividendYield ?? 0.015,
        fire_box3_tax_rate: box3TaxRate ?? 0.36
      }, { onConflict: 'user_id' });
      setSaving(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    user, loading, cashBalanceOverride, etfBalanceOverride, cashInterestRate, 
    annualExpenses, nominalReturn, inflationRate, multiplier, contributions, 
    growthEnabled, growthRate, box3Enabled, box3Model, box3StartYear, 
    box3FiscalPartner, box3Threshold, box3ReturnAllowance, box3DividendYield, box3TaxRate, fireMode, withdrawalRate, forcedRetirementYear, deathYear,
    moveAbroadEnabled, moveAbroadYear, moveAbroadTaxRate
  ]);

  const realEtfReturnRate = useMemo(() => {
    const inf = (inflationRate || 0);
    return ((1 + (nominalReturn || 0)) / (1 + inf)) - 1;
  }, [nominalReturn, inflationRate]);
  const realCashReturnRate = useMemo(() => {
    const inf = (inflationRate || 0);
    return ((1 + (cashInterestRate || 0)) / (1 + inf)) - 1;
  }, [cashInterestRate, inflationRate]);
  
  const currentCash = cashBalanceOverride != null ? cashBalanceOverride : latestCash;
  const currentEtf = etfBalanceOverride != null ? etfBalanceOverride : latestEtf;
  const currentNetWorth = currentCash + currentEtf;

  const effectiveMultiplier = useMemo(() => {
    if (fireMode === 'withdrawal') {
      const swr = withdrawalRate || 0.04;
      return swr > 0 ? 1 / swr : 1000;
    }
    return multiplier || 25;
  }, [fireMode, multiplier, withdrawalRate]);

  const fireTarget = (annualExpenses || 0) * effectiveMultiplier;

  const runSimulation = useCallback((targetMultiplier: number): FIREResult => {
    const target = (annualExpenses || 0) * (targetMultiplier || 25);
    const mrrEtf = Math.pow(1 + (realEtfReturnRate || 0), 1/12) - 1;
    const mrrEtfOpt = Math.pow(1 + (realEtfReturnRate || 0) + 0.01, 1/12) - 1;
    const mrrEtfPess = Math.pow(1 + (realEtfReturnRate || 0) - 0.01, 1/12) - 1;
    const mrrCash = Math.pow(1 + (realCashReturnRate || 0), 1/12) - 1;

    let csh = currentCash; let etf = currentEtf;
    let cshNoTax = currentCash; let etfNoTax = currentEtf;
    let cshOpt = currentCash; let etfOpt = currentEtf;
    let cshPess = currentCash; let etfPess = currentEtf;
    
    let totalBox3Paid = 0; let totalContributions = 0;
    const dataPoints: SimulationDataPoint[] = [];
    const startDate = new Date(); startDate.setDate(1);

    let reachedDate: string | null = null;
    let reachedYears: number | null = null;
    let noTaxReachedYears: number | null = null;
    let valueAtMove = 0; let hasMoved = false;

    // Simulation for 60 years or until death
    const currentYearSimStart = new Date().getFullYear();
    const maxYears = deathYear ? Math.max(1, deathYear - currentYearSimStart) : 60;

    for (let year = 0; year <= maxYears; year++) {
      let annualContribution = 0; let annualWithdrawal = 0; let withdrawalTaxThisYear = 0;
      const cshStartOfYear = csh; const etfStartOfYear = etf;
      
      for (let month = 0; month < 12; month++) {
        const currentMonthDate = new Date(startDate);
        currentMonthDate.setMonth(startDate.getMonth() + (year * 12) + month);
        const dateStr = currentMonthDate.toISOString().slice(0, 7);
        const currentYearSim = currentMonthDate.getFullYear();
        
        if (deathYear && currentYearSim > deathYear) break;

        const isRetiredPreCheck = (forcedRetirementYear != null && currentYearSim >= forcedRetirementYear) || reachedDate !== null;
        const isAbroadActive = moveAbroadEnabled && currentYearSim >= moveAbroadYear;

        if (isAbroadActive && !hasMoved) { valueAtMove = csh + etf; hasMoved = true; }

        let monthlyContrib = 0;
        contributions.forEach(c => {
          if (dateStr >= c.from_date && (!c.to_date || dateStr <= c.to_date)) {
            if (!c.to_date && isRetiredPreCheck) return; 
            let amount = c.monthly_amount || 0;
            if (growthEnabled) {
              const fromDate = new Date(c.from_date + '-01');
              const yearsDiff = Math.max(0, currentMonthDate.getFullYear() - fromDate.getFullYear());
              amount *= Math.pow(1 + (growthRate || 0), yearsDiff);
            }
            monthlyContrib += amount;
          }
        });

        csh = csh * (1 + mrrCash); etf = etf * (1 + mrrEtf) + monthlyContrib;
        cshNoTax = cshNoTax * (1 + mrrCash); etfNoTax = etfNoTax * (1 + mrrEtf) + monthlyContrib;
        cshOpt = cshOpt * (1 + mrrCash); etfOpt = etfOpt * (1 + mrrEtfOpt) + monthlyContrib;
        cshPess = cshPess * (1 + mrrCash); etfPess = etfPess * (1 + mrrEtfPess) + monthlyContrib;

        if (!reachedDate) {
          const nwBeforeExpensesNoTax = cshNoTax + etfNoTax;
          if (nwBeforeExpensesNoTax >= target && !noTaxReachedYears) noTaxReachedYears = year + (month + 1) / 12;
          if ((csh + etf) >= target) {
            reachedDate = currentMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            reachedYears = year + (month + 1) / 12;
          }
        }

        const isRetiredNow = (forcedRetirementYear != null && currentYearSim >= forcedRetirementYear) || reachedDate !== null;
        if (isRetiredNow) {
          let monthlyExpenses = (annualExpenses / 12);
          if (isAbroadActive) {
            const currentTotal = csh + etf;
            const totalProfit = Math.max(0, currentTotal - valueAtMove);
            const profitRatio = currentTotal > 0 ? totalProfit / currentTotal : 0;
            monthlyExpenses = (annualExpenses / 12) / (1 - (profitRatio * moveAbroadTaxRate));
            withdrawalTaxThisYear += (monthlyExpenses - (annualExpenses / 12));
          }
          annualWithdrawal += (annualExpenses / 12);
          etf -= monthlyExpenses; etfOpt -= monthlyExpenses; etfPess -= monthlyExpenses; etfNoTax -= (annualExpenses / 12);
        }

        if (etf < 0) { csh += etf; etf = 0; } if (csh < 0) csh = 0;
        if (etfOpt < 0) { cshOpt += etfOpt; etfOpt = 0; } if (cshOpt < 0) cshOpt = 0;
        if (etfPess < 0) { cshPess += etfPess; etfPess = 0; } if (cshPess < 0) cshPess = 0;
        if (etfNoTax < 0) { cshNoTax += etfNoTax; etfNoTax = 0; } if (cshNoTax < 0) cshNoTax = 0;
        annualContribution += monthlyContrib;
      }

      let box3TaxThisYear = 0;
      const currentYearSimEnd = startDate.getFullYear() + year;
      const isAbroadEnd = moveAbroadEnabled && currentYearSimEnd >= moveAbroadYear;
      if (box3Enabled && currentYearSimEnd >= (box3StartYear || 2028) && !isAbroadEnd) {
        const nomRet = (cshStartOfYear * (cashInterestRate || 0)) + (etfStartOfYear * (nominalReturn || 0));
        const allow = box3FiscalPartner ? (box3ReturnAllowance || 1800) * 2 : (box3ReturnAllowance || 1800);
        box3TaxThisYear = Math.max(0, nomRet - allow) * (box3TaxRate || 0.36);
        const totalNW = csh + etf;
        if (totalNW > 0) {
          const cw = csh / totalNW; const ew = etf / totalNW;
          csh -= box3TaxThisYear * cw; etf -= box3TaxThisYear * ew;
          cshOpt -= box3TaxThisYear * cw; etfOpt -= box3TaxThisYear * ew;
          cshPess -= box3TaxThisYear * cw; etfPess -= box3TaxThisYear * ew;
        }
        totalBox3Paid += box3TaxThisYear;
      }
      totalContributions += annualContribution;
      dataPoints.push({
        year, date: currentYearSimEnd.toString(), netWorth: csh + etf,
        netWorthOptimistic: cshOpt + etfOpt, netWorthPessimistic: cshPess + etfPess,
        netWorthNoTax: cshNoTax + etfNoTax, annualContribution,
        cumulativeContributions: totalContributions, annualWithdrawal,
        box3TaxThisYear, withdrawalTaxThisYear, cumulativeBox3Tax: totalBox3Paid
      });
      if (year === maxYears) break;
    }
    return { reached: reachedDate != null, date: reachedDate, years: reachedYears, data: dataPoints, target, totalBox3Paid, noTaxYears: noTaxReachedYears };
  }, [annualExpenses, realEtfReturnRate, realCashReturnRate, currentCash, currentEtf, contributions, growthEnabled, growthRate, box3Enabled, box3Model, box3StartYear, box3FiscalPartner, box3Threshold, box3ReturnAllowance, box3DividendYield, box3TaxRate, forcedRetirementYear, moveAbroadEnabled, moveAbroadYear, moveAbroadTaxRate, deathYear, nominalReturn, cashInterestRate]);

  const baseResult = useMemo(() => runSimulation(effectiveMultiplier), [runSimulation, effectiveMultiplier]);
  const leanResult = useMemo(() => runSimulation(effectiveMultiplier * 0.7), [runSimulation, effectiveMultiplier]);
  const fatResult = useMemo(() => runSimulation(effectiveMultiplier * 1.5), [runSimulation, effectiveMultiplier]);
  const progressPercent = fireTarget > 0 ? Math.min(100, (currentNetWorth / fireTarget) * 100) : 0;

  // Helpers
  const addPeriod = () => {
    const today = new Date().toISOString().slice(0, 7);
    setContributions([...contributions, { id: crypto.randomUUID(), label: 'New Phase', monthly_amount: 1000, from_date: today, to_date: null }]);
  };
  const updatePeriod = (id: string, updates: Partial<FIREContribution>) => {
    setContributions(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };
  const deletePeriod = (id: string) => {
    setContributions(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
      <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-muted-foreground font-mono text-sm animate-pulse">Calculating Projections...</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-32 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">FIRE Strategy</h1>
          <p className="text-muted-foreground text-sm font-medium">Map your path to financial independence.</p>
        </div>
        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-full border border-white/10">
          <div className={cn("w-2 h-2 rounded-full", saving ? "bg-amber-500 animate-pulse" : "bg-accent")} />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {saving ? 'Syncing...' : 'Strategy Locked'}
          </span>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'FIRE Target', value: fireTarget, icon: Target, color: 'text-accent', sub: `${effectiveMultiplier.toFixed(0)}x annual spend` },
          { label: 'Projected Date', value: baseResult.date || '60y+', icon: Calendar, color: 'text-blue-400', sub: baseResult.reached ? `${baseResult.years?.toFixed(1)} years to go` : 'Target not met' },
          { label: 'Progress', value: `${progressPercent.toFixed(1)}%`, icon: PieChartIcon, color: 'text-amber-500', sub: formatCurrency(currentNetWorth) },
          { label: 'Lifetime Tax', value: baseResult.totalBox3Paid, icon: Landmark, color: 'text-destructive', sub: 'Estimated Box 3 drag' },
        ].map((card, i) => (
          <div key={i} className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center gap-2 mb-4">
              <card.icon size={14} className={card.color} />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{card.label}</span>
            </div>
            <div className="text-2xl font-mono font-bold">
              {typeof card.value === 'number' ? <AnimatedNumber value={card.value} formatter={formatCurrency} /> : card.value}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-medium uppercase tracking-tighter">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Projections Chart */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-card p-6 rounded-2xl border-t border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Capital Projection</h3>
              {growthEnabled && (
                <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-1 rounded border border-accent/20 flex items-center">
                  <ArrowUpRight size={12} className="mr-1" /> Contributions +{(growthRate*100).toFixed(1)}%/yr
                </span>
              )}
            </div>
            <div className="h-[45vh] w-full min-h-[400px] touch-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={baseResult.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5C3" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#00E5C3" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="fireGradNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#555', fontFamily: 'DM Mono' }} interval={Math.floor(baseResult.data.length / 6)} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#555', fontFamily: 'DM Mono' }} tickFormatter={(v) => v >= 1000000 ? `€${(v/1000000).toFixed(1)}M` : `€${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    trigger="click"
                    contentStyle={{ backgroundColor: '#0A0A0A', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono' }}
                    itemStyle={{ fontSize: '12px' }}
                    formatter={(val: any, name: any) => {
                      if (name === 'netWorth') return [formatCurrency(val), 'Net Worth (Taxed)'];
                      if (name === 'netWorthNoTax') return [formatCurrency(val), 'Net Worth (No Tax)'];
                      if (name === 'cumulativeContributions') return [formatCurrency(val), 'Principal'];
                      return [formatCurrency(val), name];
                    }}
                  />
                  
                  {/* Variance Bands */}
                  <Area type="monotone" dataKey="netWorthOptimistic" stroke="none" fill="#00E5C3" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="netWorthPessimistic" stroke="none" fill="#00E5C3" fillOpacity={0.1} />

                  {/* Principal */}
                  <Area type="monotone" dataKey="cumulativeContributions" stroke="#10B981" strokeWidth={2} fillOpacity={0.1} fill="#10B981" />

                  {/* Primary Line */}
                  <Area 
                    type="monotone" 
                    dataKey="netWorth" 
                    stroke={baseResult.data.length > 0 && baseResult.data[baseResult.data.length - 1].netWorth <= 0 ? "#EF4444" : "#00E5C3"} 
                    strokeWidth={3} 
                    fillOpacity={1} 
                    fill={baseResult.data.length > 0 && baseResult.data[baseResult.data.length - 1].netWorth <= 0 ? "url(#fireGradNegative)" : "url(#fireGrad)"} 
                    animationDuration={1000} 
                    isAnimationActive={true} 
                  />

                  <ReferenceLine y={fireTarget} stroke="#F59E0B" strokeDasharray="6 6" label={{ value: 'FIRE', position: 'insideTopRight', fill: '#F59E0B', fontSize: 10, fontWeight: 'bold', fontFamily: 'DM Mono' }} />
                  {baseResult.reached && (
                    <ReferenceLine x={baseResult.data[Math.floor(baseResult.years || 0)]?.date} stroke="#00E5C3" strokeDasharray="4 4" />
                  )}

                  {/* Contribution Areas */}
                  {contributions.map((c) => (
                    <ReferenceArea 
                      key={c.id}
                      x1={c.from_date.split('-')[0]}
                      x2={c.to_date ? c.to_date.split('-')[0] : (new Date().getFullYear() + 60).toString()}
                      fill="rgba(255,255,255,0.02)"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Schedule */}
          <section className="bg-card rounded-2xl border-t border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-display font-semibold uppercase tracking-widest text-muted-foreground">Contribution Periods</h3>
              <button onClick={addPeriod} className="text-xs font-mono text-accent bg-accent/10 px-3 py-1.5 rounded-full hover:bg-accent/20 transition-colors flex items-center gap-2">
                <Plus size={14} /> Add Phase
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <tbody className="divide-y divide-white/5">
                  {contributions.map((c) => (
                    <tr key={c.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="p-6">
                        <div className="flex flex-col gap-1">
                          <input 
                            value={c.label} 
                            onChange={(e) => updatePeriod(c.id, { label: e.target.value })}
                            className="bg-transparent border-none p-0 text-sm font-bold focus:ring-0 text-foreground"
                          />
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Label</span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col gap-1">
                          <input 
                            type="number"
                            value={c.monthly_amount} 
                            onChange={(e) => updatePeriod(c.id, { monthly_amount: parseFloat(e.target.value) || 0 })}
                            className="bg-transparent border-none p-0 text-sm font-mono font-bold focus:ring-0 text-accent"
                          />
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Monthly €</span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex flex-col gap-1">
                          <input type="month" value={c.from_date} onChange={(e) => updatePeriod(c.id, { from_date: e.target.value })} className="bg-transparent border-none p-0 text-[11px] font-mono focus:ring-0" />
                          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Start</span>
                        </div>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-1">
                            {c.to_date ? (
                              <input type="month" value={c.to_date} onChange={(e) => updatePeriod(c.id, { to_date: e.target.value })} className="bg-transparent border-none p-0 text-[11px] font-mono focus:ring-0" />
                            ) : (
                              <span className="text-[11px] font-mono text-muted-foreground italic">Retirement</span>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">End</span>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={!c.to_date} 
                            onChange={(e) => updatePeriod(c.id, { to_date: e.target.checked ? null : new Date().toISOString().slice(0, 7) })} 
                            className="accent-accent"
                          />
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <button onClick={() => deletePeriod(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-2">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sensitivity Variants */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Lean FIRE', res: leanResult, sub: '70% budget', color: 'text-accent/60' },
              { label: 'Regular', res: baseResult, sub: '100% budget', color: 'text-accent' },
              { label: 'Fat FIRE', res: fatResult, sub: '150% budget', color: 'text-amber-500' },
            ].map((v, i) => (
              <div key={i} className="bg-card p-6 rounded-2xl border-t border-white/5 animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                <h3 className={cn("text-[10px] font-mono uppercase tracking-widest mb-4", v.color)}>{v.label}</h3>
                <div className="text-xl font-mono font-bold">{formatCurrency(v.res.target)}</div>
                <p className="text-[10px] text-muted-foreground mt-1 mb-4 uppercase">{v.sub}</p>
                <div className="pt-4 border-t border-white/5 flex justify-between items-end">
                  <div className="text-sm font-bold font-mono">{v.res.date || '---'}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{v.res.years ? `${v.res.years.toFixed(1)}y` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div className="space-y-6">
          <section className="bg-card p-6 rounded-2xl border-t border-white/5 space-y-8">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground border-b border-white/5 pb-4">Assumptions</h3>
            
            <div className="space-y-6">
              {/* Core Inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Target Mode</label>
                  <select 
                    value={fireMode}
                    onChange={(e) => setFireMode(e.target.value as any)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:ring-accent"
                  >
                    <option value="multiplier">Multiplier</option>
                    <option value="withdrawal">SWR %</option>
                  </select>
                </div>
                {fireMode === 'multiplier' ? (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Multiplier</label>
                    <input 
                      type="number"
                      value={multiplier}
                      onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:ring-accent"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">SWR %</label>
                    <input 
                      type="number"
                      step="0.001"
                      value={withdrawalRate}
                      onChange={(e) => setWithdrawalRate(parseFloat(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:ring-accent"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Monthly Expenses</label>
                  <span className="text-sm font-mono font-bold">{formatCurrency(annualExpenses / 12)}</span>
                </div>
                <input 
                  type="range" min="500" max="10000" step="100"
                  value={annualExpenses / 12} 
                  onChange={(e) => setAnnualExpenses(parseFloat(e.target.value) * 12)}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Market Return</label>
                  <span className="text-sm font-mono font-bold text-accent">{(nominalReturn * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.15" step="0.001"
                  value={nominalReturn} 
                  onChange={(e) => setNominalReturn(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
                />
              </div>

              {/* Life Events Section */}
              <div className="pt-4 border-t border-white/5 space-y-4">
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground/60 tracking-widest">Life Events</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skull size={12} className="text-destructive/60" />
                      <label className="text-[10px] font-mono text-muted-foreground uppercase">Death Year</label>
                    </div>
                    <input 
                      type="number"
                      value={deathYear || ''}
                      placeholder="e.g. 2086"
                      onChange={(e) => setDeathYear(parseInt(e.target.value) || null)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:ring-accent"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-amber-500/60" />
                      <label className="text-[10px] font-mono text-muted-foreground uppercase">Retire Year</label>
                    </div>
                    <input 
                      type="number"
                      value={forcedRetirementYear || ''}
                      placeholder="e.g. 2050"
                      onChange={(e) => setForcedRetirementYear(parseInt(e.target.value) || null)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:ring-accent"
                    />
                  </div>
                </div>

                {/* Move Abroad Toggle */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Plane size={14} className="text-blue-400" />
                      <span className="text-[10px] font-mono uppercase text-foreground">Move Abroad</span>
                    </div>
                    <button 
                      onClick={() => setMoveAbroadEnabled(!moveAbroadEnabled)}
                      className={cn("w-8 h-4 rounded-full transition-colors relative", moveAbroadEnabled ? "bg-blue-400" : "bg-white/10")}
                    >
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", moveAbroadEnabled ? "right-0.5" : "left-0.5")} />
                    </button>
                  </div>
                  {moveAbroadEnabled && (
                    <div className="grid grid-cols-2 gap-3 animate-fade-in">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">Year</span>
                        <input type="number" value={moveAbroadYear} onChange={(e) => setMoveAbroadYear(parseInt(e.target.value))} className="w-full bg-black/40 border-none rounded-lg p-2 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">Tax %</span>
                        <input type="number" step="0.01" value={moveAbroadTaxRate} onChange={(e) => setMoveAbroadTaxRate(parseFloat(e.target.value))} className="w-full bg-black/40 border-none rounded-lg p-2 text-xs font-mono" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Taxation & Growth Section */}
              <div className="pt-4 border-t border-white/5 space-y-4">
                <h4 className="text-[10px] font-mono uppercase text-muted-foreground/60 tracking-widest">Dutch Taxation</h4>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark size={14} className="text-destructive" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Dutch Box 3</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowAdvancedBox3(!showAdvancedBox3)}
                      className="text-[9px] font-mono text-muted-foreground underline uppercase tracking-tighter"
                    >
                      Settings
                    </button>
                    <button onClick={() => setBox3Enabled(!box3Enabled)} className={cn("w-10 h-5 rounded-full transition-colors relative", box3Enabled ? "bg-accent" : "bg-white/10")}>
                      <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", box3Enabled ? "right-1" : "left-1")} />
                    </button>
                  </div>
                </div>

                {showAdvancedBox3 && box3Enabled && (
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-mono text-muted-foreground uppercase">Model</label>
                        <select value={box3Model} onChange={(e) => setBox3Model(e.target.value as any)} className="w-full bg-black/40 border-none rounded-lg p-2 text-[10px]">
                          <option value="new">New (Actual Return)</option>
                          <option value="bridging">Bridging (Old)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-mono text-muted-foreground uppercase">Tax Rate</label>
                        <input type="number" step="0.01" value={box3TaxRate} onChange={(e) => setBox3TaxRate(parseFloat(e.target.value))} className="w-full bg-black/40 border-none rounded-lg p-2 text-[10px] font-mono" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-muted-foreground uppercase">Fiscal Partner</span>
                      <button onClick={() => setBox3FiscalPartner(!box3FiscalPartner)} className={cn("w-8 h-4 rounded-full transition-colors relative", box3FiscalPartner ? "bg-accent" : "bg-white/10")}>
                        <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", box3FiscalPartner ? "right-0.5" : "left-0.5")} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={14} className="text-accent" />
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Income Growth %</span>
                  </div>
                  <button onClick={() => setGrowthEnabled(!growthEnabled)} className={cn("w-10 h-5 rounded-full transition-colors relative", growthEnabled ? "bg-accent" : "bg-white/10")}>
                    <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white transition-all", growthEnabled ? "right-1" : "left-1")} />
                  </button>
                </div>
                {growthEnabled && (
                   <input 
                   type="range" min="0" max="0.10" step="0.001"
                   value={growthRate} 
                   onChange={(e) => setGrowthRate(parseFloat(e.target.value))}
                   className="w-full h-1 bg-accent/20 rounded-lg appearance-none cursor-pointer accent-accent"
                 />
                )}
              </div>
            </div>
          </section>

          <section className="bg-accent/5 p-6 rounded-2xl border border-accent/10 space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-accent">Sensitivity Analysis</h3>
            <div className="space-y-3">
              {[
                { label: 'Lean FIRE', res: leanResult, sub: '70% budget', color: 'text-accent/60' },
                { label: 'Standard', res: baseResult, sub: '100% budget', color: 'text-accent' },
                { label: 'Fat FIRE', res: fatResult, sub: '150% budget', color: 'text-accent/40' },
              ].map((v, i) => (
                <div key={i} className="flex justify-between items-center group">
                  <span className={cn("text-[10px] font-mono uppercase tracking-wider", v.color)}>{v.label}</span>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-bold font-mono">{v.res.date || '---'}</span>
                    <span className="text-[9px] text-muted-foreground font-mono">{v.res.years ? `${v.res.years.toFixed(1)}y` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
