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

## Forms (UI-F1, 30 Oct 2026)

Shared fields live in `packages/site-kit/src/forms.tsx` (components) and `phone.ts` (data and validation, usable on the server and in tests). Use them wherever a country or phone number is asked for; don't add free-text country or phone fields.

- **Email:** `type="email"`, `autoComplete="email"`, no spellcheck. Business forms label it "Work email" with a quiet "company email preferred" note. That's a preference, never a rule: Gmail, Yahoo, Outlook and other personal addresses are accepted.
  - Leading and trailing spaces are trimmed.
  - The syntax is checked when the field is left (not while typing), and again by the API.
  - A valid address doesn't prove the mailbox exists; use a confirmation email when ownership matters.
- **Country (`CountrySelect`):**
  - A searchable list of every country with a telephone numbering plan (245, from libphonenumber metadata bundled with the app, no network calls).
  - Names follow the page language (`Intl.DisplayNames`). Each option shows a flag, the name and the calling code.
  - Search works by name, ISO code or calling code. FigBud's first markets are listed first.
  - Stored as the ISO 3166-1 alpha-2 code.
- **Phone (`PhoneInput`, `PhoneNumbers`):**
  - The country button (flag and calling code) and the number sit side by side; the input uses `type="tel"` with the phone keyboard and `autoComplete="tel"`.
  - Numbers are validated for their own country with libphonenumber metadata (shared calling codes such as +1 are resolved by the chosen country). Then they're sent and stored in E.164 (`+254712345678`); the API re-validates with the Rust port.
  - Choosing a country in the form sets an *empty* phone's country; a number already typed keeps its own.
  - "Add another number" appears only once the first number is valid (up to `max`, two on enquiry forms).
  - A new number starts in the first one's country and can change it. The same number twice is refused.
  - Explicitly clearing the first number removes the others, and they're never sent. A number that's only temporarily invalid while being edited keeps the others.
- **Flags:** flag emoji where the system has them. Where it doesn't (Windows), the corporate site loads a small flag-only font (Twemoji Country Flags via `country-flag-emoji-polyfill`, Twemoji artwork CC-BY 4.0), self-hosted and fetched only when a flag is shown.
- **Layout:**
  - Two columns from `sm` up: name and work email, company and job title, country and phone. Selects and the message span both columns, and everything stacks on phones.
  - Inputs are 48px high, with labels above, "optional" or the hint on the right of the label, and errors below the field.
  - Pop-up lists stay inside the viewport (measured when opened) and scroll within themselves.

## Navigation dropdowns (UI-NAV1, 31 Oct 2026)

Navbar dropdowns use the **opposite theme** to the page: a dark panel on a light page, a light panel on a dark page. They stand out from the content behind them without a heavy border or overlay.

- **How:** wrap the panel in `InverseTheme` from `@figbud/ui`. It sets `data-theme` to the other theme (and `data-inverse`), so every token inside the panel (`--surface`, `--text`, `--muted`, `--line`, product accents and brand-on-background logo variants) switches with no extra classes. When the page theme changes, the panel follows. Don't hand-pick dark or light colours for a dropdown.
- **Where:** the corporate Products menu and the language selector. The language selector is shared through `ProductHeader`, so product websites get it too. Any new navbar dropdown uses the same pattern. Full-screen mobile menus are dialogs, not dropdowns, and stay in the page theme.
- **Look:** `fb-panel` surface (solid in inverse panels), 16–20px radius, `--shadow-elevated`, 6–8px inner padding, 44px-high rows with a `surface-2` hover, and the `fb-rise` entrance (0.3s). Product logos keep the version made for the panel's background, and product accents use their dark- or light-background values.
- **Placement:** the panel stays inside the viewport (`w-[min(26rem,calc(100vw-2rem))]`) and scrolls within itself when taller than the screen (`max-h-[calc(100dvh-6rem)]`). It always sits above page content (`z-50`).
- **Alignment:** rows line up whether a product has a symbol or only a wordmark. Wordmark-only rows get an empty 40px slot, so names and taglines start at the same position.
- **Accessibility:**
  - The trigger is a `button` with `aria-expanded` and `aria-controls`.
  - Hover opens the Products menu on desktop, and a click after hovering keeps it open. Keyboard and touch toggle it.
  - Escape and a press outside close it (`useDismiss`). Escape from inside the panel returns focus to the trigger.
  - Text in both panel themes meets WCAG AA contrast, which the accessibility scans check.
- **Tests:** `apps/figbud-web/e2e/site.spec.ts` ("navbar dropdowns use the opposite theme…") checks both page themes: the panel's `data-theme` and actual background colour, staying on screen, Escape and focus return.
