-- Add move abroad columns
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS fire_move_abroad_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fire_move_abroad_year int DEFAULT 2035,
ADD COLUMN IF NOT EXISTS fire_move_abroad_tax_rate numeric DEFAULT 0.30;
