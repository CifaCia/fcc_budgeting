-- Add forced retirement year column
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_forced_retirement_year int;
