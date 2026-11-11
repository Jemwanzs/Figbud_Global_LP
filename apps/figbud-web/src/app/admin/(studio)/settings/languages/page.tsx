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
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-text">Languages</h1>
      <p className="mt-2 max-w-3xl text-muted">
        FigBud Global&apos;s translations. A language stays a draft (it can be read, but search engines
        don&apos;t index it, and missing texts show in English) until a native-speaker review is recorded and
        an owner publishes it. Published languages appear in search results, the sitemap and language
        alternates, and visitors who write in them get their acknowledgement email in that language (English
        until then).
      </p>
      <LanguagesEditor data={data} coverage={translationCoverage()} emails={emails} />
    </>
  );
}
