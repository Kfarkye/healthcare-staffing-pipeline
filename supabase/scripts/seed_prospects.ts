/**
 * Seed prospects table with archived candidates.
 *
 * Run from your local machine (needs network access to Supabase):
 *   npx tsx supabase/scripts/seed_prospects.ts
 *
 * Uses the anon key by default (RLS is open). Set SUPABASE_SERVICE_ROLE_KEY
 * for full access if needed.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hixjxztrblfjbwavyyph.supabase.co';
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpeGp4enRyYmxmamJ3YXZ5eXBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4MDY4ODgsImV4cCI6MjA4NDM4Mjg4OH0.yZ_QjZSmsAhfhzFX0v76rdhLu0WnhoFgGk72qQ6mPvg';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CANDIDATES = [
    { candidate_id: 1551687, name: 'Julia Goelz', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1551687/new-profile/about' },
    { candidate_id: 1725501, name: 'Maame Tiwaah Ahenkora', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1725501/new-profile/about' },
    { candidate_id: 2662039, name: 'Rachel M Henderson', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2662039/new-profile/about' },
    { candidate_id: 2630489, name: 'John Steele Barile', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2630489/new-profile/about' },
    { candidate_id: 1413071, name: 'Amy Kammerdiener', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1413071/new-profile/about' },
    { candidate_id: 3988011, name: 'Breana Daniels', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/3988011/new-profile/about' },
    { candidate_id: 1577664, name: 'Eyerusalem Ashenafi', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1577664/new-profile/about' },
    { candidate_id: 1676272, name: 'Mekdes Hailu', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1676272/new-profile/about' },
    { candidate_id: 1460224, name: 'Biruktawit Bati', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1460224/new-profile/about' },
    { candidate_id: 857592, name: 'Justin Lonergan', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/857592/new-profile/about' },
    { candidate_id: 1023902, name: 'Gary Deshong', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1023902/new-profile/about' },
    { candidate_id: 3009006, name: 'Aykia Taybron', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/3009006/new-profile/about' },
    { candidate_id: 3883187, name: 'Ryan Jensen', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/3883187/new-profile/about' },
    { candidate_id: 2502428, name: 'Nathan Welch', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2502428/new-profile/about' },
    { candidate_id: 4575231, name: 'Sarah Bennington', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/4575231/new-profile/about' },
    { candidate_id: 1847529, name: 'Mary Okoye', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1847529/new-profile/about' },
    { candidate_id: 4044997, name: 'Kaimen Donayre', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/4044997/new-profile/about' },
    { candidate_id: 1688790, name: 'Jacqueline Judie', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1688790/new-profile/about' },
    { candidate_id: 380299, name: 'Gerald Newman', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/380299/new-profile/about' },
    { candidate_id: 4556619, name: 'Aba Mills', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/4556619/new-profile/about' },
];

async function seed() {
    console.log(`Connecting to ${SUPABASE_URL}...`);

    // Check existing data
    const { data: existing, error: checkErr } = await supabase
        .from('prospects')
        .select('candidate_id, name')
        .limit(50);

    if (checkErr) {
        console.error('Failed to query prospects table:', checkErr.message);
        process.exit(1);
    }

    console.log(`Current prospects in table: ${existing?.length ?? 0}`);
    if (existing?.length) {
        for (const p of existing) {
            console.log(`  - ${p.name} (${p.candidate_id})`);
        }
    }

    // Upsert candidates
    const { data, error } = await supabase
        .from('prospects')
        .upsert(
            CANDIDATES.map(c => ({ ...c, status: 'New' })),
            { onConflict: 'candidate_id', ignoreDuplicates: true }
        )
        .select('candidate_id, name');

    if (error) {
        console.error('Insert failed:', error.message);
        process.exit(1);
    }

    console.log(`\nInserted/verified ${data?.length ?? 0} candidates`);

    // Verify
    const { data: verify } = await supabase
        .from('prospects')
        .select('candidate_id, name, status, nova_url')
        .in('candidate_id', [1551687, 2588867]);

    console.log('\nVerification:');
    for (const p of verify || []) {
        console.log(`  ${p.name} (${p.candidate_id}) - ${p.status} - ${p.nova_url ? 'has Nova URL' : 'no Nova URL'}`);
    }
}

seed().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
