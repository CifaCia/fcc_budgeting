-- Add FIRE mode and withdrawal rate columns
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_mode text DEFAULT 'multiplier',
ADD COLUMN IF NOT EXISTS fire_withdrawal_rate numeric DEFAULT 0.04;
