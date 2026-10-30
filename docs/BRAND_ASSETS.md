# FigBud brand assets and logo management

One brand ecosystem, independent product identities, managed centrally in **Admin → Websites → (website) → Branding**. This page records the logo files FigBud has supplied, what was derived from them, what still needs FigBud's approval, and how logo management works.

Status of the work: [ROADMAP.md](ROADMAP.md), Phase 7 (P7-BR*). Architecture: [ADMIN_STUDIO.md](ADMIN_STUDIO.md).

## 1. Supplied logos (23 October 2026)

The original files are kept byte for byte in `packages/brand/assets/official/`. They are never redrawn or edited.

| File | Brand | What it shows | Size | Background | Notes |
| ---- | ----- | ------------- | ---- | ---------- | ----- |
| `figbud-logo.png` | FigBud Global | White leaf symbol, a thin divider and the **Figbud** wordmark | 324 × 68 px, transparent PNG | Made for **dark** backgrounds (all white) | No "GLOBAL" descriptor. Small file (68 px high), so it's sharp only up to about 34 px high on high-density screens. The "d" touches the right edge; confirm nothing is clipped. |
| `zirahr-logo.png` | ZiraHR | Cyan geometric symbol (#11E6FF) and the wordmark in grey (#545556) with cyan punctuation | 2048 × 1071 px, transparent PNG | Made for **light** backgrounds | **Incomplete:** the artwork runs off the right edge, so "HR" and part of the cyan dot are missing. The symbol is intact. The grey wordmark has low contrast on dark backgrounds (about 2.3:1). |
| `jasiri-logo.png` | Jasiri LMS | White **Jasiri** wordmark with purple and green leaf accents above the "J", and the descriptor "LENDING SOFTWARE" | 932 × 653 px, transparent PNG | Made for **dark** backgrounds | Complete. |

The fourth image supplied (the "brand ecosystem" board) is a **design reference only**. It is not in the repository and nothing is cropped from it. Its palettes informed the product colours in section 4.

The reference websites (`mvp.zirahrapp.com`, `figbudglobal.online`) were used for research only. They are not linked from any page, navigation, call to action or configuration.

## 2. Files derived from them

These are in `services/api/seed/brand/` and are produced by `scripts/brand/prepare_brand_assets.py`, which can be rerun when new source files arrive.

**Official** files contain exact pixels of the supplied artwork. They are trimmed of transparent margins, or are an intact part cropped out of the file.

| File | From | Use |
| ---- | ---- | --- |
| `figbud-horizontal-on-dark-official.png` | FigBud file, margins trimmed (306 × 64) | Corporate header and footer (dark theme) |
| `figbud-symbol-on-dark-official.png` | FigBud leaf symbol cropped (30 × 58) | Symbol slot |
| `zirahr-symbol-official.png` | ZiraHR symbol cropped (487 × 529) | ZiraHR icon on product cards, menus, its own site header and footer (works on both themes) |
| `zirahr-supplied-incomplete.png` | ZiraHR file, margins trimmed | Kept in the library for reference only; not used anywhere |
| `jasiri-horizontal-on-dark-official.png` | Jasiri file, margins trimmed (518 × 267) | Jasiri product card (dark theme) |

**Icons** (24 Oct 2026) place the official symbols, unmodified, on plain squares:

| File | Use |
| ---- | --- |
| `figbud-favicon-official.png` (64 px), `figbud-app-icon-official.png` (180 px) | FigBud symbol on FigBud ink (#15120F), so the white symbol reads on light and dark browser tabs. The app icon is upscaled from the small supplied file and is slightly soft; an SVG would fix this (Q18). |
| `zirahr-favicon-official.png`, `zirahr-app-icon-official.png` | ZiraHR symbol on transparent (favicon) and on a dark tile (app icon; iOS fills transparency with black). |

The same images are the websites' built-in fallbacks (`public/favicon.ico`, `icon.png`, `apple-icon.png`). Pages declare the published favicon and app icon from the brand profile; published files have unique, immutable URLs, so a newly published icon appears without waiting for caches. Older profiles received the icons once, as a recorded revision ("Favicon and app icon from the official symbol"), only where none was set; an icon removed later in the Studio is not brought back.

**Proposed** files need FigBud's approval. They sit in each website's brand *draft* and are not public until someone submits the draft and an owner or reviewer approves it.

| File | What it is |
| ---- | ---------- |
| `figbud-horizontal-on-light-proposed.png`, `figbud-symbol-on-light-proposed.png` | The FigBud artwork with its white recoloured to FigBud ink (#15120F), for light backgrounds. Shapes are unchanged. |
| `jasiri-horizontal-on-light-proposed.png` | The Jasiri artwork with its white lettering recoloured to ink; the purple and green accents are unchanged. |
| `expense-now-*-official.svg` | The approved Expense Now identity (section 3), built by `scripts/brand/expense_now/build.py`. |

**Until light-background versions are approved,** the light theme shows the official dark-background logo on a small dark plate. Nothing is recoloured without approval.

## 3. Expense Now: approved identity (30 October 2026)

The owner approved the Expense Now brand sheet on 30 Oct 2026. It replaces the earlier concept (an "E" tile), whose files are archived in Expense Now's library. Expense Now stays **Coming soon** until its launch is approved; the identity changes nothing about its status, waitlist or website.

- **The identity:**
  - **Symbol:** a radial burst of fifteen tapered rays (fine inner points, rounded outer ends) around an open centre, with a small dot beyond one ray, in orange, yellow, blue, green and browns.
  - **Wordmark:** "Expense" in brand brown (white on dark backgrounds) over "Now" in primary orange, in a heavy geometric sans (Montserrat ExtraBold, open font licence).
  - **Colours:** Primary Orange #FF7A00, Accent Yellow #FFC107, Brand Brown #4E2D17, Primary Green #10B981, Primary Blue #0B6EDB. These belong to Expense Now only.
- **How the files were made.** The sheet is a picture, so the logos were rebuilt as clean vectors (`scripts/brand/expense_now/build.py` from `geometry.json`). Nothing was cropped from the sheet and none of its labels, backgrounds or mock-ups are used.
  - **Symbol:** each ray's inner point, outer end, end width and colour were measured on the sheet's main logo. The five primary colours were snapped to the approved palette; the secondary browns, tans and deep greens were cleaned. Each ray is drawn as a taper from a fine point to a rounded end. On dark backgrounds the four darkest browns and the olive are lifted slightly, as on the sheet's dark versions, so they stay visible.
  - **Wordmark:** Montserrat ExtraBold outlines (no font needed to display), fitted to the sheet's cap height and baseline. The sheet's letters touch; spacing is tightened to −0.045 em so they never overlap, which makes "Expense" slightly wider than on the sheet.
  - **Tiles:** favicons and app icons use the sheet's rounded tiles, white or brown (#4E2D17 shading to #2B170A), with the symbol at 80% of the side and 22% corners. Favicons thicken the rays (×1.6) so the burst stays legible at 16–48 px.
  - If FigBud has the designer's original vector files, uploading them in the Studio replaces these in the same slots.
- **Files (`services/api/seed/brand/expense-now-*-official.svg`):**
  - logo for light backgrounds (brown "Expense", the primary logo) and for dark backgrounds (white "Expense");
  - symbol for light backgrounds and for dark backgrounds (transparent);
  - favicon and app icon (the symbol on a white tile);
  - in the library only: favicon and app icon on brown, and the monochrome logo (grey, and white for dark backgrounds).
- **Icon sizes.** From the published favicon and app icon the API serves square PNGs at 16, 32 and 48 px (browser tabs), 128 and 256 px (app icon sets), 180 px (Apple touch icon), and 192 and 512 px (installable apps). Product websites get a social sharing card generated from the published brand (section 3c).
- **Publishing.** New databases publish these files as Expense Now's first brand revision. Existing databases are upgraded once on start-up (audit marker `brand.expense_now_identity_seeded`), the same way as Ziwa's (section 3b): a recorded revision ("Expense Now identity: radial burst and wordmark"), the draft replaced, a pending change withdrawn, the concept files archived, Studio uploads kept.

## 3b. Ziwa LMS: final identity (29 October 2026)

The owner approved the final Ziwa LMS brand sheet on 29 Oct 2026: an orange and yellow symbol with a brown wordmark. It replaces the blue and green identity approved on 28 Oct, and the earlier concept. The superseded files are archived in Ziwa's library and stay in its revision history.

- **The identity:**
  - **Symbol:** one flowing shape folded across its middle (an orange upper lobe over a yellow lower lobe), with an orange dot beside each lobe.
  - **Wordmark:** "Ziwa" in a heavy geometric sans, brown on light backgrounds and white on dark, with an orange-to-yellow leaf over the i; "LMS" spaced in tan between two rules.
  - **Colours:** Primary Orange #FB7A1A, Accent Yellow #FFC642, Brand Brown #4E2D17, Neutral Tan #D4A97A. These colours belong to Ziwa LMS only, not the FigBud Global parent brand or the other products.
- **How the files were made.** The sheet is a picture, not a set of files, so the logos were rebuilt as clean vectors (`scripts/brand/ziwa/build.py` from `geometry.json`). Nothing was cropped from the sheet, and the sheet is never embedded.
  - **Symbol:** the outline was traced from the sheet and smoothed, then split at its fold. Each lobe's and dot's gradient was fitted to the sheet. The sheet renders its own swatches more saturated than their stated hex values (#FFC642 shows as #FEC133, for example), so the fitted colours were corrected channel by channel to the stated palette. Rendered beside the sheet, the symbol overlaps it by 99%.
  - **Wordmark:** Outfit outlines fitted to the sheet's letter boxes (92% overlap), so the files need no font, in the official brown (or white) and tan.
  - **Tiles:** the favicon and app icon use the sheet's rounded tiles, ivory (#FDF9F4) or brown (#4E2D17 shading to #3D2312). The symbol fills half the tile at every size, as on the sheet.
  - If FigBud has the designer's original vector files, uploading them in the Studio replaces these in the same slots.
- **Files (`services/api/seed/brand/ziwa-*-official.svg`):**
  - logo for light backgrounds (brown wordmark, the primary logo);
  - logo for dark backgrounds (white wordmark);
  - symbol (orange and yellow, transparent background);
  - favicon (the symbol on an ivory tile);
  - app icon (the symbol on an ivory tile);
  - in the library only: favicon and app icon on brown, and the one-colour brown logo and symbol.
  - No stacked layout: the sheet doesn't show one.
- **Icon sizes.** Browsers and devices get square PNGs rendered from the published favicon and app icon (16, 32, 48, 128, 180, 192, 256 and 512 px, via `?icon=`), plus the SVG itself, which scales to any other size.
- **Publishing.** New databases publish these files as Ziwa's first brand revision. Existing databases are upgraded once on start-up (audit marker `brand.ziwa_final_identity_seeded`):
  - the files are published as a recorded revision ("Final Ziwa LMS identity: orange, yellow and brown"), with the new colours;
  - the draft is replaced, and any pending brand change is withdrawn as superseded;
  - the superseded seeded files (blue and green, and the concept) are archived;
  - files uploaded in the Studio are kept, and later Studio changes are never overwritten.

## 3c. Social sharing images (P7-BR11, 30 October 2026)

What a link to a FigBud website shows on LinkedIn, WhatsApp, X, Slack and similar.

- **Uploaded:** a website's Branding has a "Social sharing image" slot (about 1200 × 630 px). Once published, the API renders it as the PNG social platforms expect, exactly 1200 × 630, filled and centre-cropped (`/v1/brand/assets/{id}?social=1`), whatever its format (SVG, PNG or WebP).
- **Generated, when nothing is uploaded:**
  - the corporate site keeps its designed card ("Built for complexity. Designed for progress." with the product names);
  - each product website gets a card built from its published brand: its symbol, name and tagline on the dark theme, lit by its brand colours, with "A FigBud Global platform".
- **Everywhere:** every page carries Open Graph and X (Twitter) `summary_large_image` tags with the image's size and alt text.

## 4. Product colours

Product accent tokens (`packages/brand/src/tokens.css`) now follow each product's logo instead of the earlier placeholders. A unit test (`tokens.test.ts`) checks WCAG AA contrast for every accent on both themes.

| Product | Accent | Second | Text on dark | Text on light |
| ------- | ------ | ------ | ------------ | ------------- |
| FigBud Global (parent palette, 28 Oct 2026) | #22C55E emerald (navy text on it) | #3B82F6 electric blue | #22C55E | #15803D |
| ZiraHR | #22D3EE cyan | #0891B2 | #67E8F9 | #0E7490 |
| Jasiri LMS | #22C55E green | #7C3AED purple | #4ADE80 | #15803D |
| Expense Now | #FF7A00 orange | #FFC107 yellow | #FF8A1F | #A84F00 |
| Ziwa LMS (final, 29 Oct 2026) | #FB7A1A orange (deep brown #2B1609 text on it) | #FFC642 yellow | #FB7A1A | #A8480C |

Ziwa's brand profile stores orange, yellow and tan as primary, secondary and accent; brown is its wordmark and button-text colour. Orange #FB7A1A is 2.5:1 on the light theme, so light pages use the darker #A8480C for orange text.

## 4b. One way to show a product's logo

`ProductLogo` (`@figbud/site-kit`) is the only way pages and the Studio show a product's identity. It always reads the brand profile published in the Studio:
1. the published symbol;
2. else the published logo, which carries the name, so the name isn't repeated beside it (Jasiri LMS today);
3. else the built-in icon, only while a product has no approved logo (none today: every product has one).

`ProductIdentity` pairs it with the name. Both follow the page's light or dark theme, or a fixed surface, and never stretch a file.

Where it is used: the "Distinct platforms" tabs and panels, the hero ecosystem, the Africa map, product menus (desktop and mobile), the Products page and comparison table, product-site headers and footers, and the Studio's website cards.

**Browser icons.** The API renders any published logo as a square PNG at 16, 32, 48, 128, 180, 192, 256 or 512 px (`/v1/brand/assets/{id}?icon=32`), centred without distortion and cached permanently. Each website declares:
- its SVG favicon, plus 16, 32 and 48 px PNGs;
- a 180 px Apple touch icon;
- a web manifest with 192 and 512 px icons.

A website with its own favicon never falls back to another site's `favicon.ico`. Asset URLs are unique per file, so publishing a new logo or icon is never hidden by caches.

Each website's brand profile also stores primary, secondary and accent colours. The Studio previews them and checks their contrast.

## 5. How logo management works

- **Library.** Each website has its own library of brand files: SVG, PNG or WebP, up to 2 MB (SVG up to 512 KB), 16–8192 px per side. Files are immutable. "Replace" means uploading a new file and pointing the slot at it, so earlier versions and pages that still show the old file keep working. Identical files are stored once. Files that are in use can't be archived; archived files can be restored.
- **Validation and security.** The API sniffs the format from the bytes and requires it to match the declared type.
  - PNG and WebP files are fully decoded with allocation limits and stored unchanged.
  - SVGs are parsed and re-serialised. Scripts, event handlers, `foreignObject`, embedded images, external references and document types are refused or removed, and no file or network access happens while parsing.
  - Text in SVGs must be converted to outlines.
  - Files are served with `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`.
- **Responsive delivery.** Downscaled WebP copies (64, 160, 320 and 640 px wide; never upscaled) are generated on upload. Websites request the smallest copy that stays sharp, with a 2× `srcset`. Width and height always follow the file's own proportions, so logos can't be stretched.
- **Slots.** Each slot (horizontal, stacked, symbol, wordmark) has one file for dark backgrounds and one for light backgrounds. There are also a favicon (square), an app icon (square) and a social sharing image (about 1200 × 630). The header logo height is adjustable from 20 to 48 px.
- **Publishing.**
  - Every change autosaves to the **draft**, which is never public. The draft is version-checked so two people can't overwrite each other, and there is undo/redo.
  - **Submit for publishing** requires the required checks to pass: a logo for dark backgrounds and a primary colour with at least 3:1 contrast on the dark theme.
  - A different reviewer approves (owners may approve their own submission, which is recorded in the audit log).
  - Every published version is kept. **Restore to draft** copies an earlier version back for review and republishing.
  - The audit log records each change with previous and new values.
- **Where logos appear.** Websites read the published profile from `GET /v1/sites`, cached for a few minutes. Pages update within minutes of approval, or immediately on the next deploy.
  - **Corporate site:** header and footer logo; the homepage hero ecosystem (FigBud symbol at the centre on a dark tile, product symbols or logos on each node); product symbols in the Products menu, the homepage product tabs and the Products page; full product logos on Products page cards.
  - **ZiraHR site:** header, mobile menu and footer.
  - Where nothing is published, the built-in look remains. Files are served by each website from its own origin at `/brand/assets/{id}`.
- **Permissions.** Viewers can see branding. Editors can upload, draft, archive and submit. Reviewers and owners approve. Only files used by a published profile are public.

## 6. Questions for FigBud

1. **ZiraHR:** please send the complete logo; the supplied file is missing "HR". An SVG is ideal, plus a version for dark backgrounds (light wordmark).
2. **FigBud Global:** an SVG or larger PNG, a version for light backgrounds, and the stacked "Figbud / GLOBAL" lockup if there is one. Should the header show "Figbud" alone (as supplied) or with "GLOBAL"?
3. **Jasiri LMS:** an SVG, and a light-background version, or approval of the proposed recolour.
4. **Expense Now:** ~~approve, adjust or replace the proposed concept~~ Resolved 30 Oct 2026: the owner approved the brand sheet (section 3).
5. **Favicons and app icons:** the current ones are made from the supplied symbols; vector or larger artwork would make the home-screen icons sharper.
