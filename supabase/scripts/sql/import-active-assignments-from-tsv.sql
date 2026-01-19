-- Import Active Assignments from TSV Data
-- This directly loads your 87 travelers into the active_assignments table

BEGIN;

-- Create temporary staging table
CREATE TEMP TABLE staging_assignments (
    candidate_id TEXT,
    candidate_name TEXT,
    start_date TEXT,
    end_date TEXT,
    facility_name TEXT,
    job_number TEXT,
    extra_1 TEXT,
    extra_2 TEXT,
    extra_3 TEXT,
    extra_4 TEXT,
    extra_5 TEXT,
    extra_6 TEXT
);

-- Load your TSV data
COPY staging_assignments FROM stdin;
4254046	Jahanna Perry-McElroy	7/20/25	10/11/25	Northwestern Medicine Palos Hospital	7345129	Aya ClearedClient Cleared	7/16/25	Not Started		AM: Mitchell Moon	AC: Northwestern Support	Francis O'Donohue
2724343	Marcie Lanning	7/13/25	10/11/25	PeaceHealth Saint Joseph Medical Center	7250689	Aya ClearedClient Cleared	6/10/25	Confirmed Received		AM: Adam Raize	AC: Jordyn Hetherington	Jenny Neiman
2744391	Jeremy Jeter	7/13/25	10/11/25	PeaceHealth Saint Joseph Medical Center	7250692	Aya ClearedClient Cleared	6/10/25	Confirmed Received		AM: Adam Raize	AC: Jordyn Hetherington	Jenny Neiman
3655114	Rose Laure Coichy	7/14/25	10/11/25	Broaddus Hospital	7357104	Aya ClearedClient Cleared	7/11/25	Sent to Traveler		AM: Sophia Backlund	AC: Jessica Puckett	Carla Nunez
1562877	Mamanagbe Keita	7/7/25	10/11/25	LBH - Levindale Hebrew Geriatric Center and Hospital	7339837	Aya ClearedClient Cleared	6/27/25	Confirmed Received		AM: Morgan Parrott	AC: Ashley Nwasike	Rene Argueta
2488549	Fontaine Joseph	7/6/25	10/11/25	Newark Beth Israel Medical Center	7357726	Aya ClearedClient Cleared	6/30/25	Not Started		AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
1625033	Olakunle Oladipupo	6/29/25	10/11/25	Newark Beth Israel Medical Center	7278021	Aya ClearedClient Cleared	6/20/25	Confirmed Received		AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
2462406	Aleah Cawthon	7/16/25	10/12/25	Harborview Medical Center	7258415	Aya ClearedClient Cleared	7/10/25	Sent to Traveler		AM: Chelsea Sanderson	AC: UW Support	Milano Fatho
4156652	Tyler Arrington	7/14/25	10/18/25	Piedmont Cartersville Medical Center	7306461	Aya ClearedClient Cleared	7/7/25	Sent to Traveler	7/14/25	AM: Morgan Webber	AC: Piedmont Support	Michelle Miranda
871309	Adrienne Bristow	7/27/25	10/18/25	Evanston Hospital	7229571	Client Cleared	6/4/25	Confirmed Received	7/27/25	AM: Kendyl Pritchett	AC: Sydney Smejkal	Meg Rich
1442469	Ifeoma Ofili	7/7/25	10/18/25	Cooperman Barnabas Medical Center	7253749	Aya ClearedClient Cleared	6/25/25	Confirmed Received		AM: Trisha Lawrence-Rott	AC: Kynisha Payton	Lori Birney
2661565	Omar Duggan	7/15/25	10/18/25	Newark Beth Israel Medical Center	7261254	Aya ClearedClient Cleared	6/25/25	Not Started	7/15/25	AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
2939324	Marta Muczynska	7/14/25	10/19/25	DHIP - Duke Med Specialties Cary - LotusTime	7299895	Aya ClearedClient Cleared	7/1/25	Confirmed Received		AM: Anthony Marshall	AC: Nicholas Juarez	Dominique Tuason
1574434	Priscilla Nguyen	8/25/25	10/25/25	Sutter Health Bay Oakland Flu Clinic Float Pool	7491369	Aya ClearedClient Cleared	8/19/25	Sent to Traveler		AM: Quinton Reed	AC: Chloe Nassi	Sonia Parnoutsoukian
4047746	Kimberly Shante Brown	7/21/25	10/25/25	Ventura County Medical Center	7310976	Aya ClearedClient Cleared	7/15/25	Confirmed Received	7/21/25	AM: Laura Kremicki	AC: Jess Raines	Mary Dolap
861032	David Fallmaier	7/28/25	10/25/25	Advocate Condell Medical Center	7489150	Aya ClearedClient Cleared	7/25/25	Confirmed Received	7/28/25	AM: Nicole Faucette	AC: Hazel Espanol	Blake Lund
4378569	Morgan King	7/28/25	10/25/25	Saint Davids South Austin Medical Center	7382059	Aya ClearedClient Cleared	7/18/25	Sent to Traveler	7/28/25	AM: Adriana Minicozzi	AC: Michael Del Rosario	Kacie Brogger
1625284	Jared DeVico	7/27/25	10/25/25	Newark Beth Israel Medical Center	7261561	Aya ClearedClient Cleared	6/13/25	Not Started	7/27/25	AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
1751823	Mary Kargbo	8/3/25	10/25/25	Rehabilitation Hospital of Bowie	7106498	Aya ClearedClient Cleared	7/28/25	Sent to Traveler		AM: Josh MacGregor	AC: Joiza Pulis	Blake Lund
4136205	Keante Dixon	7/28/25	10/26/25	Harborview Medical Center	7296845	Client Cleared	6/27/25	Not Started		AM: Chelsea Sanderson	AC: UW Support	Milano Fatho
3595107	Angela Pavlak	8/3/25	10/27/25	CGH Medical Center	7320491	Client Cleared	7/7/25	Not Started		AM: Amanda Senorans	AC: Jared Martin Barcelo	Griffith Cook-Kirsch
2661517	Suzette Forrest	8/4/25	11/1/25	University of New Mexico Hospital	7350560	Aya ClearedClient Cleared	7/24/25	Sent to Traveler		AM: Lindsay Gag	AC: Sierra Mendoza	Elizabeth Weber
1624566	Sabrina Allahrakha	7/27/25	11/1/25	LBH - Northwest Hospital	7279650	Aya ClearedClient Cleared	7/1/25	Confirmed Received		AM: Morgan Parrott	AC: Ashley Nwasike	Sarah Douglas
3740773	Brooke Rich	8/4/25	11/1/25	William P Clements Jr University Hospital	7334221	Aya ClearedClient Cleared	7/22/25	Confirmed Received		AM: Madison Johnson	AC: Autumn Brown	Velia Nunez
4196648	Oscar Grimaldo	8/10/25	11/1/25	Piedmont Eastside Medical Center	7347657	Client Cleared	7/16/25	Not Started		AM: Rachel Sanchez	AC: Piedmont Support	Gabby McCune
4118987	Reynaldo Herevia III	8/3/25	11/1/25	Providence Saint Mary Medical Center - Apple Valley	7378602	Client Cleared	7/28/25	Confirmed Received		AM: Brittney Wismer	AC: socalprovidencesupport @ayahealthcare.com	Lindsay Ayala
1956159	Bienvenido Tirado Guillen	8/4/25	11/2/25	Harborview Medical Center	7327260	Client Cleared	7/9/25	Confirmed Received	8/4/25	AM: Chelsea Sanderson	AC: UW Support	Milano Fatho
684652	Kathy Waldron	9/7/25	11/2/25	Piedmont Athens Regional Medical Center	7416276	Client Cleared	8/11/25	Not Started	9/7/25	AM: Rachel Sanchez	AC: Piedmont Support	Ashley Casella
1478260	Teima Gayflor	8/11/25	11/8/25	Ohio State University Hospital	7489871	Aya ClearedClient Cleared	7/24/25	Confirmed Received		AM: Daniel Crutcher	AC: Ohio State University Support	Yasania Allen-Ozuna
1311663	Nibras Oraha	9/14/25	11/8/25	Stanford Children's Hospital	7487334	Client Cleared	9/6/25	Not Started	9/14/25	AM: Shelby Cohen	AC: Caitlin Perez	Jordan Wells
1566408	Shawntina Nixon	8/12/25	11/8/25	SSM Health Saint Louis University Hospital	7428650	Client Cleared	8/11/25	Confirmed Received	8/12/25	AM: Dannielle Collins (Vaya)	AC: SSM Health Support	Amanda Murphy
1799066	Merrick Barker	7/24/25	11/8/25	Providence Portland Medical Center	7454442	Client Cleared	7/21/25	Not Started		AM: Megan Morgan	AC: ircprovidencesupport @ayahealthcare.com	Velia Nunez
3801743	Kristopher Simms	8/4/25	11/9/25	Duke University Hospital - LotusTime	7251838	Aya ClearedClient Cleared	6/10/25	Not Started	8/4/25	AM: Anthony Marshall	AC: Nicholas Juarez	Dominique Tuason
1812576	Pauline Anne Abella	8/17/25	11/15/25	Rochester General Hospital	7343591	Client Cleared	7/9/25	Not Started		AM: Jillian Makowski	AC: RRH Aya	Lindsay Fulton
2866284	Angela Townsel	8/19/25	11/15/25	John H. Stroger Junior Hospital of Cook County	7459527	Aya ClearedClient Cleared	8/15/25	Sent to Traveler		AM: Joseph Lowman	AC: Cook County Support	Hayley Reider
2615117	Amber Akers	8/19/25	11/15/25	LPNT East SOVAH Danville Regional Medical Center	7361283	Aya ClearedClient Cleared	8/13/25	Sent to Traveler	8/19/25	AM: Jordan Jackson	AC: Amy Uyeda	Jasmine Smith
798323	Bobbie Eubanks	9/21/25	11/15/25	Billings Clinic - Billings Hospital	7490794	Client Cleared	9/8/25	Not Started	9/21/25	AM: Kelli Kuenn	AC: Danisse Arellano	Amanda Murphy
4000998	Emily Torres	6/29/25	11/21/25	Mid County Health Center	7303788	Client Cleared	6/2/25	Not Started	6/29/25	AM: Brooke Bajor	AC: Karen Apacible	Omar Camarena
4132893	Matthue Tompkins	9/15/25	11/22/25	St. Tammany Parish Health System	7486330	Aya ClearedClient Cleared	9/9/25	Confirmed Received		AM: Ashley Belarmino	AC: St Tammany AC	Mariska Sackey
4557897	Sebastian Fraser	8/27/25	11/22/25	Barnes-Jewish Extended Care	7456260	Aya ClearedClient Cleared	8/26/25	In Possession	8/27/25	AM: Jordan Bixler	AC: Rhogie Saladero	Katelynn Vega
3515731	Brittany Kite	8/27/25	11/22/25	Barnes-Jewish Extended Care	7410495	Aya ClearedClient Cleared	8/25/25	In Possession	8/27/25	AM: Jordan Bixler	AC: Rhogie Saladero	Katelynn Vega
1660378	Debora Smith	8/25/25	11/22/25	Novant Health Presbyterian Medical Center Crisis Response	7444790	Aya ClearedClient Cleared	8/13/25	Sent to Traveler	8/25/25	AM: Lindsay Marmon	AC: Caitlane Fallon	Mark Tupas
1865945	Alexandre Wing	8/26/25	11/22/25	Doctors Community Medical Center	7389416	Aya ClearedClient Cleared	8/20/25	In Possession	8/26/25	AM: Matt Lorence	AC: Gretchen Ann.Palisoc Palisoc	Amanda Wentworth
2800698	Jennifer Davenport	8/24/25	11/22/25	Jersey City Medical Center	7389026	Client Cleared	7/31/25	Not Started		AM: Trisha Lawrence-Rott	AC: Kynisha Payton	Lori Birney
2722803	Megan Hopkins	8/24/25	11/22/25	The Cleveland Clinic Main Campus	7336361	Aya ClearedClient Cleared	8/11/25	Not Started	8/24/25	AM: Makayla McMillen	AC: ClevelandClinic Support	Cassidy Leroy
4587841	Vanessa Clermont	8/18/25	11/22/25	Baptist Hospitals of Southeast Texas	7426636	Aya ClearedClient Cleared	8/12/25	Sent to Traveler		AM: Mandie Liess	AC: Christian Rayandayan	Carla Nunez
4274545	Alexander Anisimov	8/24/25	11/26/25	Newark Beth Israel Medical Center	7379909	Aya ClearedClient Cleared	7/25/25	Confirmed Received	8/24/25	AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
2588867	Belinda Warren	8/31/25	11/29/25	Ventura County Medical Center	7409590	Aya ClearedClient Cleared	8/7/25	Not Started		AM: Laura Kremicki	AC: Jess Raines	Mary Dolap
2831206	Jodi Goodson	9/2/25	11/29/25	IU Health Arnett Hospital	7415784	Aya ClearedClient Cleared	8/25/25	Confirmed Received	9/2/25	AM: Madison Maxwell	AC: iuhealth Support	Tiffany Soria
2710664	Ashley Ellis	8/31/25	11/30/25	Select Specialty Hospital - Quad Cities	7421688	Aya ClearedClient Cleared	8/12/25	Not Started		AM: David Gonzales	AC: Ederlinda Guieb	Wes Caudle
4258509	Kimvy Lor	9/8/25	12/6/25	UC Irvine Medical Center	7427726	Aya ClearedClient Cleared	8/26/25	Confirmed Received	9/8/25	AM: Paul Landeros	AC: Maile Owen	Ashley Casella
1899044	Kinya Hopkins	8/31/25	12/6/25	Sutter Health Coast Hospital	7444419	Aya ClearedClient Cleared	8/21/25	Not Started		AM: Quinton Reed	AC: Chloe Nassi	Savannah Baffert
1442139	Cynthia Ononobi	9/14/25	12/13/25	Rehabilitation Hospital of Bowie	7517317	Client Cleared	8/6/25	Confirmed Received		AM: Josh MacGregor	AC: Joiza Pulis	Blake Lund
1503947	Chequita McClain	10/5/25	12/13/25	Prisma Health Tuomey Hospital	7402368	Aya ClearedClient Cleared	8/7/25	Not Started		AM: Alyssa Mansfield Reid	AC: Prisma EC	Lisa Batten
4042680	Therese Franzese	9/16/25	12/13/25	Medical City Arlington	7409914	Aya ClearedClient Cleared	9/9/25	Sent to Traveler		AM: Adriana Minicozzi	AC: Michael Del Rosario	Israel Lopez
2638910	Jane Turner	9/14/25	12/13/25	Mary Washington Hospital	7373294	Client Cleared	7/28/25	Not Started	9/14/25	AM: Amy Jeffreys	AC: Ariane Baldoza	Andrew Pugh
1725501	Maame Tiwaah Ahenkora	9/14/25	12/13/25	Jersey City Medical Center	7421255	Client Cleared	8/12/25	Not Started		AM: Trisha Lawrence-Rott	AC: Kynisha Payton	Lori Birney
2662039	Rachel M Henderson	9/7/25	12/13/25	UK Albert B. Chandler Hospital	7301633	Aya ClearedClient Cleared	8/29/25	Sent to Traveler	9/7/25	AM: Lindsay Ferriss	AC: UK Support	Nicole Schettl
2630489	John Steele Barile	9/14/25	12/14/25	Robert Wood Johnson University Hospital New Brunswick	7475040	Aya ClearedClient Cleared	9/12/25	Confirmed Received		AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
1413071	Amy Kammerdiener	9/22/25	12/20/25	CAMC General Hospital	7544328	Client Cleared	9/18/25	Sent to Traveler	9/22/25	AM: Tori Dent	AC: Jessica Puckett	Maria Bolanos
3988011	Breana Daniels	9/23/25	12/20/25	Providence Saint Jude Medical Center	7525561	Aya ClearedClient Cleared	9/17/25	Sent to Traveler		AM: Brittney Wismer	AC: socalprovidencesupport @ayahealthcare.com	Lindsay Ayala
1551687	Julia Goelz	9/21/25	12/20/25	Robert Wood Johnson University Hospital New Brunswick	7451195	Aya ClearedClient Cleared	8/28/25	Not Started	9/21/25	AM: Matthew Chausse	AC: Marlena Daugherty	JR Valenzuela
1577664	Eyerusalem Ashenafi	9/29/25	12/20/25	UPMC Pinnacle Harrisburg	7486404	Client Cleared	8/18/25	Not Started	9/29/25	AM: Sandy Macedo	AC: Sarah Jessica Kyle Cruz	Abigail Herrera
1676272	Mekdes Hailu	9/29/25	12/20/25	UPMC Pinnacle Harrisburg	7486387	Client Cleared	8/18/25	Not Started	9/29/25	AM: Sandy Macedo	AC: Sarah Jessica Kyle Cruz	Abigail Herrera
1460224	Biruktawit Bati	9/29/25	12/20/25	UPMC Pinnacle Harrisburg	7486346	Client Cleared	8/18/25	Not Started	9/29/25	AM: Sandy Macedo	AC: Sarah Jessica Kyle Cruz	Abigail Herrera
857592	Justin Lonergan	9/22/25	12/20/25	Hendrick Medical Center	7521408	Client Cleared	9/18/25	Confirmed Received	9/22/25	AM: Christine Stanko	AC: TPC Support	Nichole Ursillo
1023902	Gary Deshong	9/28/25	12/20/25	The Cleveland Clinic Main Campus - Respiratory	7397908	Aya ClearedClient Cleared	9/22/25	Not Started		AM: Taylor Minton	AC: ClevelandClinic Support	Cassidy Leroy
3009006	Aykia Taybron	9/15/25	12/21/25	DHIP - Duke Women's Health Heritage - LotusTime	7468048	Aya ClearedClient Cleared	8/29/25	Not Started	9/15/25	AM: Anthony Marshall	AC: Nicholas Juarez	Dominique Tuason
3883187	Ryan Jensen	9/27/25	12/25/25	Hillsboro Medical Center	7464291	Aya ClearedClient Cleared	8/27/25	Confirmed Received		AM: Samantha Bennett	AC: OHSU Support	Jillian Satele
2502428	Nathan Welch	9/29/25	12/27/25	Billings Clinic - Billings Hospital	7459188	Client Cleared	9/23/25	Confirmed Received	9/29/25	AM: Kelli Kuenn	AC: Danisse Arellano	Amanda Murphy
4575231	Sarah Bennington	9/28/25	12/27/25	Ohio State University Hospital	7451471	Client Cleared	8/5/25	Not Started	9/28/25	AM: Daniel Crutcher	AC: Ohio State University Support	Benjamin Schmiemeier
1847529	Mary Okoye	9/29/25	12/27/25	UC Davis Medical Center - Allied - WBP	7559040	Aya ClearedClient Cleared	9/24/25	Sent to Traveler	9/29/25	AM: Danielle Presson	AC: Ana Mora	Ashley Casella
4044997	Kaimen Donayre	6/23/25	12/30/25	UCSF Health Medical Center at China Basin	7462680	Aya ClearedClient Cleared	6/16/25	Confirmed Received		AM: Nate Sanger	AC: UCSF Support	Audrey Prado
1688790	Jacqueline Judie	9/29/25	1/3/26	Monmouth Medical Center	7441517	Aya ClearedClient Cleared	9/5/25	Confirmed Received	9/29/25	AM: Trisha Lawrence-Rott	AC: Kynisha Payton	JR Valenzuela
380299	Gerald Newman	10/6/25	1/3/26	Saint Josephs University Medical Center	7566047	Aya ClearedClient Cleared	10/3/25	Sent to Traveler	10/6/25	AM: Brandi Tolliver	AC: Mayline Labatete	Kevin Nguyen
790534	Alecia Steptoe	10/7/25	1/3/26	Hurley Medical Center	7501867	Aya ClearedClient Cleared	9/30/25	Confirmed Received		AM: Tyler Anthoney	AC: Jerold Thompson	Jesse Jacobs
4556619	Aba Mills	10/3/25	1/3/26	The Cleveland Clinic Main Campus	7564221	Aya ClearedClient Cleared	9/30/25	Confirmed Received		AM: Makayla McMillen	AC: ClevelandClinic Support	Cassidy Leroy
1322428	Emily Welch	10/6/25	1/3/26	Methodist Le Bonheur Germantown Hospital	7513225	Aya ClearedClient Cleared	9/29/25	Sent to Traveler		AM: Kayla Maffin	AC: Carly Heppler	Megan McKinzie
991913	Jade Byrd	10/5/25	1/3/26	Le Bonheur Childrens Hospital	7555511	Client Cleared	10/2/25	Not Started	10/5/25	AM: Kayla Maffin	AC: Carly Heppler	Megan McKinzie
1726375	Teresa Walker	8/24/25	1/10/26	Novant Health Matthews Medical Center	7380356	Client Cleared	7/30/25	Not Started		AM: Monica Brattich	AC: Kelty Stafford	Lori Birney
1679237	Dudlene Jean Pierre	10/5/25	1/10/26	Jersey City Medical Center	7504838	Client Cleared	9/16/25	Confirmed Received		AM: Trisha Lawrence-Rott	AC: Kynisha Payton	Lori Birney
1527267	Shanonn Barr	10/6/25	1/17/26	Health First Viera Hospital	7547590	Aya ClearedClient Cleared	10/2/25	Sent to Traveler		AM: Zach Pieklik	AC: Diego Paniagua	Ashlee Cacciatore
2461331	Christopher Julin	8/3/25	1/31/26	Sutter Health Alta Bates Summit Medical Center Ashby	7190851	Aya ClearedClient Cleared	7/22/25	Confirmed Received	8/3/25	AM: Quinton Reed	AC: Chloe Nassi	Savannah Baffert
3627582	Maritza Rodriguez	10/5/25	1/31/26	University of New Mexico Hospital	7524899	Client Cleared	9/19/25	In Possession		AM: Lindsay Gag	AC: Sierra Mendoza	Elizabeth Weber
1880787	Christine Ann Hamisi	9/30/25	2/1/26	Harborview Medical Center	7525176	Client Cleared	9/18/25	Confirmed Received		AM: Chelsea Sanderson	AC: UW Support	Milano Fatho
1959378	Mark Bodnar	8/27/25	2/22/26	Duke University Hospital - LotusTime	7410354	Client Cleared	8/26/25	Not Started	8/27/25	AM: Anthony Marshall	AC: Nicholas Juarez	Dominique Tuason
1260268	Tiffany Howard	9/24/25	3/22/26	Duke University Hospital - LotusTime	7439722	Aya ClearedClient Cleared	9/11/25	Confirmed Received	9/24/25	AM: Anthony Marshall	AC: Nicholas Juarez	Dominique Tuason
\.

