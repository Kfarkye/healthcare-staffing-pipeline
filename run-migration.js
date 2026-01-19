import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = readFileSync('./supabase/migrations/20251006000003_add_extension_stage.sql', 'utf8');

console.log('Running migration...');

// Note: This won't work with the anon key - we need service role
// But let's try anyway to see what happens
const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}

console.log('Migration successful!', data);
