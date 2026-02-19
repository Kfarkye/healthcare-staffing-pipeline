-- ============================================================================
-- WEISSACH PIPELINE SEED DATA
-- 5 real candidates with full relational data for tool testing.
-- ============================================================================

-- ── Facilities ──────────────────────────────────────────────────────────────

INSERT INTO facilities (id, name, system_name, city, state, trauma_level, bed_count, special_requirements, account_manager, min_bill_rate, max_bill_rate) VALUES
('f1000000-0000-0000-0000-000000000001', 'Robert Wood Johnson University Hospital', 'RWJBarnabas Health', 'New Brunswick', 'NJ', 'Level 1', 965, 'NJ state license required, BLS/ACLS', 'Morgan Webber', 85, 120),
('f1000000-0000-0000-0000-000000000002', 'Piedmont Atlanta Hospital', 'Piedmont Healthcare', 'Atlanta', 'GA', 'Level 2', 600, 'GA license or compact, ACLS', 'Sarah Chen', 75, 105),
('f1000000-0000-0000-0000-000000000003', 'Valley Medical Center', 'Valley Health System', 'Renton', 'WA', 'Level 3', 303, 'WA license required', 'Jake Torres', 90, 130),
('f1000000-0000-0000-0000-000000000004', 'Memorial Hermann - Texas Medical Center', 'Memorial Hermann', 'Houston', 'TX', 'Level 1', 1060, 'TX license or compact, BLS', 'Morgan Webber', 80, 115),
('f1000000-0000-0000-0000-000000000005', 'Johns Hopkins Hospital', 'Johns Hopkins Health', 'Baltimore', 'MD', 'Level 1', 1162, 'MD license, BLS/ACLS/PALS varies by unit', 'Sarah Chen', 95, 140)
ON CONFLICT (id) DO NOTHING;

-- ── Jobs ────────────────────────────────────────────────────────────────────

