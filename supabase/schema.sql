-- Create transactions table
CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date date NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    description text,
    category text,
    source text CHECK (source IN ('abn_amro', 'degiro', 'trade_republic')),
    asset_type text CHECK (asset_type IN ('cash', 'stock', 'etf', 'other')),
    raw_csv_row jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Create snapshots table
CREATE TABLE public.snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    snapshot_date date NOT NULL,
    net_worth numeric NOT NULL,
    breakdown jsonb,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Create budget_items table
CREATE TABLE public.budget_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category text NOT NULL,
    expected_monthly numeric NOT NULL,
    is_fixed boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Create user_settings table
CREATE TABLE public.user_settings (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    fire_target numeric,
    fire_target_multiplier numeric DEFAULT 25,
    fire_monthly_expenses numeric,
    fire_return_rate numeric DEFAULT 0.07,
    fire_inflation_rate numeric DEFAULT 0.02,
    fire_contributions jsonb DEFAULT '[]'::jsonb,
    fire_contribution_growth_rate numeric DEFAULT 0.02,
    fire_contribution_growth_enabled boolean DEFAULT false,
    fire_net_worth_override numeric,
    fire_box3_enabled boolean DEFAULT false,
    fire_box3_model text DEFAULT 'new',
    fire_box3_start_year int DEFAULT 2028,
    fire_box3_fiscal_partner boolean DEFAULT false,
    fire_box3_threshold numeric DEFAULT 57000,
    fire_box3_return_allowance numeric DEFAULT 1800,
    fire_box3_dividend_yield numeric DEFAULT 0.015,
    fire_box3_tax_rate numeric DEFAULT 0.36,
    reminder_email text,
    reminder_day_of_month int DEFAULT 1
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Users can only access their own transactions" ON public.transactions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own snapshots" ON public.snapshots
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own budget items" ON public.budget_items
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);
