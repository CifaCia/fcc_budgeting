# Monthly Email Reminders Setup

This feature uses Supabase Edge Functions and Resend to send monthly email reminders to users.

## 1. Database Migration
Run the following SQL in your Supabase SQL Editor:

\`\`\`sql
-- Add reminders_enabled column to user_settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean DEFAULT false;
\`\`\`

## 2. Environment Variables
You need to set the following secrets in Supabase:

\`\`\`bash
supabase secrets set RESEND_API_KEY=re_xxx...
supabase secrets set APP_URL=https://your-app-url.com
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=ey... (already present usually)
\`\`\`

## 3. Schedule the Edge Function
Enable \`pg_cron\` in your Supabase project (Settings -> Database -> Extensions) and run:

\`\`\`sql
select cron.schedule(
  'daily-reminder-check', 
  '0 8 * * *', 
  $$
  select
    net.http_post(
      url:='https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-reminders',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);
\`\`\`

> Replace \`<YOUR_PROJECT_REF>\` and \`<YOUR_SUPABASE_SERVICE_ROLE_KEY>\` with your project's values.

## 4. Deploy the Edge Function
Run the following command from the project root:

\`\`\`bash
supabase functions deploy send-reminders
\`\`\`
