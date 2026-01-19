/*
  # Create Custom Types for Engagement Management

  This migration creates the foundational custom types needed for an engagement tracking system.

  ## New Custom Types

  ### 1. engagement_status
  An enum type that tracks the lifecycle of business engagements from initial prospect through completion:
  - `Prospect` - Initial potential engagement
  - `Submitted` - Proposal or application submitted
  - `Offer Extended` - Formal offer made to prospect
  - `Extension Request Sent` - Request for contract extension submitted
  - `Approved` - Engagement approved by relevant parties
  - `Booked` - Engagement officially scheduled/confirmed
  - `Active` - Engagement currently in progress
  - `Contract Ended` - Engagement completed as planned
  - `Cancelled` - Engagement terminated before completion
  - `Closed` - Engagement fully closed out
  - `Needs New Role` - Requires new engagement/role assignment

  ### 2. action_type
  An enum type that categorizes different actions that can be logged in the system:
  - `Outreach` - Initial or ongoing communication efforts
  - `Margin Approval` - Actions related to financial/margin approvals
  - `Follow-up` - Follow-up communications and activities
  - `Note` - General notes and documentation

  ## Purpose
  These types will serve as the foundation for engagement tracking tables and ensure data consistency across the application.
*/

-- Create engagement_status enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engagement_status') THEN
        CREATE TYPE engagement_status AS ENUM (
          'Prospect',
          'Submitted',
          'Offer Extended',
          'Extension Request Sent',
          'Approved',
          'Booked',
          'Active',
          'Contract Ended',
          'Cancelled',
          'Closed',
          'Needs New Role'
        );
    END IF;
END $$;

-- Create action_type enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'action_type') THEN
        CREATE TYPE action_type AS ENUM (
          'Outreach',
          'Margin Approval',
          'Follow-up',
          'Note'
        );
    END IF;
END $$;