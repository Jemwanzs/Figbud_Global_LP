-- Page visibility (P7-ZR1), independent of publishing:
-- - `offline`: the page keeps its content and versions but websites can't
--   show it (404) until it is brought back online;
-- - `show_in_nav`: whether the page appears in the website's navigation; a
--   page left out of it is still reachable at its address.
ALTER TABLE pages ADD COLUMN offline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pages ADD COLUMN show_in_nav BOOLEAN NOT NULL DEFAULT true;
-- The home page is the website's front door; it is never taken offline.
ALTER TABLE pages ADD CONSTRAINT pages_home_online CHECK (path <> '' OR NOT offline);
