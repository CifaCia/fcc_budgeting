-- Update user_settings table to include separate asset balances and interest rates
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_cash_balance numeric,
ADD COLUMN IF NOT EXISTS fire_etf_balance numeric,
ADD COLUMN IF NOT EXISTS fire_cash_interest_rate numeric DEFAULT 0.015;
