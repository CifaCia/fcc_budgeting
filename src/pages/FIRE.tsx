import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency, convertToEUR } from '@/lib/currency';
import { 
  TrendingUp, Target, Calendar, 
  Plus, Trash2, Info, AlertTriangle,
  Landmark, PieChart as PieChartIcon, 
  ArrowUpRight, Minus
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
  box3TaxThisYear: number;
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
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync Box 3 yield with nominal return if they are close (suggesting they should be linked)
  useEffect(() => {
    if (nominalReturn !== box3DividendYield) {
       // Only auto-sync if the user hasn't explicitly diverged them significantly?
       // Or just follow the user's request to "match" them.
       setBox3DividendYield(nominalReturn);
    }
  }, [nominalReturn]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // 1. Fetch live transactions to calculate current balances
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

    // 2. Fetch user settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // 3. Fetch budget items to calculate default expenses
    const { data: budgetItems } = await supabase
      .from('budget_items')
      .select('expected_monthly')
      .eq('user_id', user.id);
    
    const budgetTotalMonthly = (budgetItems || []).reduce((sum, item) => sum + (Number(item.expected_monthly) || 0), 0);

    if (settings) {
      // If null, we keep it null to indicate 'auto-sync' mode.
      if (settings.fire_cash_balance != null) {
        setCashBalanceOverride(Number(settings.fire_cash_balance));
      } else {
        setCashBalanceOverride(null);
      }

      if (settings.fire_etf_balance != null) {
        setEtfBalanceOverride(Number(settings.fire_etf_balance));
      } else {
        setEtfBalanceOverride(null);
      }

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
        if (settings.fire_box3_dividend_yield == null) {
          setBox3DividendYield(rate);
        }
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

      if (settings.fire_contributions) {
        setContributions(settings.fire_contributions as FIREContribution[]);
      }

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
      // No settings found: keep as null for auto-sync
      setCashBalanceOverride(null);
      setEtfBalanceOverride(null);
      if (budgetTotalMonthly > 0) {
        setAnnualExpenses(budgetTotalMonthly * 12);
      } else {
        setAnnualExpenses(3000 * 12);
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced Save
  useEffect(() => {
    if (loading || !user) return;

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      const { error } = await supabase.from('user_settings').upsert({
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
      
      if (error) {
        console.error('FIRE settings save error:', error);
        setSaveError(error.message || 'Unknown save error');
      }
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

  // Calculations
  const realEtfReturnRate = useMemo(() => {
    const inf = (inflationRate || 0);
    if (inf === -1) return nominalReturn || 0;
    return ((1 + (nominalReturn || 0)) / (1 + inf)) - 1;
  }, [nominalReturn, inflationRate]);
  const realCashReturnRate = useMemo(() => {
    const inf = (inflationRate || 0);
    if (inf === -1) return cashInterestRate || 0;
    return ((1 + (cashInterestRate || 0)) / (1 + inf)) - 1;
  }, [cashInterestRate, inflationRate]);
  
  const currentCash = cashBalanceOverride != null ? cashBalanceOverride : latestCash;
  const currentEtf = etfBalanceOverride != null ? etfBalanceOverride : latestEtf;
  const currentNetWorth = currentCash + currentEtf;

  const effectiveMultiplier = useMemo(() => {
    if (fireMode === 'withdrawal') {
      const swr = withdrawalRate || 0.04;
      return swr > 0 ? 1 / swr : 1000; // Cap at 1000x for 0% swr
    }
    return multiplier || 25;
  }, [fireMode, multiplier, withdrawalRate]);

  const fireTarget = (annualExpenses || 0) * effectiveMultiplier;

  // Simulation Engine
  const runSimulation = useCallback((targetMultiplier: number): FIREResult => {
    const target = (annualExpenses || 0) * (targetMultiplier || 25);
    
    // Monthly real returns
    const mrrEtf = Math.pow(1 + (realEtfReturnRate || 0), 1/12) - 1;
    const mrrEtfOpt = Math.pow(1 + (realEtfReturnRate || 0) + 0.01, 1/12) - 1;
    const mrrEtfPess = Math.pow(1 + (realEtfReturnRate || 0) - 0.01, 1/12) - 1;
    const mrrCash = Math.pow(1 + (realCashReturnRate || 0), 1/12) - 1;

    let csh = currentCash;
    let etf = currentEtf;
    let etfOpt = currentEtf;
    let etfPess = currentEtf;
    let nwNoTax = currentNetWorth;
    
    let totalBox3Paid = 0;
    let totalContributions = 0;
    const dataPoints: SimulationDataPoint[] = [];
    const startDate = new Date();
    startDate.setDate(1);

    let reachedDate: string | null = null;
    let reachedYears: number | null = null;
    let noTaxReachedYears: number | null = null;

    // Track the baseline net worth on the day we move abroad
    let abroadBaselineNW = 0;
    let hasSetAbroadBaseline = false;

    for (let year = 0; year <= 60; year++) {
      let annualContribution = 0;
      const cshStartOfYear = csh;
      const etfStartOfYear = etf;
      
      for (let month = 0; month < 12; month++) {
        const currentMonthDate = new Date(startDate);
        currentMonthDate.setMonth(startDate.getMonth() + (year * 12) + month);
        const dateStr = currentMonthDate.toISOString().slice(0, 7);
        const currentYearSim = currentMonthDate.getFullYear();

        // A user is considered "retired" if they reached the target organically OR they hit the forced year.
        const isForcedRetirementActive = forcedRetirementYear != null && currentYearSim >= forcedRetirementYear;
        const isRetiredPreCheck = isForcedRetirementActive || reachedDate !== null;
        const isAbroadActive = moveAbroadEnabled && currentYearSim >= moveAbroadYear;

        // Set the baseline on the first month we are abroad
        if (isAbroadActive && !hasSetAbroadBaseline) {
          abroadBaselineNW = csh + etf;
          hasSetAbroadBaseline = true;
        }

        let monthlyContrib = 0;

        contributions.forEach(c => {
          const isUntilRetirement = !c.to_date;
          if (dateStr >= c.from_date && (!c.to_date || dateStr <= c.to_date)) {
            // Stop open-ended contributions if we are retired (either organically or forced)
            if (isUntilRetirement && isRetiredPreCheck) return; 

            let amount = c.monthly_amount || 0;
            if (growthEnabled) {
              const fromDate = new Date(c.from_date + '-01');
              const yearsDiff = Math.max(0, currentMonthDate.getFullYear() - fromDate.getFullYear());
              amount *= Math.pow(1 + (growthRate || 0), yearsDiff);
            }
            monthlyContrib += amount;
          }
        });

        // Real simulation
        csh = csh * (1 + mrrCash);

        // Contributions go into ETF bucket.
        // We first calculate the ETF balance before withdrawals to check if we hit the FIRE target.
        etf = etf * (1 + mrrEtf) + monthlyContrib;
        const nwBeforeExpenses = csh + etf;

        // If a forced year is defined, ONLY trigger retirement on that year.
        // Otherwise, trigger organically based on the target BEFORE expenses are subtracted,
        // AND ensure the portfolio is actually self-sufficient (net real growth >= expenses).
        if (forcedRetirementYear != null) {
          if (!reachedDate && currentYearSim >= forcedRetirementYear) {
            reachedDate = currentMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            reachedYears = year + (month + 1) / 12;
          }
        } else {
          if (!reachedDate && nwBeforeExpenses >= target) {
            // Check self-sufficiency
            const isAbroadActive = moveAbroadEnabled && currentYearSim >= moveAbroadYear;
            let expectedBox3Tax = 0;

            if (box3Enabled && currentYearSim >= (box3StartYear || 2028) && !isAbroadActive) {
              if (box3Model === 'bridging') {
                const effectiveThreshold = box3FiscalPartner ? (box3Threshold || 57000) * 2 : (box3Threshold || 57000);
                const taxable = Math.max(0, nwBeforeExpenses - effectiveThreshold);
                let fictitiousReturn = 0;
                if (taxable > 0) {
                  const bracket1 = Math.min(taxable, 71650);
                  const bracket2 = Math.min(Math.max(0, taxable - 71650), 1000000 - 71650);
                  const bracket3 = Math.max(0, taxable - 1000000);
                  fictitiousReturn = (bracket1 * 0.0182) + (bracket2 * 0.0437) + (bracket3 * 0.0553);
                }
                expectedBox3Tax = fictitiousReturn * (box3TaxRate || 0.36);
              } else {
                const totalNominalReturn = (csh * (cashInterestRate || 0)) + (etf * (nominalReturn || 0));
                const effectiveAllowance = box3FiscalPartner ? (box3ReturnAllowance || 1800) * 2 : (box3ReturnAllowance || 1800);
                const taxableReturn = Math.max(0, totalNominalReturn - effectiveAllowance);
                expectedBox3Tax = taxableReturn * (box3TaxRate || 0.36);
              }
            }
            
            const portfolioRealReturn = (csh * (realCashReturnRate || 0)) + (etf * (realEtfReturnRate || 0));
            const requiredAnnualGrossExpenses = isAbroadActive ? (annualExpenses || 0) / (1 - moveAbroadTaxRate) : (annualExpenses || 0);
            
            let isSelfSufficient = false;
            
            if (deathYear != null) {
              // Calculate months remaining until the end of the death year
              const monthsToDeath = ((deathYear - currentYearSim) * 12) + (11 - currentMonthDate.getMonth()) + 1;
              
              if (monthsToDeath <= 0) {
                isSelfSufficient = true;
              } else {
                const totalNWInitial = nwBeforeExpenses;
                const cashWeight = totalNWInitial > 0 ? (csh / totalNWInitial) : 0;
                const etfWeight = totalNWInitial > 0 ? (etf / totalNWInitial) : 1;
                const combinedRealReturnRate = (cashWeight * (realCashReturnRate || 0)) + (etfWeight * (realEtfReturnRate || 0));
                const mrrGross = Math.pow(1 + combinedRealReturnRate, 1/12) - 1;

                // Function to calculate exact Box 3 tax for a given starting net worth
                const calcBox3 = (startNW: number, yearOfEval: number, isAbr: boolean) => {
                  let expectedBox3Tax = 0;
                  if (box3Enabled && yearOfEval >= (box3StartYear || 2028) && !isAbr) {
                    if (box3Model === 'bridging') {
                      const effectiveThreshold = box3FiscalPartner ? (box3Threshold || 57000) * 2 : (box3Threshold || 57000);
                      const taxable = Math.max(0, startNW - effectiveThreshold);
                      let fictitiousReturn = 0;
                      if (taxable > 0) {
                        const bracket1 = Math.min(taxable, 71650);
                        const bracket2 = Math.min(Math.max(0, taxable - 71650), 1000000 - 71650);
                        const bracket3 = Math.max(0, taxable - 1000000);
                        fictitiousReturn = (bracket1 * 0.0182) + (bracket2 * 0.0437) + (bracket3 * 0.0553);
                      }
                      expectedBox3Tax = fictitiousReturn * (box3TaxRate || 0.36);
                    } else {
                      const weightedNominalReturn = (cashWeight * (cashInterestRate || 0)) + (etfWeight * (nominalReturn || 0));
                      const totalNominalReturn = (startNW * weightedNominalReturn); 
                      const effectiveAllowance = box3FiscalPartner ? (box3ReturnAllowance || 1800) * 2 : (box3ReturnAllowance || 1800);
                      const taxableReturn = Math.max(0, totalNominalReturn - effectiveAllowance);
                      expectedBox3Tax = taxableReturn * (box3TaxRate || 0.36);
                    }
                  }
                  return expectedBox3Tax;
                };

                // Work backwards month by month to find required NW
                let targetPV = 0;
                const totalYearsToSim = Math.ceil(monthsToDeath / 12);
                
                for (let y = totalYearsToSim - 1; y >= 0; y--) {
                  const evalYear = currentYearSim + y;
                  const isAbroadThisEvalYear = moveAbroadEnabled && evalYear >= moveAbroadYear;
                  const evalRequiredAnnualGrossExpenses = isAbroadThisEvalYear ? (annualExpenses || 0) / (1 - moveAbroadTaxRate) : (annualExpenses || 0);
                  const evalMonthlyExpenses = evalRequiredAnnualGrossExpenses / 12;

                  // Determine how many months to simulate for this specific year (handles partial first/last year)
                  let monthsInThisYear = 12;
                  if (y === 0) {
                    // First year: only months from currentMonthDate.getMonth() to 11
                    monthsInThisYear = 12 - currentMonthDate.getMonth();
                  }

                  let low = 0;
                  let high = 200000000; 
                  let startNW = 0;

                  for (let i = 0; i < 50; i++) { 
                    let mid = (low + high) / 2;
                    let port = mid;

                    for (let m = 0; m < monthsInThisYear; m++) {
                      port = port * (1 + mrrGross) - evalMonthlyExpenses;
                    }
                    port -= calcBox3(mid, evalYear, isAbroadThisEvalYear);

                    if (port > targetPV) {
                      high = mid;
                    } else {
                      low = mid;
                    }
                    startNW = mid;
                  }
                  targetPV = startNW;
                }

                isSelfSufficient = totalNWInitial >= targetPV;
              }
            } else {
              // Perpetual withdrawal logic
              isSelfSufficient = (portfolioRealReturn - expectedBox3Tax) >= requiredAnnualGrossExpenses;
            }

            if (isSelfSufficient) {
              reachedDate = currentMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
              reachedYears = year + (month + 1) / 12;
            }
          }
        }

        // Now that we've checked the target, update 'isRetired' status for this specific month's expense withdrawal.
        const isRetiredNowPostCheck = (forcedRetirementYear != null && currentYearSim >= forcedRetirementYear) || reachedDate !== null;

        // Subtract expenses if we are retired
        let monthlyExpenses = 0;
        if (isRetiredNowPostCheck) {
          const isAbroadActive = moveAbroadEnabled && currentYearSim >= moveAbroadYear;
          if (isAbroadActive) {
            monthlyExpenses = (annualExpenses / 12) / (1 - moveAbroadTaxRate);
          } else {
            monthlyExpenses = (annualExpenses / 12);
          }
          etf -= monthlyExpenses;
        }

        etfOpt = etfOpt * (1 + mrrEtfOpt) + (isRetiredNowPostCheck ? 0 : monthlyContrib) - monthlyExpenses;
        etfPess = etfPess * (1 + mrrEtfPess) + (isRetiredNowPostCheck ? 0 : monthlyContrib) - monthlyExpenses;

        // Clamp to zero
        if (etf < 0) {
          csh += etf; // drain cash if etf is empty
          etf = 0;
        }
        if (csh < 0) csh = 0; // if both empty, clamp to 0

        etfOpt = Math.max(0, etfOpt);
        etfPess = Math.max(0, etfPess);

        annualContribution += monthlyContrib;
      }
      // Box 3 tax deduction at year-end
      let box3TaxThisYear = 0;
      const finalMonthOfYear = new Date(startDate);
      finalMonthOfYear.setMonth(startDate.getMonth() + (year * 12) + 11);
      const currentYearSimEnd = finalMonthOfYear.getFullYear();

      const isAbroadActiveThisYear = moveAbroadEnabled && currentYearSimEnd >= moveAbroadYear;
      if (box3Enabled && currentYearSimEnd >= (box3StartYear || 2028) && !isAbroadActiveThisYear) {
        if (box3Model === 'bridging') {
          const nwBeforeTax = csh + etf;
          const effectiveThreshold = box3FiscalPartner ? (box3Threshold || 57000) * 2 : (box3Threshold || 57000);
          const taxable = Math.max(0, nwBeforeTax - effectiveThreshold);
          let fictitiousReturn = 0;
          if (taxable > 0) {
            const bracket1 = Math.min(taxable, 71650);
            const bracket2 = Math.min(Math.max(0, taxable - 71650), 1000000 - 71650);
            const bracket3 = Math.max(0, taxable - 1000000);
            fictitiousReturn = (bracket1 * 0.0182) + (bracket2 * 0.0437) + (bracket3 * 0.0553);
          }
          box3TaxThisYear = fictitiousReturn * (box3TaxRate || 0.36);
        } else {
          // New model: tax on actual nominal returns
          const totalNominalReturn = (cshStartOfYear * (cashInterestRate || 0)) + (etfStartOfYear * (nominalReturn || 0));
          const effectiveAllowance = box3FiscalPartner ? (box3ReturnAllowance || 1800) * 2 : (box3ReturnAllowance || 1800);
          const taxableReturn = Math.max(0, totalNominalReturn - effectiveAllowance);
          box3TaxThisYear = taxableReturn * (box3TaxRate || 0.36);
        }
        
        // Deduction - proportionally from cash and etf
        const totalNW = csh + etf;
        if (totalNW > 0) {
          const cashWeight = csh / totalNW;
          const etfWeight = etf / totalNW;
          csh -= box3TaxThisYear * cashWeight;
          etf -= box3TaxThisYear * etfWeight;
          etfOpt -= box3TaxThisYear * etfWeight;
          etfPess -= box3TaxThisYear * etfWeight;
        }
        
        if (csh < 0) csh = 0;
        if (etf < 0) etf = 0;
        if (etfOpt < 0) etfOpt = 0;
        if (etfPess < 0) etfPess = 0;

        totalBox3Paid += box3TaxThisYear;
      }

      totalContributions += annualContribution;

      dataPoints.push({
        year,
        date: currentYearSimEnd.toString(),
        netWorth: csh + etf,
        netWorthOptimistic: csh + etfOpt,
        netWorthPessimistic: csh + etfPess,
        netWorthNoTax: nwNoTax,
        annualContribution,
        cumulativeContributions: totalContributions,
        box3TaxThisYear,
        cumulativeBox3Tax: totalBox3Paid
      });

      if (year === 60) break;
    }

    return {
      reached: reachedDate != null,
      date: reachedDate,
      years: reachedYears,
      data: dataPoints,
      target,
      totalBox3Paid,
      noTaxYears: noTaxReachedYears
    };
  }, [
    annualExpenses, realEtfReturnRate, realCashReturnRate, currentCash, currentEtf, currentNetWorth, 
    contributions, growthEnabled, growthRate, box3Enabled, box3Model, box3StartYear, 
    box3FiscalPartner, box3Threshold, box3ReturnAllowance, box3DividendYield, box3TaxRate, forcedRetirementYear, deathYear,
    moveAbroadEnabled, moveAbroadYear, moveAbroadTaxRate
  ]);

  const baseResult = useMemo(() => runSimulation(effectiveMultiplier), [runSimulation, effectiveMultiplier]);
  const leanResult = useMemo(() => runSimulation(effectiveMultiplier * 0.7), [runSimulation, effectiveMultiplier]);
  const fatResult = useMemo(() => runSimulation(effectiveMultiplier * 1.5), [runSimulation, effectiveMultiplier]);

  const progressPercent = fireTarget > 0 ? Math.min(100, (currentNetWorth / fireTarget) * 100) : 0;

  // Validation: Overlapping periods
  const hasOverlap = useMemo(() => {
    for (let i = 0; i < contributions.length; i++) {
      for (let j = i + 1; j < contributions.length; j++) {
        const a = contributions[i];
        const b = contributions[j];
        
        const startA = a.from_date;
        const endA = a.to_date || '9999-12';
        const startB = b.from_date;
        const endB = b.to_date || '9999-12';

        if (startA <= endB && startB <= endA) return true;
      }
    }
    return false;
  }, [contributions]);

  const addPeriod = () => {
    const today = new Date().toISOString().slice(0, 7);
    const newPeriod: FIREContribution = {
      id: crypto.randomUUID(),
      label: 'New Period',
      monthly_amount: 1000,
      from_date: today,
      to_date: null
    };
    setContributions([...contributions, newPeriod]);
  };

  const updatePeriod = (id: string, updates: Partial<FIREContribution>) => {
    setContributions(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deletePeriod = (id: string) => {
    setContributions(prev => prev.filter(c => c.id !== id));
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading FIRE Projections...</div>;

  return (
    <div className="space-y-8 pb-12 max-w-7xl mx-auto px-4">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">FIRE Strategy</h1>
          <p className="text-gray-500 mt-1">Project your path to financial independence.</p>
        </div>
        <div className="flex items-center text-xs font-medium text-gray-400">
          {saveError ? (
            <span className="flex items-center text-red-500"><AlertTriangle size={14} className="mr-1" /> Save Error: {saveError}</span>
          ) : saving ? (
            <span className="flex items-center"><Info size={14} className="mr-1 animate-pulse" /> Saving changes...</span>
          ) : (
            <span className="flex items-center text-green-500"><Target size={14} className="mr-1" /> All changes saved</span>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center">
            <Target size={14} className="mr-1.5 text-indigo-500" /> FIRE Target
          </span>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(fireTarget)}</div>
          <div className="mt-auto pt-4 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {fireMode === 'multiplier' 
                ? `${multiplier || 25}x annual expenses` 
                : `${((withdrawalRate || 0.04) * 100).toFixed(1)}% withdrawal rate`}
            </span>
            {box3Enabled && (
              <span className="text-red-500 font-medium">Incl. Box 3</span>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center">
            <Calendar size={14} className="mr-1.5 text-teal-500" /> Projected Date
          </span>
          <div className="text-2xl font-bold text-gray-900">
            {baseResult.reached ? baseResult.date : 'Not within 60 years'}
          </div>
          <div className="mt-auto pt-4 flex items-center justify-between text-xs">
            <span className="text-gray-500">{baseResult.reached ? `${baseResult.years?.toFixed(1)} years to go` : 'Increase savings or return'}</span>
            {box3Enabled && baseResult.reached && baseResult.noTaxYears && (
              <span className="text-red-600 font-bold">+{ (baseResult.years! - baseResult.noTaxYears).toFixed(1) }y drag</span>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center">
            <PieChartIcon size={14} className="mr-1.5 text-amber-500" /> Progress
          </span>
          <div className="text-2xl font-bold text-gray-900">{progressPercent.toFixed(1)}%</div>
          <div className="mt-auto pt-4">
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-1000" 
                style={{ width: `${progressPercent}%` }} 
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center">
            <TrendingUp size={14} className="mr-1.5 text-emerald-500" /> {box3Enabled ? 'Total Tax Paid' : 'Real Return (ETF)'}
          </span>
          <div className="text-2xl font-bold text-gray-900">
            {box3Enabled ? formatCurrency(baseResult.totalBox3Paid) : `${(realEtfReturnRate * 100).toFixed(1)}%`}
          </div>
          <div className="mt-auto pt-4 flex items-center gap-2 text-[10px] font-medium text-gray-400">
             {box3Enabled ? (
               <span className="text-red-400 font-bold bg-red-50 px-2 py-0.5 rounded">Estimated cumulative Box 3</span>
             ) : (
               <>
                 <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">Nominal: {(nominalReturn*100).toFixed(0)}%</span>
                 <Minus size={8} />
                 <span className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">Infl: {(inflationRate*100).toFixed(0)}%</span>
               </>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
            <h2 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">Core Assumptions</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">Cash Balance (€)</label>
                  </div>
                  <input 
                    type="number" 
                    value={currentCash} 
                    onChange={(e) => setCashBalanceOverride(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                    className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button 
                    onClick={() => setCashBalanceOverride(null)}
                    className="text-[9px] text-gray-400 hover:text-indigo-600 font-bold"
                  >
                    Sync to latest ({formatCurrency(latestCash)})
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-gray-400 uppercase">ETF/Stock (€)</label>
                  </div>
                  <input 
                    type="number" 
                    value={currentEtf} 
                    onChange={(e) => setEtfBalanceOverride(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                    className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button 
                    onClick={() => setEtfBalanceOverride(null)}
                    className="text-[9px] text-gray-400 hover:text-indigo-600 font-bold"
                  >
                    Sync to latest ({formatCurrency(latestEtf)})
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700">Annual Expenses (€)</label>
                  <span className="text-xs text-gray-400">{formatCurrency((annualExpenses || 0) / 12)}/mo</span>
                </div>
                <input 
                  type="number" 
                  value={annualExpenses || 0} 
                  onChange={(e) => setAnnualExpenses(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                  className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-50">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700">ETF Nominal Return (%)</label>
                  <span className="text-sm font-bold text-indigo-600">{((nominalReturn || 0) * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.2" step="0.001"
                  value={nominalReturn || 0} 
                  onChange={(e) => setNominalReturn((parseFloat(e.target.value) || 0) || 0)}
                  className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700">Cash Interest Rate (%)</label>
                  <span className="text-sm font-bold text-emerald-600">{((cashInterestRate || 0) * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.1" step="0.001"
                  value={cashInterestRate || 0} 
                  onChange={(e) => setCashInterestRate((parseFloat(e.target.value) || 0) || 0)}
                  className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-gray-700">Inflation Rate (%)</label>
                  <span className="text-sm font-bold text-gray-600">{((inflationRate || 0) * 100).toFixed(1)}%</span>
                </div>
                <input 
                  type="range" min="0" max="0.1" step="0.001"
                  value={inflationRate || 0} 
                  onChange={(e) => setInflationRate((parseFloat(e.target.value) || 0) || 0)}
                  className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-gray-600"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Targeting Mode</label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    <button 
                      onClick={() => setFireMode('multiplier')}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                        fireMode === 'multiplier' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      Multiplier
                    </button>
                    <button 
                      onClick={() => setFireMode('withdrawal')}
                      className={cn(
                        "px-3 py-1 text-[10px] font-bold rounded-md transition-all",
                        fireMode === 'withdrawal' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      )}
                    >
                      SWR %
                    </button>
                  </div>
                </div>

                {fireMode === 'multiplier' ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">FIRE Multiplier</label>
                      <span className="text-sm font-bold text-amber-600">{multiplier || 25}x</span>
                    </div>
                    <input 
                      type="range" min="15" max="50" step="1"
                      value={multiplier || 25} 
                      onChange={(e) => setMultiplier(parseInt(e.target.value) || 25)}
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-amber-600"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Withdrawal Rate (%)</label>
                      <span className="text-sm font-bold text-amber-600">{((withdrawalRate || 0.04) * 100).toFixed(1)}%</span>
                    </div>
                    <input 
                      type="range" min="0.01" max="0.1" step="0.001"
                      value={withdrawalRate || 0.04} 
                      onChange={(e) => setWithdrawalRate((parseFloat(e.target.value) || 0) || 0.04)}
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-amber-600"
                    />
                  </div>
                )}
              </div>
            </div>
            
            <div className="pt-6 mt-6 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Hypothetical Death Year</label>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number"
                    placeholder="YYYY"
                    value={deathYear || ''}
                    onChange={(e) => setDeathYear(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-24 border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-300"
                  />
                  {deathYear && (
                    <button 
                      onClick={() => setDeathYear(null)}
                      className="text-[10px] text-gray-400 hover:text-red-500 transition-colors bg-gray-50 hover:bg-red-50 px-2 py-1 rounded"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                If set, calculates the FIRE date based on exhausting your portfolio precisely in this year ("Die with Zero"). If cleared, calculates based on perpetual self-sufficiency.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Force Retirement Year</label>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number"
                    placeholder="YYYY"
                    value={forcedRetirementYear || ''}
                    onChange={(e) => setForcedRetirementYear(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-24 border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-300"
                  />
                  {forcedRetirementYear && (
                    <button 
                      onClick={() => setForcedRetirementYear(null)}
                      className="text-[10px] text-gray-400 hover:text-red-500 transition-colors bg-gray-50 hover:bg-red-50 px-2 py-1 rounded"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Force the simulation to start withdrawing expenses in this year, regardless of whether the FIRE target has been reached.
              </p>
            </div>

            <div className="pt-6 mt-6 border-t border-gray-50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-gray-900">Move Abroad</h3>
                  <p className="text-[10px] text-gray-500">Stop Box 3 and pay tax on withdrawals.</p>
                </div>
                <button 
                  onClick={() => setMoveAbroadEnabled(!moveAbroadEnabled)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                    moveAbroadEnabled ? "bg-indigo-600" : "bg-gray-200"
                  )}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    moveAbroadEnabled ? "translate-x-5" : "translate-x-0"
                  )} />
                </button>
              </div>

              {moveAbroadEnabled && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Move Year</label>
                    <input 
                      type="number" 
                      value={moveAbroadYear} 
                      onChange={(e) => setMoveAbroadYear(e.target.value === '' ? 2035 : (parseInt(e.target.value) || 2035))}
                      className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Withdrawal Tax</label>
                      <span className="text-sm font-bold text-red-500">{(moveAbroadTaxRate * 100).toFixed(0)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="0.6" step="0.01"
                      value={moveAbroadTaxRate} 
                      onChange={(e) => setMoveAbroadTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <p className="text-[10px] text-gray-400">Withdrawals will be grossed up so your NET equals your annual expenses.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Annual Growth</h2>
                <div 
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                    growthEnabled ? "bg-indigo-600" : "bg-gray-200"
                  )}
                  onClick={() => setGrowthEnabled(!growthEnabled)}
                >
                  <span className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    growthEnabled ? "translate-x-5" : "translate-x-0"
                  )} />
                </div>
             </div>

             {growthEnabled && (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                 <p className="text-xs text-gray-500 leading-relaxed">
                   Increase your monthly contributions by a fixed percentage each year to account for salary bumps.
                 </p>
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-medium text-gray-700">Annual Increase (%)</label>
                      <span className="text-sm font-bold text-indigo-600">{(growthRate * 100).toFixed(1)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="0.1" step="0.005"
                      value={growthRate} 
                      onChange={(e) => setGrowthRate((parseFloat(e.target.value) || 0))}
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
               </div>
             )}
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                <Landmark size={20} className="mr-2 text-indigo-600" />
                🇳🇱 Dutch Box 3
              </h2>
              <div 
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                  box3Enabled ? "bg-indigo-600" : "bg-gray-200"
                )}
                onClick={() => setBox3Enabled(!box3Enabled)}
              >
                <span className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  box3Enabled ? "translate-x-5" : "translate-x-0"
                )} />
              </div>
            </div>

            {box3Enabled && (
              <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex p-1 bg-gray-100 rounded-lg">
                  <button 
                    onClick={() => { setBox3Model('bridging'); setBox3StartYear(2025); }}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all",
                      box3Model === 'bridging' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    Bridging (until 2027)
                  </button>
                  <button 
                    onClick={() => { setBox3Model('new'); setBox3StartYear(2028); }}
                    className={cn(
                      "flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all",
                      box3Model === 'new' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    New Regime (2028+)
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">Fiscal Partner</label>
                    <div 
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                        box3FiscalPartner ? "bg-teal-500" : "bg-gray-200"
                      )}
                      onClick={() => setBox3FiscalPartner(!box3FiscalPartner)}
                    >
                      <span className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        box3FiscalPartner ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start Year</label>
                    <input 
                      type="number" 
                      value={box3StartYear} 
                      onChange={(e) => setBox3StartYear(parseInt(e.target.value) || 2028)}
                      className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  {box3Model === 'bridging' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Threshold (€)</label>
                          <span className="text-[10px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded">
                            Effective: €{(box3FiscalPartner ? box3Threshold * 2 : box3Threshold).toLocaleString()}
                          </span>
                        </div>
                        <input 
                          type="number" 
                          value={box3Threshold} 
                          onChange={(e) => setBox3Threshold(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                          className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Annual Allowance (€)</label>
                          <span className="text-[10px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded">
                            Effective: €{(box3FiscalPartner ? box3ReturnAllowance * 2 : box3ReturnAllowance).toLocaleString()}
                          </span>
                        </div>
                        <input 
                          type="number" 
                          value={box3ReturnAllowance} 
                          onChange={(e) => setBox3ReturnAllowance(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                          className="w-full border-gray-200 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Estimated Yield (%)</label>
                          <span className="text-sm font-bold text-indigo-600">{(box3DividendYield * 100).toFixed(1)}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="0.2" step="0.001"
                          value={box3DividendYield} 
                          onChange={(e) => setBox3DividendYield((parseFloat(e.target.value) || 0))}
                          className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-[9px] text-gray-400 italic">Matched to portfolio nominal return by default.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Rate (%)</label>
                      <span className="text-sm font-bold text-red-500">{(box3TaxRate * 100).toFixed(0)}%</span>
                    </div>
                    <input 
                      type="range" min="0.2" max="0.5" step="0.01"
                      value={box3TaxRate} 
                      onChange={(e) => setBox3TaxRate((parseFloat(e.target.value) || 0))}
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                  </div>

                  {box3Model === 'new' && (
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3 text-amber-800">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <p className="text-[9px] leading-relaxed">
                        ⚠️ The new Box 3 regime (Wet werkelijk rendement box 3) passed the Tweede Kamer on 12 Feb 2026 and is expected to take effect 1 January 2028. This uses the <strong>vermogensaanwasbelasting</strong> track.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Chart & Schedule */}
        <div className="lg:col-span-2 space-y-8">
          {/* Main Chart */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold text-gray-900">Net Worth Projection</h2>
              {growthEnabled && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 flex items-center">
                  <ArrowUpRight size={12} className="mr-1" /> Contributions grow at {(growthRate*100).toFixed(1)}%/yr
                </span>
              )}
            </div>
            
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={baseResult.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorNWNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRange" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#94A3B8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    interval={5}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94A3B8' }}
                    tickFormatter={(val) => val >= 1000000 ? `€${(val/1000000).toFixed(1)}M` : `€${(val/1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: any, name?: string) => {
                      if (name === 'netWorth') return [formatCurrency(val), 'Net Worth (Taxed)'];
                      if (name === 'netWorthNoTax') return [formatCurrency(val), 'Net Worth (No Tax)'];
                      if (name === 'annualContribution') return [formatCurrency(val), 'Annual Contrib'];
                      if (name === 'cumulativeContributions') return [formatCurrency(val), 'Cumulative Principal'];
                      if (name === 'box3TaxThisYear') return [formatCurrency(val), 'Box 3 Tax (Year)'];
                      if (name === 'cumulativeBox3Tax') return [formatCurrency(val), 'Cumulative Box 3'];
                      return [formatCurrency(val), name || ''];
                    }}
                  />
                  
                  {/* Confidence Interval / Range */}
                  <Area
                    type="monotone"
                    dataKey="netWorthOptimistic"
                    stroke="none"
                    fill="#6366F1"
                    fillOpacity={0.05}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorthPessimistic"
                    stroke="none"
                    fill="#6366F1"
                    fillOpacity={0.05}
                  />

                  {box3Enabled && (
                    <Area 
                      type="monotone" 
                      dataKey="netWorthNoTax" 
                      stroke="#94A3B8" 
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      fill="none"
                    />
                  )}

                  {/* Contributions Principal Area */}
                  <Area 
                    type="monotone" 
                    dataKey="cumulativeContributions" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fillOpacity={0.1} 
                    fill="#10B981" 
                  />

                  {/* Primary Area */}
                  <Area 
                    type="monotone" 
                    dataKey="netWorth" 
                    stroke={baseResult.data.length > 0 && baseResult.data[baseResult.data.length - 1].netWorth <= 0 ? "#EF4444" : "#6366F1"} 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill={baseResult.data.length > 0 && baseResult.data[baseResult.data.length - 1].netWorth <= 0 ? "url(#colorNWNegative)" : "url(#colorNW)"} 
                  />

                  {/* FIRE Target Line */}
                  <ReferenceLine 
                    y={fireTarget} 
                    stroke="#F59E0B" 
                    strokeDasharray="5 5" 
                    label={{ value: 'FIRE Target', position: 'insideTopRight', fill: '#F59E0B', fontSize: 10, fontWeight: 'bold' }} 
                  />

                  {/* Reached Date Marker */}
                  {baseResult.reached && (
                    <ReferenceLine 
                      x={baseResult.data[Math.floor(baseResult.years || 0)].date} 
                      stroke="#10B981" 
                      strokeDasharray="5 5"
                      label={{ value: 'FIRE Date', position: 'insideBottomRight', fill: '#10B981', fontSize: 10, fontWeight: 'bold' }}
                    />
                  )}

                  {/* Contribution Period Markers */}
                  {contributions.map((c) => {
                    const fromYear = parseInt(c.from_date.split('-')[0]);
                    const startYear = new Date().getFullYear();
                    if (fromYear < startYear) return null;
                    
                    return (
                      <ReferenceArea 
                        key={c.id}
                        x1={fromYear.toString()}
                        x2={c.to_date ? c.to_date.split('-')[0] : (startYear + 60).toString()}
                        fill="#F8FAFC"
                        fillOpacity={0.5}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
               <div className="flex items-center"><div className="w-3 h-3 bg-indigo-500 rounded-sm mr-1.5 opacity-30" /> Base Projection</div>
               <div className="flex items-center"><div className="w-3 h-3 bg-indigo-100 rounded-sm mr-1.5" /> ±1% Market Variance</div>
               <div className="flex items-center"><div className="w-3 h-3 bg-emerald-500 rounded-sm mr-1.5 opacity-20 border border-emerald-500" /> Cumulative Principal</div>
               <div className="flex items-center"><div className="w-3 h-1 bg-amber-500 rounded-full mr-1.5 border-t border-dashed border-amber-500" /> FIRE Target</div>
            </div>
          </section>

          {/* Contribution Schedule */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Contribution Schedule</h2>
              <button 
                onClick={addPeriod}
                className="inline-flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-bold"
              >
                <Plus size={14} className="mr-1" /> Add Period
              </button>
            </div>

            {hasOverlap && (
              <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold">Overlapping Periods</p>
                  <p>Some contribution periods overlap in time. Projections may be inaccurate.</p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="py-3 px-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Label</th>
                    <th className="py-3 px-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly (€)</th>
                    <th className="py-3 px-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">From</th>
                    <th className="py-3 px-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">To</th>
                    <th className="py-3 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contributions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-gray-400 italic">No contribution periods defined.</td>
                    </tr>
                  ) : (
                    contributions.map(c => (
                      <tr key={c.id} className="group hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-2">
                          <input 
                            value={c.label} 
                            onChange={(e) => updatePeriod(c.id, { label: e.target.value })}
                            className="w-full bg-transparent border-none p-0 text-sm font-medium focus:ring-0 text-gray-900"
                          />
                        </td>
                        <td className="py-4 px-2">
                          <input 
                            type="number"
                            value={c.monthly_amount} 
                            onChange={(e) => updatePeriod(c.id, { monthly_amount: (parseFloat(e.target.value) || 0) || 0 })}
                            className="w-24 bg-transparent border-none p-0 text-sm font-bold focus:ring-0 text-indigo-600"
                          />
                        </td>
                        <td className="py-4 px-2">
                          <input 
                            type="month"
                            value={c.from_date} 
                            onChange={(e) => updatePeriod(c.id, { from_date: e.target.value })}
                            className="bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0"
                          />
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex items-center gap-2">
                            {c.to_date ? (
                              <input 
                                type="month"
                                value={c.to_date} 
                                onChange={(e) => updatePeriod(c.id, { to_date: e.target.value })}
                                className="bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0"
                              />
                            ) : (
                              <span className="text-xs text-gray-300 italic font-medium">Until retirement</span>
                            )}
                            <div className="flex items-center ml-auto">
                              <input 
                                type="checkbox"
                                checked={!c.to_date}
                                onChange={(e) => updatePeriod(c.id, { to_date: e.target.checked ? null : new Date().toISOString().slice(0, 7) })}
                                className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <label className="ml-1.5 text-[10px] text-gray-400 whitespace-nowrap">Open</label>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 text-right">
                          <button 
                            onClick={() => deletePeriod(c.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Variants Panel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-100 transition-colors cursor-default">
              <h3 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">Lean FIRE</h3>
              <div className="space-y-1 mb-4">
                <div className="text-xl font-bold text-gray-900">{formatCurrency(leanResult.target)}</div>
                <p className="text-[10px] text-gray-500">70% of current budget</p>
              </div>
              <div className="pt-3 border-t border-gray-50 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-700">{leanResult.reached ? leanResult.date : '---'}</div>
                <div className="text-[10px] text-gray-400">{leanResult.reached ? `${leanResult.years?.toFixed(1)}y` : 'Not reached'}</div>
              </div>
            </div>

            <div className="bg-indigo-600 p-5 rounded-2xl shadow-md border border-indigo-500 transform scale-105">
              <h3 className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-3">Regular FIRE</h3>
              <div className="space-y-1 mb-4">
                <div className="text-xl font-bold text-white">{formatCurrency(baseResult.target)}</div>
                <p className="text-[10px] text-indigo-200">100% of current budget</p>
              </div>
              <div className="pt-3 border-t border-indigo-400 flex items-center justify-between">
                <div className="text-xs font-bold text-white">{baseResult.reached ? baseResult.date : '---'}</div>
                <div className="text-[10px] text-indigo-200">{baseResult.reached ? `${baseResult.years?.toFixed(1)}y` : 'Not reached'}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-100 transition-colors cursor-default">
              <h3 className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-3">Fat FIRE</h3>
              <div className="space-y-1 mb-4">
                <div className="text-xl font-bold text-gray-900">{formatCurrency(fatResult.target)}</div>
                <p className="text-[10px] text-gray-500">150% of current budget</p>
              </div>
              <div className="pt-3 border-t border-gray-50 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-700">{fatResult.reached ? fatResult.date : '---'}</div>
                <div className="text-[10px] text-gray-400">{fatResult.reached ? `${fatResult.years?.toFixed(1)}y` : 'Not reached'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
