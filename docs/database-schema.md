# Database Schema Documentation

## Overview
This document provides a comprehensive overview of the healthcare staffing pipeline database schema, including all tables, columns, enums, relationships, and business rules.

## Enums

### engagement_status
Tracks the lifecycle of candidate engagements through the recruitment pipeline.
```sql
'Prospect' | 'Submitted' | 'Offer Extended' | 'Extension Request Sent' | 'Approved' | 'Booked' | 'Active' | 'Contract Ended' | 'Cancelled' | 'Closed' | 'Needs New Role' | 'Signed' | 'Submittal Ready' | 'Exited' | 'Extension Outreach Sent' | 'Extension Request Received' | 'Extension Approved' | 'Extension Signed' | 'Pre-Start (New)' | 'Pre-Start (Extension)' | 'Outreach'
```

### action_type
Categorizes different types of actions taken on engagements.
```sql
'Outreach' | 'Margin Approval' | 'Follow-up' | 'Note'
```

### prospect_status
Tracks prospects through the initial qualification pipeline.
```sql
'New' | 'Contacted' | 'Interested' | 'Profile Updates' | 'Submittal Ready' | 'Submitted' | 'Exited'
```

### click_status
Tracks interested clicks from job applications.
```sql
'New' | 'Contacted' | 'Submitted' | 'Closed'
```

### application_status
General application status tracking.
```sql
'New' | 'Contacted' | 'Submitted' | 'Offer' | 'Closed'
```

### hot_prospect_status
Status for high-priority prospects.
```sql
'New' | 'Contacted' | 'In Progress' | 'Archived'
```

## Core Tables

### prospects
Main table for managing candidate prospects through the submission pipeline.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `candidate_id` (bigint, unique) - External candidate ID from Nova
- `name` (text) - Candidate's full name
- `email` (text, unique) - Email address
- `phone` (text) - Phone number
- `specialty` (text) - Healthcare specialty (e.g., "ICU RN", "Medical Assistant")
- `profession` (text) - Broader profession category
- `recruiter` (text) - Assigned recruiter name
- `notes` (text) - General notes about the candidate
- `status` (prospect_status) - Current pipeline status
- `home_state` (text) - Candidate's home state
- `licenses` (text[]) - Array of state license abbreviations
- `references_verified` (integer, 0-2) - Number of references verified
- `profile_complete` (boolean) - Whether profile is submission-ready
- `available_start_date` (date) - When candidate can start
- `rto_notes` (text) - Requested time off notes
- `reassignment_requested_at` (timestamptz) - When reassignment was requested
- `order` (integer) - Display order within status column
- `nova_url` (text) - Direct link to Nova profile
- `created_at` (timestamptz) - Record creation time
- `updated_at` (timestamptz) - Last update time

**Example Row:**
```json
{
  "id": 1,
  "candidate_id": 4734592,
  "name": "Sarah Johnson",
  "email": "sarah.johnson@email.com",
  "phone": "555-123-4567",
  "specialty": "ICU RN",
  "profession": "Registered Nurse",
  "recruiter": "Kofi Farkye",
  "status": "Interested",
  "home_state": "CA",
  "licenses": ["CA", "TX", "NY"],
  "references_verified": 2,
  "profile_complete": true,
  "available_start_date": "2025-02-01",
  "rto_notes": "Dec 24-31 unavailable",
  "order": 0
}
```

### engagements_old
Primary table for tracking active assignments and contract lifecycle.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `candidate_id` (text) - External candidate ID
- `candidate_name` (text) - Candidate's full name
- `facility_name` (text) - Healthcare facility name
- `specialty` (text) - Position specialty
- `job_id` (text) - External job identifier
- `status` (engagement_status) - Current engagement status
- `start_date` (date) - Contract start date
- `end_date` (date) - Contract end date
- `margin_id` (text) - Margin calculator ID
- `contract_type` (text) - Type of contract
- `email` (text) - Candidate email
- `phone_number` (text) - Candidate phone
- `recruiter` (text) - Assigned recruiter
- `am_ac` (text) - Account Manager/Coordinator
- `cs_name` (text) - Client Services name
- `cl_name` (text) - Client Liaison name
- `bill_rate` (numeric) - Hourly bill rate
- `actual_margin` (numeric) - Actual margin percentage
- `target_margin` (numeric) - Target margin percentage
- `weekly_value` (numeric) - Weekly contract value
- `extension_stage` (text) - Extension pipeline stage
- `previous_extensions` (integer) - Count of previous extensions
- `notes` (text) - Assignment notes

