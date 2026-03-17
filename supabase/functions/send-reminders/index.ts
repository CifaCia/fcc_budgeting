import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const APP_URL = Deno.env.get('APP_URL')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const isTest = body.test === true
    
    const today = new Date().getUTCDate()
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date())

    let users = []
    
    if (isTest && body.email) {
      const { data: authUser } = await supabase
        .from('user_settings')
        .select('user_id, reminder_email')
        .eq('reminder_email', body.email)
        .maybeSingle()
      
      users = [{ 
        user_id: authUser?.user_id || 'test-user', 
        reminder_email: body.email 
      }]
    } else {
      const { data, error: usersError } = await supabase
        .from('user_settings')
        .select('user_id, reminder_email, reminder_day_of_month')
        .eq('reminders_enabled', true)
        .eq('reminder_day_of_month', today)
        .not('reminder_email', 'is', null)

      if (usersError) throw usersError
      users = data || []
    }

    const results = []

    for (const userSettings of users) {
      const { data: snapshots } = await supabase
        .from('snapshots')
        .select('net_worth, snapshot_date')
        .eq('user_id', userSettings.user_id)
        .order('snapshot_date', { ascending: false })
        .limit(2)

      const latestSnapshot = snapshots?.[0]
      const previousSnapshot = snapshots?.[1]

      const netWorth = latestSnapshot?.net_worth || 0
      const prevNetWorth = previousSnapshot?.net_worth || 0
      const momChange = netWorth - prevNetWorth
      const momChangePercent = prevNetWorth !== 0 ? (momChange / Math.abs(prevNetWorth)) * 100 : 0

      const formatter = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: 'Finance App <onboarding@resend.dev>',
          to: [userSettings.reminder_email],
          subject: `💰 Time to update your finances — ${monthName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #4f46e5;">Hello ${userSettings.reminder_email},</h2>
              <p>It's that time of the month! Don't forget to update your transactions and snapshots to keep your finances on track.</p>
              
              <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Latest Net Worth</p>
                <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #111827;">${formatter.format(netWorth)}</p>
                
                <p style="margin: 15px 0 0 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">MoM Change</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: ${momChange >= 0 ? '#059669' : '#dc2626'};">
                  ${momChange >= 0 ? '+' : ''}${formatter.format(momChange)} (${momChangePercent.toFixed(1)}%)
                </p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${APP_URL}" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">Open App</a>
              </div>

              <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                To stop receiving these reminders, visit your <a href="${APP_URL}/settings" style="color: #4f46e5;">Settings</a> page.
              </p>
            </div>
          `
        })
      })

      const emailData = await res.json()
      results.push({ email: userSettings.reminder_email, success: res.ok, data: emailData })
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
