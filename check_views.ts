
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hixjxztrblfjbwavyyph.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeGp4enRyYmxmamJ3YXZ5eXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDY4ODgsImV4cCI6MjA4NDM4Mjg4OH0.yZ_QjZSmsAhfhzFX0v76rdhLu0WnhoFgGk72qQ6mPvg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkViews() {
    const views = ['prospects_dashboard', 'submittals_dashboard', 'active_assignments_dashboard', 'follow_ups_dashboard'];

    for (const view of views) {
        const { data, error } = await supabase.from(view).select('*').limit(1);
        if (error) {
            console.error(`View ${view} ERROR:`, error.message);
        } else {
            console.log(`View ${view} OK:`, data.length, 'rows found');
        }
    }
}

checkViews();
