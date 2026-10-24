-- Whether a product appears on the corporate site's Africa expansion map
-- (Admin → Websites → settings). Only listed websites are shown at all.
ALTER TABLE sites ADD COLUMN show_on_map BOOLEAN NOT NULL DEFAULT true;
