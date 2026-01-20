import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
    const { data, error } = await supabase
        .from('ai_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    console.log('--- RECENT AI AUDIT LOGS ---');
    data.forEach(log => {
        console.log(`[${log.created_at}] Func: ${log.function_name}`);
        console.log(`Input: ${log.input_message?.substring(0, 100)}...`);
        console.log(`Finish Reason: ${log.finish_reason}`);
        console.log(`Error: ${log.error_message}`);
        console.log(`Latency: ${log.latency_ms}ms`);
        if (log.error_details) console.log(`Details: ${JSON.stringify(log.error_details)}`);
        console.log('---------------------------');
    });
}

checkLogs();