**Example Row:**
```json
{
  "id": 1,
  "candidate_id": "4734592",
  "candidate_name": "Sarah Johnson",
  "facility_name": "UCLA Medical Center",
  "specialty": "ICU RN",
  "job_id": "3014168",
  "status": "Active",
  "start_date": "2025-01-15",
  "end_date": "2025-04-15",
  "margin_id": "7501867",
  "bill_rate": 85.00,
  "actual_margin": 12.5,
  "extension_stage": "outreach"
}
```

### job_openings
Available job positions with detailed information.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `job_id` (text, unique) - External job ID
- `facility_name` (text) - Healthcare facility
- `job_title` (text) - Position title
- `profession` (text) - Healthcare profession
- `specialty` (text) - Specific specialty
- `location_city` (text) - Job location city
- `location_state` (text) - Job location state
- `start_date` (date) - Position start date
- `posted_date` (date) - When job was posted
- `updated_date` (date) - Last update
- `open_positions` (integer) - Number of openings
- `total_submittals` (integer) - Total candidates submitted
- `employment_type` (text) - Contract type
- `shift` (text) - Shift pattern
- `gross_weekly` (numeric) - Weekly gross pay
- `aya_interview` (text) - Interview requirements
- `duration_weeks` (integer) - Contract duration

**Example Row:**
```json
{
  "job_id": "3014168",
  "facility_name": "UCLA Medical Center",
  "job_title": "ICU Registered Nurse",
  "profession": "Registered Nurse",
  "specialty": "ICU",
  "location_city": "Los Angeles",
  "location_state": "CA",
  "start_date": "2025-02-01",
  "open_positions": 3,
  "gross_weekly": 2800.00,
  "duration_weeks": 13
}
```

### pay_packages
Detailed compensation packages for specific job positions.

**Columns:**
- `job_id` (text, PK) - Links to job_openings
- `facility_name` (text) - Healthcare facility
- `city` (text) - Location city
- `state` (text) - Location state
- `specialty` (text) - Position specialty
- `hours_per_week` (integer) - Weekly hours
- `taxable_hourly_rate` (numeric) - Base hourly rate
- `stipend` (numeric) - Weekly stipend total
- `gross_weekly_pay` (numeric) - Total weekly compensation
- `completion_bonus` (numeric) - Contract completion bonus
- `meals_weekly` (numeric) - Weekly meal allowance
- `housing_weekly` (numeric) - Weekly housing allowance
- `total_stipend` (numeric) - Combined stipends
- `is_compliant` (boolean) - Meets minimum wage requirements
- `min_wage_applied` (numeric) - Applied minimum wage
- `source` (text) - Data source

**Example Row:**
```json
{
  "job_id": "3014168",
  "facility_name": "UCLA Medical Center",
  "taxable_hourly_rate": 45.00,
  "hours_per_week": 36,
  "meals_weekly": 350.00,
  "housing_weekly": 1050.00,
  "total_stipend": 1400.00,
  "gross_weekly_pay": 3020.00,
  "completion_bonus": 5000.00,
  "is_compliant": true
}
```

### interested_clicks
Tracks candidates who clicked "interested" on job postings.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `application_id` (bigint, unique) - Application identifier
- `application_date` (date) - When they applied
- `job_id` (text) - Job they're interested in
- `candidate_name` (text) - Candidate's name
- `candidate_email` (text) - Email address
- `candidate_homestate` (text) - Home state
- `job_city` (text) - Job location city
- `job_state` (text) - Job location state
- `profession` (text) - Healthcare profession
- `specialty` (text) - Specialty area
- `recruiter_name` (text) - Assigned recruiter
- `recruiter_email` (text) - Recruiter's email
- `last_note` (text) - Most recent note
- `last_note_date` (timestamptz) - When note was added
- `last_note_by` (varchar) - Who added the note
- `status` (click_status) - Current status

**Example Row:**
```json
{
  "application_id": 12345,
  "candidate_name": "Michael Chen",
  "candidate_email": "m.chen@email.com",
  "job_id": "3014168",
  "specialty": "ER RN",
  "job_city": "San Francisco",
  "job_state": "CA",
  "recruiter_name": "Kofi Farkye",
  "status": "New",
  "application_date": "2025-01-20"
}
```

### actions
Tracks all actions taken on engagements for audit and workflow purposes.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `engagement_id` (bigint) - Links to engagements_old
- `type` (action_type) - Type of action
- `content` (text) - Action details/notes
- `metadata` (jsonb) - Additional structured data
- `created_at` (timestamptz) - When action occurred

**Example Row:**
```json
{
  "engagement_id": 1,
  "type": "Outreach",
  "content": "Initial extension outreach sent via email",
  "metadata": {"email_subject": "Extension Opportunity", "template_used": "candidate_outreach"},
  "created_at": "2025-01-20T10:30:00Z"
}
```

