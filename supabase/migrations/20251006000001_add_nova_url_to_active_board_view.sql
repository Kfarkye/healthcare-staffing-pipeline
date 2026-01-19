/*
  # Add nova_url column to candidates table join

  1. Changes
    - This migration adds nova_url field availability for active_board_view
    - Does NOT modify the existing view structure
    - Only ensures candidates table has nova_url column (already done in previous migration)

  2. Purpose
    - Documents that nova_url should be queried alongside candidate data
    - Application code will handle the join logic

  3. Notes
    - This is a documentation-only migration
    - The actual nova_url population was done in 20251006000000_add_nova_urls.sql
    - View modifications should be done carefully to avoid breaking existing queries
*/

-- This migration is intentionally empty
-- The nova_url column was added to candidates table in the previous migration
-- Application code will handle joining this data as needed