-- Insert into active_assignments
INSERT INTO public.active_assignments (
    candidate_id,
    candidate_name,
    facility_name,
    start_date,
    end_date,
    job_number,
    notes,
    extension_stage,
    is_prestart,
    is_looking_for_new_facility,
    is_exiting,
    created_at,
    updated_at
)
SELECT
    s.candidate_id::bigint,
    s.candidate_name,
    s.facility_name,
    TO_DATE(s.start_date, 'MM/DD/YY'),
    TO_DATE(s.end_date, 'MM/DD/YY'),
    s.job_number,
    'Imported on ' || CURRENT_DATE || ' - ' || s.extra_3 AS notes,
    CASE LOWER(s.extra_3)
        WHEN 'not started' THEN 'not_started'
        WHEN 'confirmed received' THEN 'interested'
        WHEN 'sent to traveler' THEN 'outreach'
        WHEN 'in possession' THEN 'requested'
        ELSE 'not_started'
    END AS extension_stage,
    TO_DATE(s.start_date, 'MM/DD/YY') > CURRENT_DATE AS is_prestart,
    false AS is_looking_for_new_facility,
    false AS is_exiting,
    NOW(),
    NOW()
FROM staging_assignments s
ON CONFLICT DO NOTHING;

-- Show results
DO $$
DECLARE
    total_count INTEGER;
    new_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM public.active_assignments;
    SELECT COUNT(*) INTO new_count FROM public.active_assignments WHERE created_at > NOW() - INTERVAL '1 minute';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUCCESS! Active Assignments Imported';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'New assignments created: %', new_count;
    RAISE NOTICE 'Total assignments in database: %', total_count;
    RAISE NOTICE '========================================';
END $$;

-- Cleanup
DROP TABLE staging_assignments;

COMMIT;

-- ============================================================================
-- VERIFICATION: View Your Active Assignments
-- ============================================================================

SELECT
    candidate_id,
    candidate_name,
    facility_name,
    start_date,
    end_date,
    end_date - CURRENT_DATE AS days_to_end,
    extension_stage,
    is_prestart,
    job_number
FROM public.active_assignments
ORDER BY end_date
LIMIT 30;
