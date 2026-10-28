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
| `expense-now-*-proposed.svg` | The Expense Now logo concept (section 3). |

**Until light-background versions are approved,** the light theme shows the official dark-background logo on a small dark plate. Nothing is recoloured without approval.

## 3. Expense Now: proposed logo concept (not approved)

Expense Now has no official logo yet. The concept is original artwork made for FigBud:

- **Symbol:** a rounded tile in an orange-to-copper gradient (#FDBA74 → #F97316 → #C2410C). Inside it, a cream "E" whose middle bar becomes a forward arrow, meaning spending that moves. It reads at favicon size and works on dark and light backgrounds.
- **Wordmark:** "Expense **Now**" set in Outfit SemiBold (the ecosystem typeface, open licence). It is converted to outlines, so the SVG needs no font. "Now" is in the brand orange.
- **Variations:** horizontal (dark and light backgrounds), stacked (dark and light), symbol only, favicon.

The concept is in the Expense Now brand draft, labelled "Proposed … not approved". To adopt it, review it in the Studio, submit it, and approve it. To replace it, upload the final artwork into the same slots.

## 3b. Ziwa LMS: approved identity (28 October 2026)

The owner approved the Ziwa LMS brand sheet on 28 Oct 2026. It replaces the earlier concept, whose files are archived in Ziwa's library.

- **The identity:**
  - **Symbol:** blue and green flowing drops, each folded once, with a small dot beside each.
  - **Wordmark:** "Ziwa" in a heavy geometric sans, with a green leaf over the i, and "LMS" spaced in gold between two rules.
  - **Colours:** Primary Blue #0B6EDB, Primary Green #10B981, Brand Brown #4E2D17, Accent Gold #C9A87A.
- **How the files were made.** The sheet is a picture, not a set of files, so the logos were rebuilt as clean vectors (`scripts/brand/ziwa/build.py` from `geometry.json`). Nothing was cropped from the sheet, and the sheet is never embedded.
  - **Symbol:** the outlines were traced from the sheet and smoothed, and each drop's gradients were fitted to the sheet's colours either side of its fold. Rendered beside the sheet, the shapes overlap by 97% and the colours differ by under 6/255 on average.
  - **Wordmark:** Outfit outlines fitted to the sheet's letter boxes (92% overlap), so the files need no font. The wordmark uses the official brown and gold.
  - If FigBud has the designer's original vector files, uploading them in the Studio replaces these in the same slots.
- **Files (`services/api/seed/brand/ziwa-*-official.svg`):**
  - logo for light backgrounds (brown wordmark, the primary logo);
  - logo for dark backgrounds (white wordmark);
  - symbol;
  - favicon (the symbol, square);
  - app icon (the symbol on the sheet's white rounded tile);
  - one-colour brown logo and symbol, in the library only.
  - No stacked layout: the sheet doesn't show one.
- **Publishing.** New databases publish these files as Ziwa's first brand revision. Existing databases were upgraded once on start-up: the files were published as a recorded revision ("Approved Ziwa LMS identity"), the concept draft was replaced, any pending brand change was withdrawn as superseded, and the concept files were archived. Later Studio changes are never overwritten.

## 4. Product colours

Product accent tokens (`packages/brand/src/tokens.css`) now follow each product's logo instead of the earlier placeholders. A unit test (`tokens.test.ts`) checks WCAG AA contrast for every accent on both themes.

| Product | Accent | Second | Text on dark | Text on light |
| ------- | ------ | ------ | ------------ | ------------- |
| FigBud Global | #F0A65D amber | #A66538 copper | #F0A65D | #9A5A2E |
| ZiraHR | #22D3EE cyan | #0891B2 | #67E8F9 | #0E7490 |
| Jasiri LMS | #22C55E green | #7C3AED purple | #4ADE80 | #15803D |
| Expense Now (proposed) | #F97316 orange | #C2410C | #FB923C | #C2410C |
| Ziwa LMS (approved 28 Oct 2026) | #0B6EDB blue (white text on it) | #10B981 green | #5AA9F6 | #0A5FC0 |

Ziwa's brown and gold appear in its logo; its brand profile stores blue, green and gold as primary, secondary and accent.

## 4b. One way to show a product's logo

`ProductLogo` (`@figbud/site-kit`) is the only way pages and the Studio show a product's identity. It always reads the brand profile published in the Studio:
1. the published symbol;
2. else the published logo, which carries the name, so the name isn't repeated beside it (Jasiri LMS today);
3. else the built-in icon, only while a product has no approved logo (Expense Now today).

`ProductIdentity` pairs it with the name. Both follow the page's light or dark theme, or a fixed surface, and never stretch a file.

Where it is used: the "Distinct platforms" tabs and panels, the hero ecosystem, the Africa map, product menus (desktop and mobile), the Products page and comparison table, product-site headers and footers, and the Studio's website cards.

**Browser icons.** The API renders any published logo as a square PNG at 16, 32, 48, 180, 192 or 512 px (`/v1/brand/assets/{id}?icon=32`), centred without distortion and cached permanently. Each website declares:
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
4. **Expense Now:** approve, adjust or replace the proposed concept.
5. **Favicons and app icons:** the current ones are made from the supplied symbols; vector or larger artwork would make the home-screen icons sharper.
