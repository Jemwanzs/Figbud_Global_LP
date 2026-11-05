-- Refer & earn (P14-R): referrals are enquiries of their own kind, in the same inbox.
ALTER TABLE enquiries DROP CONSTRAINT enquiries_kind_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_kind_check CHECK (kind IN (
    'demo_request', 'contact', 'early_access', 'waitlist', 'partnership', 'sales', 'referral'));
