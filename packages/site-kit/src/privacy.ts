/**
 * Privacy & Cookies settings shared by every FigBud website (P7-PC1). The
 * settings come from the API (`GET /v1/privacy`, edited in Admin Studio →
 * Settings → Privacy & Cookies); `DEFAULT_PRIVACY` mirrors the API's
 * defaults for when it can't be reached. Nothing here enables anything.
 */

export type ConsentCategory = "analytics" | "preferences" | "marketing";
export const CONSENT_CATEGORIES: readonly ConsentCategory[] = ["analytics", "preferences", "marketing"];

export type IntegrationProvider = "plausible" | "google_analytics" | "meta_pixel" | "linkedin_insight";

export interface CategoryText {
  label: string;
  description: string;
}

export interface PrivacySettings {
  banner: { title: string; body: string };
  categories: Record<"necessary" | ConsentCategory, CategoryText>;
  /** Days a choice is remembered before the visitor is asked again. */
  retention_days: number;
  /** A path on the website ("/legal/privacy") or an https:// address. */
  privacy_url: string;
  cookie_url: string;
  /** Raised in the Studio when every visitor must choose again. */
  policy_version: number;
  /** Enabled integrations only, each with the category it needs. */
  integrations: { provider: IntegrationProvider; tracking_id: string; category: ConsentCategory }[];
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  banner: {
    title: "Your privacy matters",
    body: "We use essential cookies to keep our website working. With your permission, we may also use optional cookies to understand website usage and improve your experience.",
  },
  categories: {
    necessary: {
      label: "Strictly necessary",
      description:
        "Keep the website working and secure: they remember your cookie choices, your theme and your language, and protect forms from abuse. Always on.",
    },
    analytics: {
      label: "Analytics",
      description:
        "Help us understand how the website is used, such as which pages are visited, so we can improve it.",
    },
    preferences: {
      label: "Preferences",
      description: "Remember optional personal settings beyond the essentials, to tailor your experience.",
    },
    marketing: {
      label: "Marketing",
      description: "Measure the reach of our marketing and show relevant FigBud content on other websites.",
    },
  },
  retention_days: 180,
  privacy_url: "/legal/privacy",
  cookie_url: "/legal/cookies",
  policy_version: 1,
  integrations: [],
};

/**
 * The published settings, or `null` when the API can't be reached (callers
 * fall back to `DEFAULT_PRIVACY`). Never throws. Wrap it in a `"use cache"`
 * function in the app.
 */
export async function fetchPrivacySettings(apiBase: string): Promise<PrivacySettings | null> {
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/privacy`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as PrivacySettings;
  } catch {
    return null;
  }
}

/** Origins the supported integrations load from and report to (CSP). */
export const INTEGRATION_ORIGINS = {
  script: [
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://connect.facebook.net",
    "https://snap.licdn.com",
  ],
  connect: [
    "https://plausible.io",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://www.facebook.com",
    "https://px.ads.linkedin.com",
  ],
} as const;
