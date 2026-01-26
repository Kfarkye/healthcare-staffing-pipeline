-- ============================================================================
-- Migration: Cold Outreach Blast System
-- Description: Enables mass personalized outreach campaigns for travel positions
-- ============================================================================

-- 1. CAMPAIGNS TABLE - The blast itself (job + pay package)
CREATE TABLE cold_outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Job Details
    position_title TEXT NOT NULL,           -- "Exercise Physiologist"
    facility_name TEXT NOT NULL,            -- "Sparrow Eaton Hospital"
    facility_address TEXT,                  -- "321 E Harris St"
    city TEXT NOT NULL,                     -- "Charlotte"
    state TEXT NOT NULL,                    -- "MI"
    specialty TEXT,                         -- "SPORT"
    job_id TEXT,                            -- "3175580" (Aya Job ID)
    
    -- Contract Details
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    weeks_length INTEGER,
    shift_type TEXT,                        -- "Day", "Night", "Rotating"
    shifts_per_week INTEGER,                -- 5
    hours_per_shift INTEGER,                -- 8
    hours_per_week INTEGER,                 -- 40
    
    -- Pay Package
    taxable_hourly_rate DECIMAL(10,2),      -- 27.87
    overtime_hourly_rate DECIMAL(10,2),     -- 41.81
    weekly_meals_stipend DECIMAL(10,2),     -- 476.00
    weekly_housing_stipend DECIMAL(10,2),   -- 770.00
    total_weekly_stipends DECIMAL(10,2),    -- 1246.00
    gross_weekly_pay DECIMAL(10,2) NOT NULL,-- 2360.80
    
    -- Pay package screenshot (stored in Supabase Storage)
    pay_package_url TEXT,
    
    -- Campaign Metadata
    template_id UUID REFERENCES communication_templates(id),
    custom_hook TEXT,                       -- Personalized opening line
    custom_closing TEXT,                    -- Personalized closing
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'sending', 'sent', 'archived')),
    
    created_by TEXT DEFAULT 'kofi.farkye',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- 2. RECIPIENTS TABLE - Candidates in each blast
CREATE TABLE cold_outreach_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES cold_outreach_campaigns(id) ON DELETE CASCADE,
    
    -- Candidate Info
    first_name TEXT NOT NULL,
    last_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    nova_id TEXT,                           -- Aya candidate ID
    specialty TEXT,
    
    -- Generated Content
    generated_subject TEXT,
    generated_body TEXT,
    
    -- Send Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'sent', 'opened', 'replied', 'bounced', 'skipped')),
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    
    -- Tracking
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX idx_campaigns_status ON cold_outreach_campaigns(status);
CREATE INDEX idx_campaigns_created ON cold_outreach_campaigns(created_at DESC);
CREATE INDEX idx_recipients_campaign ON cold_outreach_recipients(campaign_id);
CREATE INDEX idx_recipients_status ON cold_outreach_recipients(status);
CREATE INDEX idx_recipients_email ON cold_outreach_recipients(email);

-- 4. AUTO-UPDATE TIMESTAMP
CREATE OR REPLACE FUNCTION update_cold_outreach_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_update_campaigns_timestamp
    BEFORE UPDATE ON cold_outreach_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_cold_outreach_timestamp();

-- 5. RLS POLICIES
ALTER TABLE cold_outreach_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cold_outreach_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON cold_outreach_campaigns
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON cold_outreach_recipients
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. COMMENTS
COMMENT ON TABLE cold_outreach_campaigns IS 'Cold outreach blast campaigns for travel healthcare positions';
COMMENT ON TABLE cold_outreach_recipients IS 'Individual recipients in each cold outreach campaign';
