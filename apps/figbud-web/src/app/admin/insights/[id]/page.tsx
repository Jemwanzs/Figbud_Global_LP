import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShell, AdminUnavailable } from "@/components/admin/admin-shell";
import { type Article, ArticleEditor, type Taxonomy, type Version } from "@/components/admin/article-editor";
import { adminGet, requireAdmin } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Edit article" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default function EditArticlePage({ params }: PageProps<"/admin/insights/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <EditArticle params={params} />
    </Suspense>
  );
}

async function EditArticle({ params }: Pick<PageProps<"/admin/insights/[id]">, "params">) {
  const user = await requireAdmin();
  if (user === "unavailable") return <AdminUnavailable />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [article, taxonomy, versions] = await Promise.all([
    adminGet<Article>(`cms/articles/${id}`),
    adminGet<Taxonomy>("cms/taxonomy"),
    adminGet<Version[]>(`cms/articles/${id}/versions`),
  ]);
  if (article.status === 404) notFound();
  if (!article.data || !taxonomy.data) return <AdminUnavailable />;
  return (
    <AdminShell user={user} active="/admin/insights">
      <p className="text-sm text-subtle">
        <Link href="/admin/insights" className="hover:text-text">
          Insights
        </Link>{" "}
        / Edit
      </p>
      <h1 className="mt-2 mb-8 font-display text-3xl font-semibold tracking-tight text-text">
        {article.data.title}
      </h1>
      <ArticleEditor
        key={`${article.data.id}-${article.data.version}`}
        user={user}
        taxonomy={taxonomy.data}
        article={article.data}
        versions={versions.data ?? []}
      />
    </AdminShell>
  );
}
