-- Studio areas and actions per person (P13-B3): NULL means every area within
-- the person's role (unchanged for everyone until an owner sets it).

ALTER TABLE admin_users ADD COLUMN modules JSONB;
