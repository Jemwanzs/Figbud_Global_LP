# Hero Design Studio

Each website has its own collection of hero designs and publishes exactly one. Studio → Websites → a website → **Hero Design Studio**.

Last updated: 31 Oct 2026.

## 1. Principles

- **What you preview is what you publish.** Previews are the website's own hero components with the saved draft settings, rendered in a frame (`/admin/hero-preview/{site}/{variant}`). They are not screenshots or mock-ups.
- **The preview theme is the frame's only.** The Light / Dark switch sets the frame's theme from its address. It never writes the visitor's saved theme and never publishes anything.
- **Drafts never reach the website.** Only a published variant does, after approval.
- **Nothing changes until something is published.**
  - FigBud Global keeps Hero 01 exactly as approved.
  - Product websites keep the leading hero section of their Studio home page.
- **Collections belong to their website.** Designs are never copied between products: a website without its own collection shows none.
- **Honest demonstrations.** Product demonstrations use synthetic data, labelled "Illustrative product activity · synthetic data". No customer metrics or activity are claimed.

## 2. The collections

| Website | Variant | Design | What it is |
| --- | --- | --- | --- |
| FigBud Global | 01 | Connected Ecosystem | The production hero, registered as is: headline, CTAs, the ecosystem visualisation, approved logos and statuses, current motion |
| FigBud Global | 02 | Beyond the Ordinary | Cinematic: dimensional blocks built in CSS 3D with themed light surfaces, a FigBud token resting on the top step, a slow light sweep, and pointer parallax at different depths |
| FigBud Global | 03 | The FigBud Universe | A short presentation: identity, then product panels unfolding in perspective, connections drawing, settling into an interactive showcase (choosing a panel brings it forward with its details). A swipeable row on phones |
| FigBud Global | 04 | The FigBud Edition | Editorial (UI-MO8): an oversized headline across the page under a drawn hairline, a numbered index of the platforms, and layered product sheets (name, category, tagline, summary, highlights and status, all from the registry and approved copy). The index moves on by itself until a visitor chooses a chapter |
| ZiraHR | 01 | Your Workforce, Connected | "HR Simplified. Business Amplified." with an interactive dashboard preview: headcount, payroll status, leave, people by department, statutory compliance, floating leave and approval cards |
| ZiraHR | 02 | Payroll in Motion | An illustrative payroll run: Prepare → Validate → Approve → Disburse → Report. The stages are selectable, figures ease between them, and compliance indicators light up |
| ZiraHR | 03 | The Employee Journey | Layered lifecycle cards in perspective: Recruit → Onboard → Manage → Grow → Exit. Selectable stages (tabs with arrow keys), auto-advancing until chosen |

| FigBud Global | 05 | Emerald Innovation | Platform hero (P12-H7), dark: deep emerald with a lime accent, the platforms as a floating stack of cards joined by drawn connections |
| FigBud Global | 06 | Digital Future | Platform hero, dark: indigo to violet with a cyan accent, the platforms around a central FigBud hub |
| FigBud Global | 07 | Connected Ecosystem · Light | Platform hero, light: warm white with a green accent, the platforms in orbit around the FigBud mark beside a card of their real statuses. Named apart from Variant 01, the live hero |
| FigBud Global | 08 | Enterprise Orbit | Platform hero, light: cream with an orange accent, the same orbital composition |
| FigBud Global | 09 | Dark Enterprise | Platform hero, dark: near-black with an orange accent, a floating card stack |
| ZiraHR | 04 | People, in Chapters | Editorial (UI-MO8): the same editorial composition with ZiraHR's modules (Core HR, Payroll, Leave, Attendance, Performance) as chapters beside layered sheets of one synthetic employee's records. The payslip matches the website's own payroll calculator for KES 150,000 |

The editorial designs share `EditorialHero` (`packages/site-kit/src/editorial-hero.tsx`). The headline renders at once (LCP); only the hairlines and sheets move (transforms and opacity), paused off screen and still with reduced motion. Chapters are buttons (`aria-pressed`), and hovering or focusing the index holds it. Websites that saved a draft before these designs existed were offered them once, as a new last variant (`heroes::offer_added_designs`); nothing was selected or published, and removing the variant keeps it removed.

The ZiraHR journey describes confirmed scope only:
- **Recruit:** a new starter's record created from the offer.
- **Onboard, Manage, Grow, Exit:** Employee 360, payroll, leave, attendance and performance.

