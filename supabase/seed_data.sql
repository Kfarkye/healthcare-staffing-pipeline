-- Communication Templates
INSERT INTO public.communication_templates (name, category, subject_template, body_template, required_variables, description)
VALUES 
('extension_request', 'active', 'Extension Opportunity @ {{facility_name}}', 'Hi {{candidate_name}},\n\nYour contract ends on {{end_date}}. {{facility_name}} loves you! Want to extend?', '["facility_name", "candidate_name", "end_date"]', 'Standard extension request'),
('check_in', 'active', 'Checking in!', 'Hi {{candidate_name}}, how is week {{week_num}} going?', '["candidate_name", "week_num"]', 'Weekly checkin');

-- Prospects
INSERT INTO public.prospects (candidate_id, name, email, phone, specialty, status, home_state, nova_url)
VALUES 
(2588867, 'Belinda J.', 'belinda@example.com', '555-0101', 'ICU', 'New', 'CA', 'https://nova.aya.com/2588867'),
(3001001, 'Cynthia Ononobi', 'cynthia.o@example.com', '555-0102', 'Med Surg', 'Interested', 'TX', 'https://nova.aya.com/3001001'),
(3001002, 'Joi Ford', 'joi.ford@example.com', '555-0103', 'Phlebotomist', 'Interested', 'GA', 'https://nova.aya.com/3001002'),
(1551687, 'Julia Goelz', NULL, NULL, NULL, 'New', NULL, 'https://nova.ayahealthcare.com/#/recruiting/candidates/1551687/new-profile/about');

-- Engagements
INSERT INTO public.engagements (prospect_id, start_date, end_date, facility_name, specialty, status, bill_rate)
SELECT id, '2026-01-01', '2026-04-01', 'Sharp Memorial', 'ICU', 'Active', 125.00
FROM public.prospects WHERE candidate_id = 2588867;
