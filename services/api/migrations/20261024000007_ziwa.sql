-- Ziwa LMS: a second lending product on the shared lending website
-- foundation (docs/PRODUCT_REGISTRY.md). Listed as coming soon until its
-- commercial launch is confirmed; enquiries can name it.

ALTER TABLE enquiries DROP CONSTRAINT enquiries_product_check;
ALTER TABLE enquiries ADD CONSTRAINT enquiries_product_check
    CHECK (product IN ('figbud', 'zirahr', 'jasiri', 'expense_now', 'ziwa'));

INSERT INTO sites (id, slug, kind, name, tagline, description, category, template, status, position) VALUES
    ('01928d6c-0000-7000-8000-000000000005', 'ziwa', 'product', 'Ziwa LMS',
     'Lending that flows with your business.',
     'From application to repayment, Ziwa brings your lending operations together in one intelligent, configurable platform.',
     'lending_credit', 'lending', 'coming_soon', 4)
ON CONFLICT (slug) DO NOTHING;
