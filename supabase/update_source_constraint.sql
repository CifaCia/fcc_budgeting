-- Remove the restrictive check constraint on source to allow flexible account names
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
