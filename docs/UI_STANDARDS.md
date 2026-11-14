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
- **Hover previews (menu, UI-NAV2):**
  - Informational only, never a second dropdown: no links inside, no tab stop, no focus trap.
  - Open on mouse hover after a short delay and on keyboard focus, never on touch. Escape dismisses, and the card stays open while the pointer is on it.
  - Always the opposite theme (`InverseTheme`), kept inside the viewport, with no animation under reduced motion.
- **Scroll-driven sections (Our Platforms, UI-MO5):**
  - Pin only what fits the screen whole (scale it to no less than 70%); otherwise fall back to the normal component.
  - Drive motion from scroll progress with passive listeners and one write per frame; never intercept wheel, trackpad or touch.
  - Put the scroll distance in the server CSS so hydration doesn't shift the page.
  - Controls scroll to their item, so the visible item and the scroll position always agree.
  - Reduced motion always gets the static component.
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
  - Two-stage enquiry form (UI-EF1): pass `stages` (`enquiryStagesCopy`) to `EnquiryForm` for the staged card. The second stage uses `inert` while inactive (never just styling), unlocks only after the first validates, and receives focus; the divider (`.fb-enquiry-divider`) is wide screens only; phones show one stage with a progress bar. Keep every field in the one `<form>`, so one enquiry is sent.
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

## Motion (UI-MO1, 31 Oct 2026)

Motion explains and guides. It never decorates for its own sake, and content never depends on it.

- **Tokens** (`packages/brand/src/tokens.css`):
  - `--motion-fast` 180ms for hover and press feedback;
  - `--motion-base` 320ms for small state changes;
  - `--motion-slow` 700ms for reveals and slides;
  - `--motion-slower` 1.1s for count-ups and accent lines;
  - `--motion-stagger` 110ms between items in a sequence;
  - `--motion-distance` 18px and `--motion-distance-lg` 36px of travel;
  - `--motion-ease` (expo out) and `--motion-ease-standard`;
  - `--motion-marquee` 48s per logo loop.
  Use the tokens; don't hard-code timings.
