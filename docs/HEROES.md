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
| ZiraHR | 01 | Your Workforce, Connected | "HR Simplified. Business Amplified." with an interactive dashboard preview: headcount, payroll status, leave, people by department, statutory compliance, floating leave and approval cards |
| ZiraHR | 02 | Payroll in Motion | An illustrative payroll run: Prepare → Validate → Approve → Disburse → Report. The stages are selectable, figures ease between them, and compliance indicators light up |
| ZiraHR | 03 | The Employee Journey | Layered lifecycle cards in perspective: Recruit → Onboard → Manage → Grow → Exit. Selectable stages (tabs with arrow keys), auto-advancing until chosen |

The ZiraHR journey describes confirmed scope only:
- **Recruit:** a new starter's record created from the offer.
- **Onboard, Manage, Grow, Exit:** Employee 360, payroll, leave, attendance and performance.

There's no applicant-tracking claim, because recruitment is planned (PRICING.md §3).

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

Variants can be duplicated (up to 9 per website), renamed and removed, except the selected or live one.

## 4. Publishing

**Draft → preview → approve → publish.**
- **Editors** save drafts and ask for approval. Saving changes only the previews.
- **Approval:** a different reviewer approves and publishes the **selected** variant; owners may approve their own request. The previous live variant stops showing.
- **Speed:** the corporate home page updates at once (cache tag `hero`), and product websites within minutes. No redeployment is needed.
- **Versions:** every publication is a version with its note. **Roll back to this** makes an earlier approved version live again in one step (reviewers), recorded as a new version.
- **Audit:** `hero.draft_saved`, `hero.submitted`, `hero.published`, `hero.rejected` and `hero.rolled_back`, with the variant before and after.

## 5. Motion and performance

- **Heading first.** Headlines render on the server and are never animated in, because they're the LCP. Visual layers animate after hydration.
- **Cheap animation.** Transforms and opacity only (CSS 3D and keyframes, the existing animation stack). There's no WebGL, so nothing heavy loads on phones.
- **Pauses and pointers.** Animations pause off screen (IntersectionObserver), and a hovered or chosen stage holds. Pointer parallax runs only for fine pointers, in at most one frame per movement.
- **Phones get their own composition, not a shrunken desktop:** universe panels become a swipeable row, floating cards hide, and the cinematic stage scales down.
- **Reduced motion and "Motion off":** final states only (settled panels, still stages, no sweep or float).

## 6. Accessibility and SEO

- **Headings and controls:** one h1 per hero, in the server HTML. CTAs are real links. Stage and journey selectors are tabs (keyboard and arrow keys). Decorative layers are hidden from assistive technology.
- **Tests:** the e2e suite (`hero.studio.spec.ts`) renders every design in light and dark through the exact preview and runs axe on each. It also covers the Studio flow and rollback.
