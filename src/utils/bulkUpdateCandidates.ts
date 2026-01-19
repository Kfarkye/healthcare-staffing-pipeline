import { supabase } from '../lib/supabase';

interface CandidateUpdate {
  candidate_id: number;
  name: string;
  nova_url: string;
}

const candidatesData: CandidateUpdate[] = [
  { candidate_id: 2462406, name: 'Aleah Cawthon', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2462406/new-profile/about' },
  { candidate_id: 1413071, name: 'Amy Kammerdiener', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1413071/new-profile/about' },
  { candidate_id: 2588867, name: 'Belinda Warren', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2588867/new-profile/about' },
  { candidate_id: 1442139, name: 'Cynthia Ononobi', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1442139/new-profile/about' },
  { candidate_id: 861032, name: 'David Fallmaier', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/861032/new-profile/about' },
  { candidate_id: 1577664, name: 'Eyerusalem Ashenafi', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1577664/new-profile/about' },
  { candidate_id: 4254046, name: 'Jahanna Perry-McElroy', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/4254046/new-profile/about' },
  { candidate_id: 2744391, name: 'Jeremy Jeter', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2744391/new-profile/about' },
  { candidate_id: 857592, name: 'Justin Lonergan', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/857592/new-profile/about' },
  { candidate_id: 3617024, name: 'Kailyn Alt', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/3617024/new-profile/about' },
  { candidate_id: 684652, name: 'Kathy Waldron', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/684652/new-profile/about' },
  { candidate_id: 1899044, name: 'Kinya Hopkins', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1899044/new-profile/about' },
  { candidate_id: 2724343, name: 'Marcie Lanning', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2724343/new-profile/about' },
  { candidate_id: 1959378, name: 'Mark Bodnar', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1959378/new-profile/about' },
  { candidate_id: 1751823, name: 'Mary Kargbo', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1751823/new-profile/about' },
  { candidate_id: 2722803, name: 'Megan Hopkins', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2722803/new-profile/about' },
  { candidate_id: 2502428, name: 'Nathan Welch', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/2502428/new-profile/about' },
  { candidate_id: 4080221, name: 'Rebeca Aguilar', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/4080221/new-profile/about' },
  { candidate_id: 3655114, name: 'Rose Laure Coichy', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/3655114/new-profile/about' },
  { candidate_id: 1624566, name: 'Sabrina Allahrakha', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1624566/new-profile/about' },
  { candidate_id: 1527267, name: 'Shanonn Barr', nova_url: 'https://nova.ayahealthcare.com/#/recruiting/candidates/1527267/new-profile/about' }
];

export async function bulkUpdateCandidates() {
  console.log('Starting bulk update of candidates...');

  const { data: existingCandidates, error: fetchError } = await supabase
    .from('candidates')
    .select('id, full_name, nova_id, nova_url');

  if (fetchError) {
    console.error('Error fetching candidates:', fetchError);
    return {
      successCount: 0,
      failCount: candidatesData.length,
      total: candidatesData.length,
      results: [{ status: 'error', message: fetchError.message }]
    };
  }

  console.log(`Found ${existingCandidates?.length || 0} candidates in database`);

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (const candidate of candidatesData) {
    try {
      const matchingCandidate = existingCandidates?.find(c =>
        c.full_name?.toLowerCase().includes(candidate.name.toLowerCase().split(' ')[0]) &&
        c.full_name?.toLowerCase().includes(candidate.name.toLowerCase().split(' ').slice(-1)[0])
      );

      if (!matchingCandidate) {
        console.log(`⚠ No match found for ${candidate.name}`);
        results.push({ name: candidate.name, status: 'not_found' });
        failCount++;
        continue;
      }

      const { data, error } = await supabase
        .from('candidates')
        .update({
          nova_id: candidate.candidate_id,
          nova_url: candidate.nova_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', matchingCandidate.id)
        .select();

      if (error) {
        console.error(`Error updating ${candidate.name}:`, error.message);
        results.push({ name: candidate.name, status: 'error', message: error.message });
        failCount++;
      } else if (data && data.length > 0) {
        console.log(`✓ Updated ${matchingCandidate.full_name} → ${candidate.name} (ID: ${candidate.candidate_id})`);
        results.push({
          name: candidate.name,
          dbName: matchingCandidate.full_name,
          status: 'success',
          id: candidate.candidate_id
        });
        successCount++;
      } else {
        console.log(`⚠ No update occurred for ${candidate.name}`);
        results.push({ name: candidate.name, status: 'no_update' });
        failCount++;
      }
    } catch (err) {
      console.error(`Exception updating ${candidate.name}:`, err);
      results.push({ name: candidate.name, status: 'exception', message: String(err) });
      failCount++;
    }
  }

  console.log(`\n=== Update Complete ===`);
  console.log(`Successful updates: ${successCount}`);
  console.log(`Failed updates: ${failCount}`);
  console.log(`Total candidates: ${candidatesData.length}`);

  return {
    successCount,
    failCount,
    total: candidatesData.length,
    results
  };
}