### candidates
Master candidate database with contact and profile information.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `candidate_id` (bigint, unique) - External candidate ID
- `name` (text) - Full name
- `email` (text) - Email address
- `phone` (text) - Phone number
- `recruiter` (text) - Assigned recruiter
- `specialty` (text) - Primary specialty
- `last_login_date` (timestamptz) - Last platform login
- `registration_date` (date) - When they registered

### hot_prospects
High-priority prospects requiring immediate attention.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `candidate_id` (bigint, unique) - External candidate ID
- `name` (text) - Candidate name
- `email` (text) - Email address
- `phone` (text) - Phone number
- `specialty` (text) - Healthcare specialty
- `recruiter` (text) - Assigned recruiter
- `notes` (text) - Priority notes
- `status` (hot_prospect_status) - Current status
- `added_at` (timestamptz) - When added to hot list

## Supporting Tables

### gsa_rates
Government per diem rates for travel reimbursements.

**Columns:**
- `zip_code` (text) - Location zip code
- `state` (text) - State abbreviation
- `city` (text) - City name
- `county` (text) - County name
- `lodging_daily` (numeric) - Daily lodging allowance
- `meals_daily` (numeric) - Daily meal allowance
- `fiscal_year` (integer) - Applicable fiscal year

### aya_minimum_rates
Company minimum pay rates by profession and specialty.

**Columns:**
- `profession` (text) - Healthcare profession
- `specialty` (text) - Specific specialty
- `min_hourly_rate` (numeric) - Minimum hourly rate
- `state_override` (text) - State-specific override
- `effective_date` (date) - When rate became effective

### minimum_wages
Legal minimum wage requirements by location and profession.

**Columns:**
- `profession` (text) - Healthcare profession
- `specialty` (text) - Specialty area
- `state` (text) - State abbreviation
- `min_hourly` (numeric) - Minimum hourly rate
- `effective_date` (date) - Effective date

## Email and Communication Tables

### email_template_definitions
Reusable email templates with placeholders.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `template_type` (text, unique) - Template identifier
- `template_name` (text) - Human-readable name
- `subject_template` (text) - Email subject with placeholders
- `body_template` (text) - Email body with placeholders
- `placeholders` (jsonb) - Available placeholder definitions
- `is_active` (boolean) - Whether template is active

### generated_email_templates
AI-generated emails from templates and extracted data.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `template_definition_id` (bigint) - Links to email_template_definitions
- `prospect_id` (bigint) - Links to prospects
- `subject` (text) - Generated subject line
- `body` (text) - Generated email body
- `extracted_data` (jsonb) - Source data used for generation
- `template_name` (text) - Template used

### email_template_history
Audit trail of sent emails.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `contract_id` (text) - Related contract
- `candidate_id` (text) - Candidate identifier
- `template_type` (text) - Template used
- `subject` (text) - Email subject
- `body` (text) - Email content
- `recipients` (text) - Email recipients
- `sent_by` (text) - Who sent the email
- `sent_at` (timestamptz) - When sent

### outreach_templates
Job-specific outreach templates with pay package details.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `job_id` (text, unique) - Job identifier
- `facility_name` (text) - Facility name
- `specialty` (text) - Position specialty
- `location` (text) - Job location
- `gross_weekly_pay` (numeric) - Weekly compensation
- `email_subject` (text) - Generated subject
- `email_body` (text) - Generated body
- `engagement_id` (bigint) - Related engagement
- `candidate_name` (text) - Target candidate
- `candidate_email` (text) - Candidate email
- `template_type` (text) - Template category

## Workflow and Process Tables

### follow_up_actions
Tracks follow-up actions taken on engagements.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `engagement_id` (bigint) - Links to engagements_old
- `action_type` (text) - Type of follow-up
- `notes` (text) - Action notes
- `snooze_until` (date) - When to follow up again
- `created_at` (timestamptz) - Action timestamp

### task_completions
Tracks completion of dashboard tasks.

**Columns:**
- `task_id` (text, PK) - Unique task identifier
- `completed_at` (timestamptz) - Completion timestamp
- `completed_by` (text) - Who completed the task

### contract_missing_data
Tracks missing information needed for contracts.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `contract_id` (text) - Contract identifier
- `missing_fields` (text[]) - Array of missing field names
- `filled_fields` (jsonb) - Fields that have been filled
- `filled_by` (text) - Who filled the data
- `filled_at` (timestamptz) - When data was filled

## Financial and Compliance Tables

