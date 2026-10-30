# UI standards: spacing and typography

How FigBud websites (corporate site, product sites, ZiraHR) and the Admin Studio space content and size type. All values are tokens in [`packages/brand/src/tokens.css`](../packages/brand/src/tokens.css), shared by every app through Tailwind. Use the tokens, not one-off values.

Last reviewed: 30 Oct 2026 (UI-SP1, spacing and typography refinement).

## Principles

- **Generous where it helps reading, never empty for its own sake.** Space separates ideas; it shouldn't make pages long or disconnected.
- **Fluid, not stepped.** Tokens use `clamp()`, so phones, tablets and desktops scale smoothly without breakpoint jumps.
- **One rhythm across themes.** Spacing and type never change between dark and light mode.
- **Adjacent sections don't double up.** When one section follows another directly (the home hero and Our Platforms, for example), the second uses the compact top spacing.

## Spacing tokens

| Token | Range (phone → desktop) | Utility examples | Use for |
| --- | --- | --- | --- |
| `page-top` | 28–52px | `pt-page-top` | Header to the first content of a page (home hero, page headers, holding pages) |
| `section` | 56–96px | `py-section`, `pb-section` | Between full-width page sections |
| `section-sm` | 40–64px | `py-section-sm`, `pt-section-sm` | Compact sections, page headers' bottom, forms, footers, a section that follows the hero |
| `stack` | 32–56px | `mt-stack` | A section heading to its content (cards, lists, showcases) |
| `block` | 48–72px | `space-y-block` | Between page-builder blocks on product websites |

Inside components, keep Tailwind's 4px scale: headings to leads `mt-4`, eyebrows to headings `mt-4`/`mt-5`, list items `py-6`–`py-8`, cards `p-5`–`p-8`, grid gaps `gap-4`–`gap-10`, form fields `gap-4`–`gap-6`. The Admin Studio uses `py-8 sm:py-10` around its pages.

## Type scale

| Token | Range | Use for |
| --- | --- | --- |
| `text-display` | 40–76px | The home hero headline and product hero blocks only |
| `text-page` | 36–60px | Inner page titles (h1): About, Products, Contact, Blog articles, ZiraHR sections |
| `text-headline` | 30–48px | Section titles (h2) |
| `text-title` | 21–28px | Item, card and list titles (h3) |
| `text-lead` | 17–20px | Introductions under titles |

Outfit throughout. Long titles use `text-balance` so lines break evenly. Body copy keeps `leading-7` and `max-w-prose` (about 65 characters) for comfortable reading.

## Changes in UI-SP1 (30 Oct 2026)

- **Home hero:** header-to-hero spacing about halved (80px → about 48px on desktop); bottom padding 112px → 64px.
- **Hero to Our Platforms:** about 240px of combined padding on desktop → 128px. Our Platforms uses the compact top because it follows the hero. The gap came from stacked padding, not empty elements (no spacers, fixed heights or hidden blocks were found).
- **Sections:** 80/96/128px → 56–96px (fluid) across the home page, product sites and ZiraHR.
- **Our Philosophy:**
  - Smaller item titles (32px → 28px).
  - Number, title and description share a baseline, with a 4/7 column split.
  - Item padding 48px → 32px; body text 18px → 17px with a 28px line height.
- **Type:**
  - Hero headline 86px → 76px at most; section titles 56px → 48px.
  - Inner page titles have their own step (60px), instead of the hero size.
- **Page headers, products, contact, blog, footers, product sites, Studio:** tokens replace scattered values; page headers start about 50% closer to the header.
