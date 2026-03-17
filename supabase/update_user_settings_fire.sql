-- Update user_settings table to include FIRE-related columns
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_target_multiplier numeric DEFAULT 25,
ADD COLUMN IF NOT EXISTS fire_contributions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS fire_contribution_growth_rate numeric DEFAULT 0.02,
ADD COLUMN IF NOT EXISTS fire_contribution_growth_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fire_net_worth_override numeric;

-- fire_monthly_expenses, fire_return_rate, fire_inflation_rate already exist in the schema,
-- but let's ensure they have the correct defaults if they don't.
-- (This part is optional if they already exist with these defaults)
-- ALTER TABLE public.user_settings ALTER COLUMN fire_return_rate SET DEFAULT 0.07;
-- ALTER TABLE public.user_settings ALTER COLUMN fire_inflation_rate SET DEFAULT 0.02;
