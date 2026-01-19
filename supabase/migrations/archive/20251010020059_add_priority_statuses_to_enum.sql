/*
  # Add Priority Statuses to prospect_status Enum

  1. Changes
    - Add 'This Week' status for weekly priority tracking
    - Add 'Offer Out' status for offers in negotiation
    - Add 'Signed / Accepted' status for accepted offers

  2. Purpose
    - Enable the Weekly Priority Board feature
    - Track prospects through priority stages: This Week → Offer Out → Signed / Accepted
    - Preserves existing status values

  3. Notes
    - New enum values are added safely without affecting existing data
    - Previous prospect status is preserved in previous_status_info column
*/

-- Add new priority statuses to the prospect_status enum
ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'This Week';
ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'Offer Out';
ALTER TYPE prospect_status ADD VALUE IF NOT EXISTS 'Signed / Accepted';
