-- Smart contact forms (UI-F1, 30 Oct 2026): enquiries keep a second phone
-- number (E.164, only alongside the first). New phone numbers are stored in
-- E.164 and new countries as ISO 3166-1 alpha-2 codes; earlier enquiries keep
-- what they were submitted with.
ALTER TABLE enquiries ADD COLUMN phone_secondary TEXT CHECK (phone_secondary IS NULL OR length(phone_secondary) <= 32);
