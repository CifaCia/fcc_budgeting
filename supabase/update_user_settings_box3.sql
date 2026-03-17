-- Update user_settings table to include Box 3 wealth tax columns
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_box3_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fire_box3_model text DEFAULT 'new',
ADD COLUMN IF NOT EXISTS fire_box3_start_year int DEFAULT 2028,
ADD COLUMN IF NOT EXISTS fire_box3_fiscal_partner boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fire_box3_threshold numeric DEFAULT 57000,
ADD COLUMN IF NOT EXISTS fire_box3_return_allowance numeric DEFAULT 1800,
ADD COLUMN IF NOT EXISTS fire_box3_dividend_yield numeric DEFAULT 0.015,
ADD COLUMN IF NOT EXISTS fire_box3_tax_rate numeric DEFAULT 0.36;
