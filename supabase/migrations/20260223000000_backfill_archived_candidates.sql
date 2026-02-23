-- Backfill candidates from archived data into the prospects table.
-- These were in the old `candidates` table but never migrated to `prospects`.

INSERT INTO public.prospects (candidate_id, name, nova_url, status)
VALUES
  (1551687, 'Julia Goelz', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1551687/new-profile/about', 'New'),
  (1725501, 'Maame Tiwaah Ahenkora', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1725501/new-profile/about', 'New'),
  (2662039, 'Rachel M Henderson', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2662039/new-profile/about', 'New'),
  (2630489, 'John Steele Barile', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2630489/new-profile/about', 'New'),
  (1413071, 'Amy Kammerdiener', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1413071/new-profile/about', 'New'),
  (3988011, 'Breana Daniels', 'https://nova.ayahealthcare.com/#/recruiting/candidates/3988011/new-profile/about', 'New'),
  (1577664, 'Eyerusalem Ashenafi', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1577664/new-profile/about', 'New'),
  (1676272, 'Mekdes Hailu', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1676272/new-profile/about', 'New'),
  (1460224, 'Biruktawit Bati', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1460224/new-profile/about', 'New'),
  (857592, 'Justin Lonergan', 'https://nova.ayahealthcare.com/#/recruiting/candidates/857592/new-profile/about', 'New'),
  (1023902, 'Gary Deshong', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1023902/new-profile/about', 'New'),
  (3009006, 'Aykia Taybron', 'https://nova.ayahealthcare.com/#/recruiting/candidates/3009006/new-profile/about', 'New'),
  (3883187, 'Ryan Jensen', 'https://nova.ayahealthcare.com/#/recruiting/candidates/3883187/new-profile/about', 'New'),
  (2502428, 'Nathan Welch', 'https://nova.ayahealthcare.com/#/recruiting/candidates/2502428/new-profile/about', 'New'),
  (4575231, 'Sarah Bennington', 'https://nova.ayahealthcare.com/#/recruiting/candidates/4575231/new-profile/about', 'New'),
  (1847529, 'Mary Okoye', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1847529/new-profile/about', 'New'),
  (4044997, 'Kaimen Donayre', 'https://nova.ayahealthcare.com/#/recruiting/candidates/4044997/new-profile/about', 'New'),
  (1688790, 'Jacqueline Judie', 'https://nova.ayahealthcare.com/#/recruiting/candidates/1688790/new-profile/about', 'New'),
  (380299, 'Gerald Newman', 'https://nova.ayahealthcare.com/#/recruiting/candidates/380299/new-profile/about', 'New'),
  (4556619, 'Aba Mills', 'https://nova.ayahealthcare.com/#/recruiting/candidates/4556619/new-profile/about', 'New')
ON CONFLICT (candidate_id) DO NOTHING;