**Platform heroes (05–09, P12-H7, 13 Nov 2026).** One component (`platform-hero.tsx`, looks in `platform-looks.ts`) with five looks. Every product card comes from the product registry: approved logo, name, category, status (read by screen readers) and, on hover or keyboard focus, its approved summary. Cards link to the product page, and products that live on their own website open it in a new tab (`noopener`). A hovered or focused card holds still. There are no statistics: where a reference design showed figures, the picture shows the products' real statuses. Badges default to the approved pillars.

Recruitment was confirmed by the owner on 5 Nov 2026, so a hero may mention it; the three starting designs were written before that and don't.

Jasiri LMS, Ziwa LMS, Expense Now and future products get their own collections when designed. Until then they keep their Studio page heroes.

## 3. Settings

Each variant has the same settings object, and each design exposes only the settings it uses, so its structure can't be broken. The API validates everything (`services/api/src/heroes.rs`).

| Setting | Values |
| --- | --- |
| Eyebrow, headline, headline second line, supporting text | Up to 60 / 90 / 60 / 260 characters. Empty keeps the design's approved copy. On the corporate site, text applies to English pages; other languages keep their reviewed copy |
| Button labels and destinations | Labels up to 32 characters. Destinations: a page path, a section (`#platforms`) or an https:// address |
| Motion | On or off. Visitors who prefer reduced motion always get the still hero |
| Animation speed, intensity | Slow / normal / fast; subtle / standard / bold |
| Section height, alignment | Fit content / tall / full screen; start / centred |
| Accent, phone layout | Brand / blue / violet / neutral; stacked / compact |
| Background image | From the website's media library (designs that use one) |
| Light and dark mode (platform heroes) | **Keep the design's own look** (default: its intended theme whatever the visitor chose) or **Follow the website's mode** (the site's own colours, light or dark) |
| Badges (platform heroes) | Up to three statements of 40 characters; none keeps the approved pillars |
| Products (platform heroes) | Up to six registry products, each once, in the chosen order; none shows every listed product |
| Colours (platform heroes) | Background (two colours), headline, accent, text, main button and its text, cards, card borders, glow. `#rrggbb` only; each can be reset to the design's default, and an override applies in either mode |

Variants can be duplicated (up to 12 per website), renamed and removed, except the selected or live one.

## 4. Publishing

**Draft → preview → approve → publish.**
- **Editors** save drafts and ask for approval. Saving changes only the previews.
- **Approval:** a different reviewer approves and publishes the **selected** variant; owners may approve their own request. The previous live variant stops showing.
- **Speed:** the corporate home page updates at once (cache tag `hero`), and product websites within minutes. No redeployment is needed.
- **Versions:** every publication is a version with its note. **Roll back to this** makes an earlier approved version live again in one step (reviewers), recorded as a new version.
- **Studio safety:** **Discard changes** returns to the saved draft and **Reset to default** returns a variant to its design's settings, each after a confirmation; neither changes the website until saved and published.
- **Audit:** `hero.draft_saved`, `hero.submitted`, `hero.published`, `hero.rejected` and `hero.rolled_back`, with the variant before and after.

## 5. Motion and performance

- **Heading first.** Headlines render on the server and are never animated in, because they're the LCP. Visual layers animate after hydration.
- **Cheap animation.** Transforms and opacity only (CSS 3D and keyframes, the existing animation stack). There's no WebGL, so nothing heavy loads on phones.
- **Pauses and pointers.** Animations pause off screen (IntersectionObserver), and a hovered or chosen stage holds. Pointer parallax runs only for fine pointers, in at most one frame per movement.
- **Phones get their own composition, not a shrunken desktop:** universe panels become a swipeable row, floating cards hide, and the cinematic stage scales down.
- **Reduced motion and "Motion off":** final states only (settled panels, still stages, no sweep or float). The Studio's **Pause motion** holds every preview frame still (`?motion=off`) without changing the saved setting.

## 6. Accessibility and SEO

- **Headings and controls:** one h1 per hero, in the server HTML. CTAs are real links. Stage and journey selectors are tabs (keyboard and arrow keys). Decorative layers are hidden from assistive technology.
- **Tests:** `hero.platform.spec.ts` covers the platform heroes: each look in light and dark with axe, product links and descriptions, paused and reduced motion, phones without sideways scrolling, and Studio customisation with reset, discard and save. The e2e suite (`hero.studio.spec.ts`) renders every design in light and dark through the exact preview and runs axe on each. It also covers the Studio flow and rollback.