### contract_financials
Detailed financial information for contracts.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `engagement_id` (bigint, unique) - Links to engagements_old
- `candidate_id` (text) - Candidate identifier
- `base_pay_rate` (numeric) - Base hourly rate
- `ot_pay_rate` (numeric) - Overtime rate
- `base_bill_rate` (numeric) - Base bill rate
- `ot_bill_rate` (numeric) - Overtime bill rate
- `weekly_stipends` (numeric) - Weekly stipend amount
- `weekly_hours` (numeric) - Standard weekly hours
- `weekly_ot_hours` (numeric) - Overtime hours
- `target_margin` (numeric) - Target margin percentage
- `actual_margin` (numeric) - Actual margin percentage
- `total_contract_value` (numeric) - Total contract value
- `weekly_contract_value` (numeric) - Weekly value

### contract_data_cache
Cached contract data for performance optimization.

**Columns:**
- `contract_id` (text, PK) - Contract identifier
- `cached_data` (jsonb) - Cached contract information
- `updated_at` (timestamptz) - Cache timestamp

## Assignment Management Tables

### assignments
High-level assignment tracking linking candidates to jobs.

**Columns:**
- `job_id` (text, PK) - Job identifier (links all contracts/extensions)
- `candidate_id` (bigint) - Candidate identifier
- `facility_id` (bigint) - Facility identifier
- `specialty` (text) - Position specialty
- `recruiter` (text) - Assigned recruiter
- `created_at` (timestamptz) - Assignment creation

### contracts
Individual contract periods within an assignment.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `assignment_job_id` (text) - Links to assignments
- `start_date` (date) - Contract start
- `end_date` (date) - Contract end
- `bill_rate` (numeric) - Hourly bill rate
- `status` (text) - Contract status
- `pay_package_details` (jsonb) - Detailed compensation
- `extension_stage` (text) - Extension pipeline stage

### facilities
Master facility directory.

**Columns:**
- `id` (bigint, PK) - Unique identifier
- `name` (text, unique) - Facility name
- `created_at` (timestamptz) - Record creation

## Key Views

### job_openings_with_pay
Combines job openings with pay package information.

### active_assignments_view
Enriched view of active assignments with candidate and financial data.

### priority_interested_clicks
Prioritized view of interested clicks requiring immediate attention.

### actionable_dashboard_tasks
Unified task list across all workflows.

## Business Rules

### Prospect Pipeline Rules
1. **Status Progression**: Prospects move through: New → Contacted → Interested → Profile Updates → Submittal Ready → Submitted
2. **Submittal Requirements**: Must have 2 references, complete profile, licenses, and availability
3. **Reassignment Trigger**: Moving from "Contacted" to "Interested" may trigger reassignment request
4. **Order Management**: Each status column maintains display order for prioritization

### Engagement Lifecycle Rules
1. **Status Mapping**: Live list statuses map to engagement_status enum values
2. **Extension Timing**: Outreach begins 8 weeks before contract end
3. **Margin Requirements**: Extensions require margin approval before proceeding
4. **Unique Constraints**: One engagement per candidate-job combination

### Pay Package Compliance
1. **Minimum Wage**: All packages must meet state and federal minimums
2. **Aya Minimums**: Company minimums override legal minimums when higher
3. **California Healthcare**: Special CA healthcare worker minimums apply
4. **GSA Rates**: Travel stipends based on government per diem rates

### Data Integrity Rules
1. **Candidate IDs**: Must be unique across all tables
2. **Job IDs**: Link job_openings, pay_packages, and engagements
3. **Email Uniqueness**: Prospect emails must be unique
4. **Date Validation**: End dates must be after start dates
5. **Reference Limits**: Maximum 2 references per prospect

### Workflow Automation
1. **Task Generation**: System generates tasks based on engagement status and timing
2. **Real-time Updates**: Changes propagate across views via database triggers
3. **Audit Trail**: All actions logged in actions table
4. **Template Processing**: AI extracts data and populates email templates

## Security and Access

### Row Level Security (RLS)
- **prospects**: Enabled with policies for authenticated users
- **hot_prospects**: Enabled with full CRUD access for authenticated users
- **email_template_definitions**: Enabled with read access for active templates
- **outreach_templates**: Enabled with full access for anon and authenticated users

### Policies
- Most tables allow full access to authenticated users
- Some tables (like job_openings) allow public read access
- Email templates have restricted access based on active status

## Indexes and Performance

### Key Indexes
- **prospects**: candidate_id, email, created_at, status
- **engagements_old**: candidate_id+status, status+end_date, extension_stage
- **job_openings**: job_id, facility_name, specialty, location_state, gross_weekly
- **pay_packages**: job_id (primary key)
- **actions**: engagement_id, type, created_at

### Composite Indexes
- **engagements_old**: (candidate_id, job_id) for uniqueness
- **prospects**: (candidate_id) for external system integration
- **contract_financials**: (engagement_id) for financial lookups

This schema supports a complete healthcare staffing pipeline from initial candidate interest through contract completion, with comprehensive tracking, automation, and compliance features.