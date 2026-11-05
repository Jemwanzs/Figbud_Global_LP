-- Customer & partner banners (P10-B1): a new campaign kind that one record can
-- show on several websites. Which websites is part of the approved document
-- (`also_on`); hiding it on one of them is a separate, immediate reviewer switch.
ALTER TABLE campaigns DROP CONSTRAINT campaigns_kind_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_kind_check CHECK (kind IN (
    'hero', 'announcement', 'floating', 'modal', 'seasonal',
    'countdown', 'launch', 'rewards', 'referral', 'event', 'banner'));

ALTER TABLE campaigns ADD COLUMN hidden_sites TEXT[] NOT NULL DEFAULT '{}';
