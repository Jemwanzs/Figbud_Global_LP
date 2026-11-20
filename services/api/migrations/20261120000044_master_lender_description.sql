-- Master Lender (owner's brief, 20 Nov 2026): the product formerly Ziwa LMS was
-- renamed in the Studio (Websites -> Manage sites), but its website's
-- description still began "Ziwa brings", the text the website was created
-- with (20261024000007_ziwa.sql). Only that exact original text is updated;
-- a description written in the Studio since is left as it is. The slug,
-- records, pages and brand files are unchanged.
UPDATE sites
   SET description = 'From application to repayment, Master Lender brings your lending operations together in one intelligent, configurable platform.'
 WHERE slug = 'ziwa'
   AND description = 'From application to repayment, Ziwa brings your lending operations together in one intelligent, configurable platform.';

-- Databases created since (local and test ones) still carry the original name;
-- production was renamed in the Studio already, so this changes nothing there.
UPDATE sites SET name = 'Master Lender' WHERE slug = 'ziwa' AND name = 'Ziwa LMS';
