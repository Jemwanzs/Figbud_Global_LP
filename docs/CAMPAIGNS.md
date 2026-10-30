# Campaigns & promotions

The campaign engine (P8) lets authorised people run banners, announcements, dialogs and interactive rewards on FigBud Global and every product website, from the Studio, without a developer. Campaigns are original FigBud designs that inherit each website's approved brand.

Last updated: 30 Oct 2026.

## Where things are

| Part | Location |
| --- | --- |
| Studio | Admin Studio → **Marketing** → Campaigns & Promotions (overview, filters, create) and each campaign's builder |
| API | `services/api/src/campaigns/` (`doc.rs`: the document and its rules; `mod.rs`: endpoints) |
| Data | migration 20: `campaigns`, `campaign_revisions`, `campaign_events`, `campaign_rewards`, `campaign_entries`, `enquiries.campaign_id` |
| Websites | `packages/site-kit/src/campaigns.tsx` (`CampaignProvider`, `CampaignSlot`, `CampaignOverlays`, spin to win), used by the corporate site and the product-site renderer |

## Campaign types

Hero, announcement bar, floating promotion, modal, seasonal, countdown, product launch, interactive rewards (spin to win), referral and event. Each type starts from a template; everything else is configuration.

## A campaign

- **Identity:** name, reference (unique, e.g. `ZIRAHR-1A2B3C`), website (exactly one, never changed), type, objective, internal description, owner.
- **Content:**
  - badge, headline, supporting headline and description (Markdown, sanitised by the API);
  - main and second buttons;
  - terms (Markdown), promotional code, live countdown, and an image from the website's media library.

  Buttons either open a link (site path or https) or the existing contact form, pre-filled for the website. The demo, waitlist, contact and webinar choices each open the form with the matching enquiry type, and the enquiry records the campaign.
- **Design:** template (spotlight, split, minimal), alignment, background (brand colour, brand gradient, soft tint, card), logo, corners, animation (respecting reduced motion), buttons, image position, text size. Colours, logos and type come from the website's **published brand**. Campaigns never change the brand itself.
- **Display:**
  - Placements, up to three: announcement bar, banner below the navigation, home page hero (or product landing page), floating corner card, centred dialog, band above the footer.
  - Targeting: pages (every page, home, products, blog, contact, or chosen paths) and devices.
  - Frequency: every page view, once per visit, daily, weekly, or only once. It's kept in the visitor's browser (`fb-campaign:*`, listed on the Cookie Policy page).
  - Trigger: straight away, after a delay, after scrolling, or on exit intent (desktop). Dismissal can be allowed or not.
- **Schedule:** start and end (exact moments, chosen in the admin's time zone), priority (−100 to 100) and yearly recurrence.

**Conflicts:**
- One campaign per placement on a page (highest priority, then most recently published).
- One dialog per page, never opened over the cookie banner or another dialog.

## Lifecycle and permissions

- **Draft → approval → live:**
  - Editors (on that website) create, edit, duplicate and submit drafts.
  - A reviewer approves. Owners may approve their own; it's recorded.
  - Each approval is a numbered version; any version can be restored into the draft.
- **Status** follows the published version: draft, scheduled, live, paused, completed, archived. "Awaiting approval" shows alongside.
- **Pause and resume** take effect at once. Archive removes it from websites and withdraws a pending change.
- **Per-website access** (P7-F1) applies throughout: people see and change only campaigns of websites they can access.
- **Audit:** `campaign.created`, `draft_saved`, `submitted`, `published`, `rejected`, `cancelled`, `paused`, `resumed`, `archived`, `restored`, `duplicated`, `version_restored`.

## On websites

- `GET /v1/sites/{slug}/campaigns` returns live campaigns only: published, not paused or archived, inside their schedule. Responses are cached for 30 seconds.
- Each campaign carries its end, and websites hide it at that moment even if a page stays open. Expired campaigns never linger in caches.
- The corporate site clears its campaign cache when a campaign changes in the Studio. Product websites pick changes up within 30 seconds.
- Campaigns render after the page loads, in reserved slots. They never affect the page's own content or search indexing.

## Interactive rewards (spin to win)

- **Configuration:**
  - rewards (name, type, quantity or unlimited, chance as a weight, redemption instructions);
  - attempts per person, eligibility, days to redeem, applicable products or plans, restrictions and terms.
- **Fairness and security:**
  - The **API decides every reward**: `POST /v1/campaigns/{id}/spin`, weighted by the published chances among rewards still in stock. The wheel only animates to the API's result.
  - Stock rows are locked for the transaction, so quantities and attempts hold under concurrent spins. The tests run five simultaneous spins for two remaining rewards and get exactly two wins.
  - Participants are identified by a salted hash of their email. The email is kept only to deliver the reward, with a unique claim code (`FB-…`) and a redeem-by date.
  - Odds are shown to visitors. Stock and weights are never sent.
  - Rate-limited per IP (10 attempts per 10 minutes).
- **Legal safeguards:**
  - Entry is free: no payment or purchase can be required, and there is no paid-entry mechanism.
  - A reward campaign can't be submitted without terms and a **recorded legal review** of promotion, consumer-protection and gambling rules for each market it runs in.
  - It needs an **owner's approval**.
  - Never advertise a reward that isn't configured and approved.
- **Delivery:** codes are shown on screen. Confirmation emails wait for Resend (Q4).

## Reporting

- **Event counts:** impressions, clicks, dismissals and conversions are recorded per campaign per day (`POST /v1/campaigns/{id}/events`). The counts carry no identifiers, cookies or personal data, and are rate-limited.
- **Conversions:** these are enquiries sent from a campaign, plus reward claims.
- **Where they show:** the Studio shows totals, click-through, per-website performance, reward stock, claims and redemptions.
- **No estimates:** everything shown is a recorded count.
