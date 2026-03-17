-- Add death year column for Die with Zero FIRE calculation
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_death_year int DEFAULT 2086;