INSERT INTO jobs (id, facility_id, title, specialty, bill_rate, margin_target, duration_weeks, shift, hours_per_week, start_date, status) VALUES
('j1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'CST - Operating Room', 'CST', 95, 25, 13, 'Day 5x8', 40, '2026-03-10', 'open'),
('j1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'GI/Endo Technician', 'GI/Endo Tech', 88, 22, 13, 'Day 5x8', 40, '2026-03-17', 'open'),
('j1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003', 'Registered Respiratory Therapist', 'RRT', 110, 28, 13, 'Night 3x12', 36, '2026-04-07', 'open'),
('j1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000004', 'RN ICU', 'RN ICU', 105, 26, 13, 'Night 3x12', 36, '2026-03-24', 'open'),
('j1000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000005', 'RN Stepdown/PCU', 'RN Stepdown', 115, 30, 13, 'Day 3x12', 36, '2026-04-14', 'open'),
('j1000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000001', 'RN Stepdown', 'RN Stepdown', 100, 24, 13, 'Night 3x12', 36, '2026-04-01', 'open')
ON CONFLICT (id) DO NOTHING;

-- ── Candidates ──────────────────────────────────────────────────────────────

INSERT INTO candidates (id, name, email, phone, specialty, sub_specialty, profession, years_experience, available_date, home_state, preferred_locations, pay_floor, housing_pref, communication_style, preferred_contact, nova_id, recruiter, status) VALUES
('c1000000-0000-0000-0000-000000000001', 'Adrienne Bristow', 'adrienne.bristow@email.com', '555-101-2001', 'CST', 'Cardiovascular', 'Certified Surgical Technologist', 8, '2026-03-01', 'NJ', ARRAY['NJ','NY','PA'], 1800, 'stipend', 'direct', 'phone', '1001001', 'Kofi Farkye', 'active'),
('c1000000-0000-0000-0000-000000000002', 'Kenneth Squazzo', 'kenneth.squazzo@email.com', '555-102-2002', 'GI/Endo Tech', 'Endoscopy', 'GI Technician', 12, '2026-03-15', 'GA', ARRAY['GA','FL','SC'], 1650, 'company', 'nurturing', 'email', '1001002', 'Kofi Farkye', 'active'),
('c1000000-0000-0000-0000-000000000003', 'Julia Goelz', 'julia.goelz@email.com', '555-103-2003', 'RRT', 'NICU Respiratory', 'Registered Respiratory Therapist', 6, '2026-04-01', 'WA', ARRAY['WA','OR','CA'], 2100, 'stipend', 'data_driven', 'text', '1001003', 'Kofi Farkye', 'active'),
('c1000000-0000-0000-0000-000000000004', 'Vonderrica Martin', 'vonderrica.martin@email.com', '555-104-2004', 'RN ICU', 'Stepdown', 'Registered Nurse', 10, '2026-03-20', 'TX', ARRAY['TX','LA','OK'], 2200, 'stipend', 'direct', 'phone', '1001004', 'Kofi Farkye', 'active'),
('c1000000-0000-0000-0000-000000000005', 'Maria Felipe', 'maria.felipe@email.com', '555-105-2005', 'RN Stepdown', NULL, 'Registered Nurse', 4, '2026-04-10', 'MD', ARRAY['MD','VA','DC'], 1900, 'no_preference', 'nurturing', 'email', '1001005', 'Kofi Farkye', 'active')
ON CONFLICT (id) DO NOTHING;

-- ── Licenses ────────────────────────────────────────────────────────────────

INSERT INTO licenses (candidate_id, state, license_number, is_compact, expiration_date, status, verification) VALUES
-- Adrienne Bristow (CST)
('c1000000-0000-0000-0000-000000000001', 'NJ', 'NJ-CST-88421', false, '2027-06-30', 'active', 'https://newjersey.mylicense.com/verification'),
('c1000000-0000-0000-0000-000000000001', 'NY', 'NY-CST-44210', false, '2027-03-15', 'active', NULL),
-- Kenneth Squazzo (GI/Endo)
('c1000000-0000-0000-0000-000000000002', 'GA', 'GA-TECH-33019', false, '2026-12-31', 'active', NULL),
('c1000000-0000-0000-0000-000000000002', 'FL', 'FL-TECH-77201', false, '2026-04-15', 'active', NULL),
-- Julia Goelz (RRT)
('c1000000-0000-0000-0000-000000000003', 'WA', 'WA-RRT-55102', false, '2027-09-30', 'active', 'https://doh.wa.gov/licenses'),
('c1000000-0000-0000-0000-000000000003', 'OR', 'OR-RRT-22983', false, '2026-03-01', 'expired', NULL),
-- Vonderrica Martin (RN ICU)
('c1000000-0000-0000-0000-000000000004', 'TX', 'TX-RN-991204', true, '2027-12-31', 'active', 'https://www.bon.texas.gov/verification'),
('c1000000-0000-0000-0000-000000000004', 'LA', 'LA-RN-448812', false, '2026-08-15', 'active', NULL),
-- Maria Felipe (RN Stepdown)
('c1000000-0000-0000-0000-000000000005', 'MD', 'MD-RN-331205', true, '2027-05-31', 'active', 'https://mbon.maryland.gov/verification'),
('c1000000-0000-0000-0000-000000000005', 'VA', 'VA-RN-110923', false, '2026-02-28', 'expired', NULL);

-- ── Certifications ──────────────────────────────────────────────────────────

INSERT INTO certifications (candidate_id, name, issuer, expiration_date, status) VALUES
-- Adrienne
('c1000000-0000-0000-0000-000000000001', 'CST', 'NBSTSA', '2027-12-31', 'active'),
('c1000000-0000-0000-0000-000000000001', 'BLS', 'AHA', '2026-09-15', 'active'),
('c1000000-0000-0000-0000-000000000001', 'CSFA', 'NBSTSA', '2027-12-31', 'active'),
-- Kenneth
('c1000000-0000-0000-0000-000000000002', 'BLS', 'AHA', '2026-06-30', 'active'),
('c1000000-0000-0000-0000-000000000002', 'SGNA Endo Cert', 'SGNA', '2026-03-10', 'active'),
-- Julia
('c1000000-0000-0000-0000-000000000003', 'RRT', 'NBRC', '2027-08-31', 'active'),
('c1000000-0000-0000-0000-000000000003', 'ACLS', 'AHA', '2026-02-15', 'expired'),
('c1000000-0000-0000-0000-000000000003', 'BLS', 'AHA', '2026-11-30', 'active'),
('c1000000-0000-0000-0000-000000000003', 'NRP', 'AAP', '2027-01-15', 'active'),
-- Vonderrica
('c1000000-0000-0000-0000-000000000004', 'ACLS', 'AHA', '2027-03-31', 'active'),
('c1000000-0000-0000-0000-000000000004', 'BLS', 'AHA', '2027-03-31', 'active'),
('c1000000-0000-0000-0000-000000000004', 'CCRN', 'AACN', '2026-10-15', 'active'),
-- Maria
('c1000000-0000-0000-0000-000000000005', 'ACLS', 'AHA', '2026-07-31', 'active'),
('c1000000-0000-0000-0000-000000000005', 'BLS', 'AHA', '2026-12-15', 'active');

-- ── Assignments (past and active) ───────────────────────────────────────────

INSERT INTO assignments (candidate_id, facility_id, job_id, specialty, start_date, end_date, status, bill_rate, pay_rate, stipend_weekly, gross_weekly, end_reason, would_rehire) VALUES
-- Adrienne: active assignment at RWJ
('c1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', NULL, 'CST', '2025-12-15', '2026-03-15', 'active', 95, 42, 1200, 1880, NULL, NULL),
-- Kenneth: completed assignment at Piedmont
('c1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', NULL, 'GI/Endo Tech', '2025-09-01', '2025-12-01', 'completed', 88, 38, 1100, 1620, 'contract_end', true),
-- Vonderrica: active at Memorial Hermann, ending soon
('c1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000004', NULL, 'RN ICU', '2025-12-30', '2026-03-30', 'active', 105, 52, 1400, 2272, NULL, NULL);

-- ── Submittals ──────────────────────────────────────────────────────────────

INSERT INTO submittals (candidate_id, job_id, facility_id, status, submitted_at) VALUES
-- Julia submitted to Valley Medical
('c1000000-0000-0000-0000-000000000003', 'j1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003', 'under_review', '2026-02-10'),
-- Maria submitted to Johns Hopkins
('c1000000-0000-0000-0000-000000000005', 'j1000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000005', 'interview_scheduled', '2026-02-05'),
-- Vonderrica submitted to RWJ Stepdown (after current ends)
('c1000000-0000-0000-0000-000000000004', 'j1000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000001', 'submitted', '2026-02-18'),
-- Adrienne submitted to Piedmont
('c1000000-0000-0000-0000-000000000001', 'j1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'offer_extended', '2026-01-20');

-- ── Contact Log ─────────────────────────────────────────────────────────────

INSERT INTO contact_log (candidate_id, channel, direction, outcome, subject, body_preview, created_at) VALUES
('c1000000-0000-0000-0000-000000000001', 'phone', 'outbound', 'connected', 'Extension discussion', 'Discussed extending at RWJ through June. Interested if rate bumps.', '2026-02-17 14:30:00+00'),
('c1000000-0000-0000-0000-000000000001', 'email', 'outbound', 'sent', 'Piedmont GI/Endo Opportunity', 'Sent pay package for Piedmont opening.', '2026-02-15 09:00:00+00'),
('c1000000-0000-0000-0000-000000000002', 'phone', 'outbound', 'voicemail', 'Check-in re: availability', 'Left VM about March availability.', '2026-02-14 11:00:00+00'),
('c1000000-0000-0000-0000-000000000002', 'text', 'inbound', 'received', NULL, 'Hey Kofi - available March 15. Interested in GA or FL.', '2026-02-14 16:22:00+00'),
('c1000000-0000-0000-0000-000000000003', 'email', 'outbound', 'sent', 'Valley Medical RRT - Submittal Confirmation', 'Confirmed submittal to Valley Medical. Interview pending.', '2026-02-10 10:00:00+00'),
('c1000000-0000-0000-0000-000000000003', 'phone', 'inbound', 'connected', 'Julia callback', 'Julia called back re: ACLS renewal. Scheduling for next week.', '2026-02-12 13:15:00+00'),
('c1000000-0000-0000-0000-000000000004', 'phone', 'outbound', 'connected', 'Assignment end planning', 'Discussed next steps after Memorial Hermann ends 3/30.', '2026-02-16 15:00:00+00'),
('c1000000-0000-0000-0000-000000000004', 'email', 'outbound', 'sent', 'RWJ Stepdown Opportunity', 'Sent details for NJ RN Stepdown opening.', '2026-02-18 08:30:00+00'),
('c1000000-0000-0000-0000-000000000005', 'email', 'outbound', 'sent', 'Hopkins Interview Prep', 'Sent interview prep and logistics for JHH Stepdown.', '2026-02-06 09:30:00+00'),
('c1000000-0000-0000-0000-000000000005', 'text', 'outbound', 'sent', NULL, 'Hi Maria - just sent over the interview prep doc. Let me know if questions!', '2026-02-06 09:35:00+00');

-- ── Notes ───────────────────────────────────────────────────────────────────

INSERT INTO notes (note_type, content, candidate_id) VALUES
-- Adrienne
('preference', 'Prefers day shift 5x8. Will consider 4x10 if pay is right.', 'c1000000-0000-0000-0000-000000000001'),
('relationship', 'Husband works in Trenton — needs to stay within commuting distance of central NJ.', 'c1000000-0000-0000-0000-000000000001'),
('clinical', 'Experienced in cardiovascular, ortho, and neuro cases. Prefers open heart teams.', 'c1000000-0000-0000-0000-000000000001'),
-- Kenneth
('preference', 'Wants company housing. Very particular about cleanliness — flag previous complaints.', 'c1000000-0000-0000-0000-000000000002'),
('red_flag', 'Late cancellation on last assignment day 2 — said was a family emergency. Verify pattern.', 'c1000000-0000-0000-0000-000000000002'),
('clinical', '12 years endo experience. ERCP trained. Comfortable with bronchoscopy.', 'c1000000-0000-0000-0000-000000000002'),
-- Julia
('clinical', 'NICU and adult ICU vent management. Strong ABG interpretation.', 'c1000000-0000-0000-0000-000000000003'),
('compliance', 'ACLS expired 2/15/2026. Must renew before any ICU-adjacent placement.', 'c1000000-0000-0000-0000-000000000003'),
('preference', 'Prefers night shift. Open to 3x12 or 4x10. No 5x8.', 'c1000000-0000-0000-0000-000000000003'),
-- Vonderrica
('clinical', '10 years ICU and Stepdown. CRRT trained. Charge nurse experience.', 'c1000000-0000-0000-0000-000000000004'),
('preference', 'Wants to stay in TX/LA corridor. Open to nights or days. Needs 2 weeks RTO in July for family reunion.', 'c1000000-0000-0000-0000-000000000004'),
('relationship', 'Very responsive. Prefers phone calls over email. Best reached after 3pm CT.', 'c1000000-0000-0000-0000-000000000004'),
-- Maria
('clinical', 'Stepdown/PCU focus. Comfortable with cardiac drips, post-cath, and NIV.', 'c1000000-0000-0000-0000-000000000005'),
('red_flag', 'VA license expired 2/28/2026. Cannot work in VA until renewed.', 'c1000000-0000-0000-0000-000000000005'),
('preference', 'Prefers east coast. Interested in DC metro or Baltimore. Would consider Philly.', 'c1000000-0000-0000-0000-000000000005');

-- Notes attached to facilities
INSERT INTO notes (note_type, content, facility_id) VALUES
('general', 'Excellent traveler reviews. Strong orientation program. Known for retaining travelers.', 'f1000000-0000-0000-0000-000000000001'),
('compliance', 'Strict credentialing timeline — 6 weeks lead time minimum for new travelers.', 'f1000000-0000-0000-0000-000000000005');
