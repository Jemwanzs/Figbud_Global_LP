import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { ArticleEditor, type Taxonomy } from "@/components/admin/article-editor";
import { hasRole } from "@/lib/admin-client";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "New article" };

export default function NewArticlePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <NewArticle />
    </Suspense>
  );
}

async function NewArticle() {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  if (!hasRole(user, "editor")) redirect("/admin/insights");
  const { data: taxonomy } = await adminGet<Taxonomy>("cms/taxonomy");
  if (!taxonomy) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/insights">
      <h1 className="mb-8 font-display text-3xl font-semibold tracking-tight text-text">New article</h1>
      <ArticleEditor user={user} taxonomy={taxonomy} />
    </AdminShell>
  );
}
