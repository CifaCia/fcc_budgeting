const FX_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
};

export const convertToEUR = (amount: number, currency: string = 'EUR'): number => {
  const rate = FX_RATES[currency.toUpperCase()] || 1;
  return amount * rate;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};
