import { builtInLanguages } from "@figbud/i18n";
import { fetchListedSites } from "@figbud/site-kit/server";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AdminUnavailable } from "@/components/admin/admin-shell";
import {
  type LanguageEmails,
  type LanguagesAdmin,
  LanguagesEditor,
} from "@/components/admin/languages-editor";
import { StudioSkeleton } from "@/components/admin/studio-states";
import { adminGet, requireAdmin } from "@/lib/admin-server";
import { apiBase } from "@/lib/products";
import { translationCoverage } from "@/lib/translation-coverage";

export const metadata: Metadata = { title: "Languages" };

export default function LanguagesPage() {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Languages />
    </Suspense>
  );
}

async function Languages() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { data } = await adminGet<LanguagesAdmin>("locales");
  if (!data) return <AdminUnavailable />;
  // Each language's acknowledgement emails, for its reviewer (P5-12).
  const emails = Object.fromEntries(
    await Promise.all(
      data.locales.map(
        async (l) =>
          [
            l.code,
            (await adminGet<{ emails: LanguageEmails }>(`locales/${l.code}/emails`)).data?.emails ?? [],
          ] as const,
      ),
    ),
  );
  // Which websites have switched each language on (their own Languages pages, P7-L1).
  const usage: Record<string, string[]> = {};
  for (const site of (await fetchListedSites(apiBase)) ?? []) {
    for (const code of site.settings?.languages?.enabled ?? builtInLanguages(site.kind).enabled) {
      (usage[code] ??= []).push(site.name);
    }
  }
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Languages</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The languages every website chooses from (each website switches them on in its own Languages page);
        the coverage counts FigBud Global&apos;s own texts. A language stays a draft (it can be read, but
        search engines don&apos;t index it, and missing texts show in English) until a native-speaker review
        is recorded and an owner publishes it. Published languages appear in search results, the sitemap and
        language alternates, and visitors who write in them get their acknowledgement email in that language
        (English until then).
      </p>
      <LanguagesEditor data={data} coverage={translationCoverage()} emails={emails} usage={usage} />
    </>
  );
}
