import { LOCALE_COOKIE } from "@figbud/i18n";
import { CONSENT_COOKIE, CookieSettingsButton } from "@figbud/site-kit";
import { THEME_STORAGE_KEY, buttonClasses } from "@figbud/ui";
import type { Metadata } from "next";

import { InProgressPage } from "@/components/in-progress-page";
import { resolvePage } from "@/lib/page";
import { getPrivacySettings } from "@/lib/privacy";
import { pageMetadata } from "@/lib/site";

const PROVIDER_NAMES = {
  plausible: "Plausible Analytics",
  google_analytics: "Google Analytics",
  meta_pixel: "Meta Pixel",
  linkedin_insight: "LinkedIn Insight Tag",
} as const;

// The policy text is being finalised with legal counsel, so the page stays
// unindexed; the list of cookies below is factual and kept current.
export async function generateMetadata({ params }: PageProps<"/[locale]/legal/cookies">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.cookies;
  return pageMetadata({
    locale,
    path: "/legal/cookies",
    title: page.title,
    description: page.description,
    published: false,
  });
}

export default async function CookiesPage({ params }: PageProps<"/[locale]/legal/cookies">) {
  const { locale, dict } = await resolvePage(params);
  const privacy = await getPrivacySettings();
  const t = dict.pages.cookies.inventory;
  const necessary = [
    {
      name: CONSENT_COOKIE,
      kind: t.cookie,
      purpose: t.consentPurpose,
      duration: t.days.replace("{n}", String(privacy.retention_days)),
    },
    { name: LOCALE_COOKIE, kind: t.cookie, purpose: t.localePurpose, duration: t.year },
    { name: THEME_STORAGE_KEY, kind: t.storage, purpose: t.themePurpose, duration: t.untilCleared },
  ];
  const category = (c: "analytics" | "preferences" | "marketing") =>
    (locale === "en" ? privacy.categories : dict.consent.categories)[c].label.toLowerCase();

  return (
    <InProgressPage
      locale={locale}
      dict={dict}
      path="/legal/cookies"
      title={dict.pages.cookies.title}
      body={dict.pages.legalPending}
    >
      <section aria-labelledby="cookie-inventory" className="mt-12 max-w-4xl">
        <h2 id="cookie-inventory" className="text-2xl font-semibold text-text">
          {t.title}
        </h2>
        <p className="mt-3 leading-relaxed text-muted">{t.lead}</p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[36rem] text-start text-sm">
            <caption className="sr-only">{t.necessary}</caption>
            <thead className="bg-surface-2 text-subtle">
              <tr>
                {[t.name, t.kind, t.purpose, t.duration].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {necessary.map((row) => (
                <tr key={row.name}>
                  <th scope="row" className="px-4 py-3 text-start font-mono text-xs font-normal text-text">
                    {row.name}
                  </th>
                  <td className="px-4 py-3 text-muted">{row.kind}</td>
                  <td className="px-4 py-3 text-muted">
                    {row.purpose} <span className="text-subtle">({t.necessary})</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-10 text-lg font-semibold text-text">{t.optionalTitle}</h3>
        {privacy.integrations.length ? (
          <ul className="mt-3 space-y-2 text-muted">
            {privacy.integrations.map((i) => (
              <li key={i.provider}>
                <span className="font-medium text-text">{PROVIDER_NAMES[i.provider]}</span>:{" "}
                {t.optionalPurpose.replace("{category}", category(i.category))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-muted">{t.noOptional}</p>
        )}
        <CookieSettingsButton label={t.manage} className={buttonClasses("secondary", "md", "mt-8")} />
      </section>
    </InProgressPage>
  );
}
