ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean DEFAULT false;