- **One trigger:** `armReveal` in `@figbud/ui` arms after hydration, only for content still below the fold and only with motion allowed. It fires once, when content is meaningfully visible (IntersectionObserver, no scroll handlers). Server HTML, visitors without JavaScript, search engines and reduced motion always get the final state, so motion can't hide content or hurt the LCP.
- **Components (reuse them, don't write new animation code):**
  - `Reveal`: one block fades and lifts.
  - `RevealGroup` + `revealOrder()`: a row reveals its parts in sequence. `fb-reveal-item` fades and travels, `fb-reveal-line` draws an accent line, `fb-reveal-roll` rolls a number up, and `fb-reveal-glow` gives a one-off glow. Each group fires on its own, at its own scroll position. Sideways travel follows the reading direction.
  - `CountUp`: figures count up once. The final, formatted value (currency such as KES, percent, compact, decimals) is in the server HTML and is what screen readers get, and an invisible copy reserves the width so nothing shifts.
  - `Marquee`: a slow, seamless right-to-left row with faded edges. Repeats are hidden from assistive technology and keyboard focus, and hover, focus and its pause button stop it (WCAG 2.2.2). With reduced motion it's a still row that scrolls sideways; with fewer than three items it's a still, centred row.
  - Sliders follow the home showcase (`platform-showcase.tsx`): transform-based track, inert off-screen panels, `touch-action: pan-y` so vertical scrolling is never captured, swipe threshold 48px, a sideways trackpad threshold, visible previous and next controls, and a position indicator.
  - Overlays (UI-TH5): a native `<dialog>` opened with `showModal()`, with `fb-overlay` for a centred dialog, or `fb-drawer` on a menu with `fb-drawer-panel` on its sliding panel (`packages/site-kit/src/styles.css`). They open and close with the same motion (CSS transitions with `@starting-style`, nothing in JavaScript), with a `backdrop:bg-black/60` dimmed page and no blur. Show one modal at a time: close one before opening the next. Confirmations use the shared dialog (P7-UX6), which follows this pattern.
  - Footers (P7-FT1): every website uses `FooterLayout` from `@figbud/site-kit` and passes its own content: identity, tagline, description, call to action, columns and the fixed legal column. The call-to-action panel takes the opposite theme and steps aside when the page's last section is marked `data-section="call_to_action"`. Mark a page's own closing panel that way. Column links stay distinct (no duplicate destinations). Premium styling (UI-FT2, 13 Nov 2026): floating dividers (`.fb-footer-divided`, wide screens only), column headings with a 32 px `bg-product` accent, link hover to `text-product-text` with an underline, and an icon row (`SocialIcon`, `social-icons.tsx`) where a network without an address is a mark (`role="img"`, no pointer, not focusable) and one with an address is an external link. With none configured, product websites show Facebook, Instagram, X and LinkedIn unlinked.
  - Section heading accents (UI-AC1): the shared `Heading` renders `.fb-heading-accent` (48 by 2 px, 14 px above, `--product`) for major section headings. Pass `accent={false}` where a heading has its own treatment (heroes, call-to-action panels, long text); never add one to card or step titles.
  - Product demonstrations (UI-AD1): use `useAutoDemo` and `DemoControl` from `auto-demo.tsx`; never a private timer.
    - Give each state a duration. The engine starts once most of the demo is in view, pauses off screen and under keyboard focus, holds a visitor's choice for 12 seconds, stops after two passes, and stays still with reduced motion.
    - Set `aria-live` only while `state === "manual"`, so automatic changes aren't announced.
    - Auto-demonstrate walkthroughs and illustrative dashboards only. Forms, calculators, consent, bookings and anything with real consequences stay user-controlled.
    - Use pin → progress → complete → release (`useScrollStory`) only where scrolling through states adds meaning, never for ordinary content.
  - Numbered storytelling (UI-NS1):
    - Use `OutlineNumber`, `DotMatrix` and `useCurrentRow` from site-kit (`numbered-story.tsx`), or the steps block's "story" style. Don't hand-draw outlined numbers.
    - The current row is the one crossing the middle of the screen; rows are content height, nothing pins.
    - Numbers and dots are `aria-hidden` and never take a pointer. Dots sit beside headings or steps, never behind words, and are left out on narrow screens.
    - Colours come from `--num-stroke`, `--dot-from` and `--dot-to`: the product's accents by default, and FigBud Global's green and blue under `.fb-accent-numbers`.
  - Selected numbers (UI-NS2):
    - Rows that can be current carry `fb-num-row` (bar and heading colour) and use `OutlineNumber`.
    - The current one is solid `--num-active`; waiting ones are `--num-stroke` outlines. Don't style selected numbers by hand.
  - Demonstration sizing (UI-SC1):
    - A stage is as tall as its content (`fit="content"` on scroll stories) unless pieces are positioned in it, and then it's capped.
    - Never fill height with an empty panel.
    - Showcase padding: 20–32 px.
  - Guided sections (UI-MT1):
    - Pinning is for one section at a time, on wide screens only, over a runway sized to its steps, with a skip.
    - Phones get auto-play on the shared demonstration clock instead, so scroll-driven and timed progression never compete.
  - Page-specific client code (P2-18): forms, Coming Soon, the payroll calculator and public pricing are imported from their own paths (`@figbud/site-kit/enquiry-form`, `/forms`, `/phone`, `/payroll-calculator`, `/public-pricing`, `/coming-soon`), never from the shared `@figbud/site-kit` entry; on product sites they render through `lazy-blocks.tsx` (`next/dynamic`, still server-rendered). Since 13 Nov 2026 the same applies to the demonstrations and module tour (`/product-demos`, `LazyProductDemo`, `LazyModuleCatalogue`) and designed heroes (`/product-heroes`, `LazyProductHero`); the shared entry keeps only their types. The scroll engine (`scroll-engine.ts`) is separate from the stories. A new heavy client module goes the same way: re-exporting a client module from the shared entry puts it on every page.
  - Guided demonstrations (UI-SS1): a demonstration with steps uses `useDemo` (not `useAutoDemo` directly) and is listed in `GUIDED_STEPS` (`guided-steps.ts`, a plain module the server can read); the demo block wraps it in `GuidedDemo`. Scrolling drives it on wide screens through `useScrollStory`, never by intercepting the wheel. Pinning, the runway and the controls are CSS (`.fb-guided*` media queries), so the server markup already has the final layout and nothing shifts or remounts when JavaScript loads; keep a skip control and the step count; phones and reduced motion fall back to the self-playing version.
  - Website themes from the Studio (UI-BT1): a product website's published colours arrive as tokens (`siteThemeCss`), on the same selectors as `tokens.css`. Components keep using tokens (`bg-surface`, `text-muted`, `bg-action`, `--grad-*`), never fixed colours, so a Studio theme reaches them. Secondary text on gradient panels and bands uses `--text-on-grad` (every website has one). Transitions use the motion tokens (`--motion-base`, `ease-out-expo`) and stop with reduced motion.
  - Website gradients (UI-GR1): a website's gradients are `--grad-hero`, `--grad-band`, `--grad-demo`, `--grad-cta` and `--grad-glow` on its theme blocks; components use `var(--grad-x, <the plain surface>)` so websites without them don't change. Check text against every stop (tokens.test.ts).
  - ZiraHR modules: list them from `ZIRAHR_MODULES` (site-kit `zirahr-modules.ts`), never a local array. The API's `ZIRAHR_MODULE_KEYS` must match it.
  - Studio (P7-UX3–UX5):
    - **Palette:** the Studio's own palette is set on its `<html>` (`data-studio`, tokens in `tokens.css`). Use the semantic tokens, never fixed colours. `bg-action` / `text-action-ink` is the primary button (warm orange in both themes); `text-accent` is orange as text.
    - **Previews:** a website preview inside the Studio sets its own `data-theme`, or sits inside `data-site-preview`, so it keeps the website's colours. Put `data-site-preview` on a wrapper, not on the element carrying `data-site`.
    - **Sections:** each has a colour (`data-area`, `bg-area` / `text-area`), always alongside its icon and label.
    - **Shell:** signed-in pages live under `app/admin/(studio)`, whose layout keeps the top bar and sidebar mounted. A page's loading fallback is `<StudioSkeleton />`, never a blank screen; errors use `StudioProblem`.
    - **Sidebar:** new destinations are added in `studio-nav.ts` and must map to a page that exists.
    - **Unsaved changes:** `useUnsavedChangesWarning` covers reload, close and in-app links.
  - Section bands (UI-TH6): FigBud Global's home page sections get their tone from `sectionTones` (site-kit `section-themes.ts`) and `bandProps`. The hero follows the global theme, Our Platforms is opposite, then they alternate, counting only sections on the page; Trusted By is its own band (UI-TH7). A section can also be kept light or dark on both themes, or take the brand or soft band: `sectionTones` works the order out for both themes, and `bandProps` marks the section (`data-tone`, `data-tone-light` / `data-tone-dark` to invert on one theme only, `data-band`). A new major section joins `HOME_SECTIONS` (API `site_settings.rs` and the e2e mock too) and takes a `tone` prop. Never hard-code `data-tone` on a home section, and never give a section a colour of its own: colours come from the website's tokens and Section bands.
  - Form fields (UI-TH5): style every text field, select and number input with `fieldClasses()` from `@figbud/ui`, adding only spacing, width or type settings. It brings the 48px height, theme-aware surface, `aria-invalid` red border and a 3px focus ring in `--focus` (`--danger` while invalid). Never remove a focus style without replacing it.
  - Scroll stories (`ScrollStory` in `scroll-story.tsx`, UI-MO6; compact since 7 Nov 2026): one pinned panel holds the step's words and the visual (stacked on phones), both driven by the same scroll position, so they change and reverse together.
    - **Scroll length:** the pinned panel is its content's height, straight under its heading, centred below the header while pinned. A spacer after it (`[data-runway]`: 34svh per further step for stories, 22svh per module) is the only extra scrolling, so it releases right after the last step. Never a full-screen panel or a tall block per step.
    - **Heading with the stage (UI-SS2, UI-SS3):** every pinned scroll experience (both stories, the eight-module showcase, the module tour) carries its section's heading and lead inside the pinned panel, rendered once, so no blank band opens between them. The stage gives up the heading's height. Where both don't fit one screen (phones, short or small tablet screens: `max-width: 47.99rem`, `max-height: 40rem`, or under 64rem wide and 50rem tall), the panel becomes `display: contents`, the heading scrolls by and the stage (`[data-stage-pin]`) alone stays in view; `geometry()` measures whichever is pinned.
    - **One step at a time:** the step on show follows the scroll position one step every 110 ms, so a fast flick passes through every step in order, both ways, and never lands in a broken state; with reduced motion, or off screen, it jumps straight there. Nothing intercepts the wheel or touch.
    - **Choosing a step** (a dot, tab or ring node): shown at once; the page scrolls smoothly to it and, if that scroll stops short, finishes there; the scroll position takes over again once it settles, or as soon as the visitor scrolls, touches or presses a key outside the story.
    - **Words:** cross-fade in the direction of travel; a step counter and dots jump to a step.
    - **State:** `data-step` carries state for CSS transitions, and `--story-progress` (0 to 1 over the pinned stretch) carries position for lines.
    - **Without JavaScript:** the steps read as an ordinary list (`scripting: none`).
    - **Scroll distances generally:** keep long runways for experiences that need them, and under half a screen per state (Our Platforms: 45svh per product, 40svh on narrow screens). Use `@lg:` container variants inside the stage, because its width differs from the screen's. New stories join `DemoKind` in `blocks.rs` and `product-demos.tsx`.
- **Rules:**
  - Animate `transform` and `opacity` only.
  - No layout shift: reserve space, and don't change heights on load.
  - No bouncing, spinning or dramatic zooms.
  - Hover effects are extras: everything is reachable without hover.
  - Automatic movement is off unless an editor turns it on, and then it pauses on hover, focus, interaction, off screen and in hidden tabs, has a pause control and never runs with reduced motion.
  - Animated sections clip sideways overflow (`overflow-x: clip`) so travel never causes page scroll.
- **Illustrative content:** previews and demonstrations show synthetic data and say so ("Illustrative product activity · synthetic data").
- **Tests:** `site.spec.ts` ("motion and product discovery") checks the slider (buttons, swipe, inert panels), complete server HTML and reduced motion. The narrow-screen tests check for no horizontal overflow, including in Arabic.

## Product cards (UI-PR1, 31 Oct 2026)

`apps/figbud-web/src/components/products/product-cards.tsx`:
- **`ProductSpotlight`** (the first live product): its story and an interactive synthetic preview, stacked on phones.
- **`ProductCard`:** equal proportions in a 1/2/3-column grid. A brand accent line and glow, the approved logo as the h2, status, category, tagline, summary and highlights all stay visible. The demo request or waitlist and the product website sit at the bottom.
- **Hover and focus:** a 4px lift, the product-tinted border and shadow; no lift with reduced motion.
- Logos come from the brand registry. Product names stay h2 under the page h1.

## Confirmations and notifications (P7-UX6, 14 Nov 2026)

- **Never the browser's popups.** No `alert()`, `confirm()` or `prompt()` anywhere: they show the hosting domain and ignore the website's design. Use `useConfirm()` and `useToast()` from `@figbud/ui` (`packages/ui/src/dialogs.tsx`), under a `DialogProvider` (the Studio mounts one in `app/admin/layout.tsx`; a website mounts its own, passing `labels` in its language).
- **Confirm only what has a consequence:** publishing, unpublishing, removing, archiving, rolling back, revoking, signing out others, closing enquiries. Saving a draft doesn't ask.
- **Wording:** the title is the question, naming the thing ("Archive ZiraHR?"); the body says what happens and what doesn't ("Published prices and issued quotations don't change"); the confirm button names the action ("Archive website", never "OK"). `tone: "danger"` for destructive actions (the safe button gets focus), `"warning"` for reversible but visible ones.
- **Actions that can fail** go in `onConfirm`: the dialog shows progress, can't be pressed twice or dismissed while it runs, and shows the error in place. Report success afterwards with a toast, never before.
- **Toasts:** `success`, `info`, `warning`, `error`; bottom corner (full width on phones), announced as status (errors as alerts), no duplicates, at most three, errors stay until dismissed.
- **Left to the browser:** the prompt when a tab is closed or reloaded with unsaved changes, file pickers and passkey prompts.
- **Confirmation is not permission.** The API checks every action itself.

## Theme inversion (UI-TH3, 5 Nov 2026)

- **One engine.** `html[data-theme]` sets the theme. `data-tone="inverse"` on any element gives it the other theme's colours, and inside two inverse surfaces the page's theme returns (`tokens.css`). It's CSS only, so nothing waits for JavaScript and nothing flashes on load. Don't hard-code `data-theme="dark"` on a showcase panel: use `data-tone="inverse"` so it contrasts in both themes.
- **Product text** (`--product-text`) follows the surface it's on, not the page.
- **Contrasting band:** the page builder's section style `inverse` paints a full-width band from a layer behind the section. The page clips sideways overflow, so the band can't cause sideways scrolling.
- **Switching theme** changes every colour together over `THEME_TRANSITION_MS` (280 ms). Only colour properties transition, so transforms (scroll stories, reveals) carry on. With reduced motion the change is instant. The scroll position, open menus and form values aren't touched.
- **Rhythm:** alternate the page's own bands with contrasting ones, never two contrasting bands in a row, and end on one.
