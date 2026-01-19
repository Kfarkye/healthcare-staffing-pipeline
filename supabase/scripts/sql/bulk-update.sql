-- Bulk update candidate IDs and Nova URLs
-- This SQL can be run directly in Supabase SQL Editor

UPDATE candidates
SET
  nova_id = updates.nova_id,
  nova_url = updates.nova_url,
  updated_at = NOW()
FROM (VALUES
  (2462406, 'Aleah Cawthon', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2462406/new-profile/about'),
  (1413071, 'Amy Kammerdiener', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1413071/new-profile/about'),
  (2588867, 'Belinda Warren', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2588867/new-profile/about'),
  (1442139, 'Cynthia Ononobi', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1442139/new-profile/about'),
  (861032, 'David Fallmaier', 'https://nova.ayahealthcare.com/#/recruiting/candidates/861032/new-profile/about'),
  (1577664, 'Eyerusalem Ashenafi', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1577664/new-profile/about'),
  (4254046, 'Jahanna Perry-McElroy', 'https://nova.ayahealthcare.com/#/recruiting/candidates/4254046/new-profile/about'),
  (2744391, 'Jeremy Jeter', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2744391/new-profile/about'),
  (857592, 'Justin Lonergan', 'https://nova.ayahealthcare.com/#/recruiting/candidates/857592/new-profile/about'),
  (3617024, 'Kailyn Alt', 'https://nova.ayahealthcare.com/#/recruiting/candidates/3617024/new-profile/about'),
  (684652, 'Kathy Waldron', 'https://nova.ayahealthcare.com/#/recruiting/candidates/684652/new-profile/about'),
  (1899044, 'Kinya Hopkins', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1899044/new-profile/about'),
  (2724343, 'Marcie Lanning', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2724343/new-profile/about'),
  (1959378, 'Mark Bodnar', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1959378/new-profile/about'),
  (1751823, 'Mary Kargbo', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1751823/new-profile/about'),
  (2722803, 'Megan Hopkins', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2722803/new-profile/about'),
  (2502428, 'Nathan Welch', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2502428/new-profile/about'),
  (4080221, 'Rebeca Aguilar', 'https://nova.ayahealthcare.com/#/recruiting/candidates/4080221/new-profile/about'),
  (3655114, 'Rose Laure Coichy', 'https://nova.ayahealthcare.com/#/recruiting/candidates/3655114/new-profile/about'),
  (1624566, 'Sabrina Allahrakha', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1624566/new-profile/about'),
  (1527267, 'Shanonn Barr', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1527267/new-profile/about')
) AS updates(nova_id, search_name, nova_url)
WHERE
  LOWER(candidates.full_name) LIKE '%' || LOWER(SPLIT_PART(updates.search_name, ' ', 1)) || '%'
  AND LOWER(candidates.full_name) LIKE '%' || LOWER(SPLIT_PART(updates.search_name, ' ', -1)) || '%';
