-- Update transactions table to include row_hash for duplicate detection
ALTER TABLE public.transactions ADD COLUMN row_hash text;
CREATE UNIQUE INDEX idx_transactions_user_id_row_hash ON public.transactions (user_id, row_hash);
