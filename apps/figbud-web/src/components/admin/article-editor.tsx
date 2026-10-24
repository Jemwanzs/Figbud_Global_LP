"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { Archive, CalendarClock, Eye, LoaderCircle, PenLine, RotateCcw, Send, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { type AdminUser, AdminError, type FieldError, adminFetch, hasRole } from "@/lib/admin-client";
import { useSavedBaseline, useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";

import { ArticleStatus, type Status } from "./article-status";

export interface Term {
  slug: string;
  name: string;
  detail?: string | null;
}

export interface Taxonomy {
  categories: Term[];
  authors: Term[];
  tags: Term[];
}

export interface Article {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  status: Status;
  version: number;
  cover_image_url?: string | null;
  cover_image_alt?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  category?: string | null;
  author?: string | null;
  tags: string[];
  published_at?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  updated_at: string;
  last_edited_by?: string | null;
  last_edited_by_id?: string | null;
  scheduled: boolean;
}

export interface Version {
  version: number;
  title: string;
  edited_by?: string | null;
  created_at: string;
}

const LOCALES = [
  { value: "en", label: "English" },
  { value: "sw", label: "Kiswahili" },
  { value: "fr", label: "Français" },
  { value: "ar", label: "العربية" },
  { value: "zh", label: "中文" },
];

type Form = {
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  category: string;
  author: string;
  tags: string;
  cover_image_url: string;
  cover_image_alt: string;
  seo_title: string;
  seo_description: string;
};

function toForm(article?: Article): Form {
  return {
    locale: article?.locale ?? "en",
    slug: article?.slug ?? "",
    title: article?.title ?? "",
    excerpt: article?.excerpt ?? "",
    body_markdown: article?.body_markdown ?? "",
    category: article?.category ?? "",
    author: article?.author ?? "",
    tags: article?.tags.join(", ") ?? "",
    cover_image_url: article?.cover_image_url ?? "",
    cover_image_alt: article?.cover_image_alt ?? "",
    seo_title: article?.seo_title ?? "",
    seo_description: article?.seo_description ?? "",
  };
}

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");

/** Create or edit an article; workflow actions follow the signed-in admin's role. */
export function ArticleEditor({
  user,
  taxonomy,
  article: initial,
  versions = [],
}: {
  user: AdminUser;
  taxonomy: Taxonomy;
  article?: Article;
  versions?: Version[];
}) {
  const router = useRouter();
  const uid = useId();
  const [article, setArticle] = useState(initial);
  const [form, setForm] = useState<Form>(() => toForm(initial));
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string; conflict?: boolean } | null>(
    null,
  );
  const [fields, setFields] = useState<FieldError[]>([]);
  const [schedule, setSchedule] = useState("");

  const live = article && (article.status === "published" || article.status === "archived");
  const canEdit = live ? hasRole(user, "reviewer") : hasRole(user, "editor");
  const ownEdit = article?.last_edited_by_id === user.id;
  const canPublish =
    article &&
    (article.status === "draft" || article.status === "in_review") &&
    hasRole(user, "reviewer") &&
    (!ownEdit || user.role === "owner");

  // Unsaved means different from the last saved version; undoing an edit makes it clean again.
  const { dirty, markSaved } = useSavedBaseline(form, toForm(initial));
  useUnsavedChangesWarning(dirty);
  const creatable = [form.title, form.slug, form.excerpt, form.body_markdown].every((v) => v.trim() !== "");

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;

  async function run(label: string, action: () => Promise<Article>, success: string) {
    setBusy(label);
    setMessage(null);
    setFields([]);
    try {
      const saved = await action();
      setArticle(saved);
      setForm(toForm(saved));
      markSaved(toForm(saved));
      setMessage({ tone: "ok", text: success });
      if (!initial) {
        router.replace(`/admin/insights/${saved.id}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) {
        setFields(err.fields);
        setMessage({ tone: "error", text: err.message, conflict: err.status === 409 });
      } else {
        setMessage({ tone: "error", text: "Something went wrong. Please try again." });
      }
    } finally {
      setBusy(null);
    }
  }

  const payload = () => ({
    ...form,
    category: form.category || null,
    author: form.author || null,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    version: article?.version,
  });

  const save = () =>
    run(
      "save",
      () =>
        article
          ? adminFetch<Article>(`cms/articles/${article.id}`, payload())
          : adminFetch<Article>("cms/articles", payload()),
      article ? "Saved." : "Draft created.",
    );

  async function showPreview() {
    setTab("preview");
    setPreview(null);
    try {
      const rendered = await adminFetch<{ html: string }>("cms/preview", {
        body_markdown: form.body_markdown,
      });
      setPreview(rendered.html);
    } catch {
      setPreview("<p>Preview unavailable.</p>");
    }
  }

  const action = (path: string, success: string, body: unknown = {}) =>
    run(path, () => adminFetch<Article>(`cms/articles/${article!.id}/${path}`, body), success);

  const field = (name: keyof Form, label: string, input: React.ReactNode, hint?: string) => {
    const error = errorFor(name);
    return (
      <div>
        <label htmlFor={`${uid}-${name}`} className="block text-sm font-medium text-text">
          {label}
        </label>
        {input}
        {error ? (
          <p id={`${uid}-${name}-error`} className="mt-1.5 text-sm text-danger">
            {error}
          </p>
        ) : (
          hint && <p className="mt-1.5 text-sm text-subtle">{hint}</p>
        )}
      </div>
    );
  };

  const inputProps = (name: keyof Form) => ({
    id: `${uid}-${name}`,
    value: form[name],
    disabled: !canEdit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(name)(e.target.value),
    "aria-invalid": errorFor(name) ? true : undefined,
    "aria-describedby": errorFor(name) ? `${uid}-${name}-error` : undefined,
    className:
      "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text disabled:opacity-60",
  });

  const counter = (value: string, max: number) => `${value.length}/${max}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit && busy === null && (article ? dirty : creatable)) save();
        }}
        className="space-y-6"
        noValidate
      >
        {field("title", "Title", <input {...inputProps("title")} maxLength={200} />)}
        <div className="grid gap-6 sm:grid-cols-[1fr_12rem]">
          {field(
            "slug",
            "Address",
            <input
              {...inputProps("slug")}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug")(e.target.value);
              }}
              className={cn(inputProps("slug").className, "font-mono text-sm")}
            />,
            `/${form.locale}/blog/${form.slug || "…"}`,
          )}
          {field(
            "locale",
            "Language",
            <select {...inputProps("locale")}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>,
          )}
        </div>
        {field(
          "excerpt",
          "Summary",
          <textarea
            {...inputProps("excerpt")}
            rows={3}
            maxLength={400}
            className={cn(inputProps("excerpt").className, "py-3")}
          />,
          `Shown on cards and in search results · ${counter(form.excerpt, 400)}`,
        )}

        <div>
          <div className="flex items-end justify-between gap-4">
            <label htmlFor={`${uid}-body_markdown`} className="block text-sm font-medium text-text">
              Article
            </label>
            <div
              role="tablist"
              aria-label="Editor mode"
              className="flex gap-1 rounded-full border border-line p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "write"}
                onClick={() => setTab("write")}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                  tab === "write" ? "bg-surface-2 text-text" : "text-muted",
                )}
              >
                <PenLine aria-hidden className="size-3.5" />
                Write
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "preview"}
                onClick={showPreview}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
                  tab === "preview" ? "bg-surface-2 text-text" : "text-muted",
                )}
              >
                <Eye aria-hidden className="size-3.5" />
                Preview
              </button>
            </div>
          </div>
          {tab === "write" ? (
            <textarea
              {...inputProps("body_markdown")}
              rows={22}
              spellCheck
              className={cn(inputProps("body_markdown").className, "py-3 font-mono text-sm leading-relaxed")}
            />
          ) : (
            <div className="mt-2 min-h-96 rounded-xl border border-line bg-surface p-6">
              {preview === null ? (
                <p className="text-muted">Rendering preview…</p>
              ) : (
                // Rendered by the API with the same sanitiser as the public site.
                <div className="fb-prose" dangerouslySetInnerHTML={{ __html: preview }} />
              )}
            </div>
          )}
          {errorFor("body_markdown") ? (
            <p className="mt-1.5 text-sm text-danger">{errorFor("body_markdown")}</p>
          ) : (
            <p className="mt-1.5 text-sm text-subtle">
              Markdown: ## for headings, **bold**, [links](https://…), - lists. Raw HTML is shown as text.
            </p>
          )}
        </div>

        <fieldset className="grid gap-6 rounded-[var(--radius-panel)] border border-line p-5 sm:grid-cols-2">
          <legend className="px-2 text-sm font-medium text-text">Details</legend>
          {field(
            "category",
            "Topic",
            <select {...inputProps("category")}>
              <option value="">No topic</option>
              {taxonomy.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            "author",
            "Author",
            <select {...inputProps("author")}>
              <option value="">No byline</option>
              {taxonomy.authors.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.name}
                  {a.detail ? ` · ${a.detail}` : ""}
                </option>
              ))}
            </select>,
          )}
          <div className="sm:col-span-2">
            {field("tags", "Tags", <input {...inputProps("tags")} />, "Separate with commas · up to 8")}
          </div>
          {field(
            "cover_image_url",
            "Cover image address",
            <input {...inputProps("cover_image_url")} type="url" />,
            "Optional · https:// only",
          )}
          {field(
            "cover_image_alt",
            "Cover image description",
            <input {...inputProps("cover_image_alt")} />,
            "Required with a cover image",
          )}
          {field(
            "seo_title",
            "Search title",
            <input {...inputProps("seo_title")} maxLength={70} />,
            `Optional · ${counter(form.seo_title, 70)}`,
          )}
          {field(
            "seo_description",
            "Search description",
            <input {...inputProps("seo_description")} maxLength={160} />,
            `Optional · ${counter(form.seo_description, 160)}`,
          )}
        </fieldset>

        {message && (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={cn(
              "rounded-xl border p-4 text-sm",
              message.tone === "error"
                ? "border-danger/40 bg-danger/10 text-text"
                : "border-success/30 bg-success/10 text-text",
            )}
          >
            {message.text}
            {message.conflict && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ms-2 font-medium text-accent underline"
              >
                Reload
              </button>
            )}
          </div>
        )}

        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <ActionButton
              type="submit"
              ready={(article ? dirty : creatable) && busy === null}
              busy={busy === "save"}
              hint={article ? "Nothing to save" : "Add a title, summary and article text"}
            >
              {article ? "Save changes" : "Create draft"}
            </ActionButton>
            <Link href="/admin/insights" className={buttonClasses("secondary", "md")}>
              Back to Insights
            </Link>
          </div>
        )}
      </form>

      {article && (
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start" aria-label="Workflow">
          <section className="fb-panel rounded-[var(--radius-panel)] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-text">Status</h2>
              <ArticleStatus status={article.status} scheduled={article.scheduled} />
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Meta label="Version" value={String(article.version)} />
              {article.last_edited_by && <Meta label="Last edited by" value={article.last_edited_by} />}
              {article.approved_by && <Meta label="Approved by" value={article.approved_by} />}
              {article.published_at && (
                <Meta
                  label="Publication"
                  value={new Date(article.published_at).toUTCString().slice(5, 22) + " UTC"}
                />
              )}
            </dl>

            <div className="mt-5 space-y-3">
              {article.status === "draft" && hasRole(user, "editor") && (
                <WorkflowButton
                  icon={<Send aria-hidden className="size-4" />}
                  busy={busy === "submit"}
                  disabled={dirty || busy !== null}
                  onClick={() => action("submit", "Submitted for review.")}
                >
                  Submit for review
                </WorkflowButton>
              )}
              {canPublish && (
                <>
                  <WorkflowButton
                    primary
                    icon={<Upload aria-hidden className="size-4" />}
                    busy={busy === "publish"}
                    disabled={dirty || busy !== null}
                    onClick={() => action("publish", "Published.")}
                  >
                    Publish now
                  </WorkflowButton>
                  <div className="rounded-xl border border-line p-3">
                    <label htmlFor={`${uid}-schedule`} className="block text-sm text-muted">
                      Or schedule (your local time)
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        id={`${uid}-schedule`}
                        type="datetime-local"
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                        className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm text-text"
                      />
                      <button
                        type="button"
                        disabled={!schedule || dirty || busy !== null}
                        onClick={() =>
                          action("publish", "Scheduled.", { published_at: new Date(schedule).toISOString() })
                        }
                        aria-label="Schedule publication"
                        className={buttonClasses("secondary", "md", "px-3")}
                      >
                        <CalendarClock aria-hidden className="size-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
              {(article.status === "draft" || article.status === "in_review") &&
                !canPublish &&
                ownEdit &&
                hasRole(user, "reviewer") && (
                  <p className="text-sm text-subtle">
                    You edited this last, so another reviewer approves it (maker-checker).
                  </p>
                )}
              {article.status !== "archived" && hasRole(user, "reviewer") && (
                <WorkflowButton
                  icon={<Archive aria-hidden className="size-4" />}
                  busy={busy === "archive"}
                  disabled={busy !== null}
                  onClick={() => action("archive", "Archived. It is no longer public.")}
                >
                  Archive
                </WorkflowButton>
              )}
              {article.status === "archived" && hasRole(user, "reviewer") && (
                <WorkflowButton
                  icon={<RotateCcw aria-hidden className="size-4" />}
                  busy={busy === "restore"}
                  disabled={busy !== null}
                  onClick={() => action("restore", "Restored as a draft.")}
                >
                  Restore as draft
                </WorkflowButton>
              )}
              {dirty && <p className="text-sm text-warning">Save your changes before changing the status.</p>}
            </div>
          </section>

          {versions.length > 0 && (
            <section className="fb-panel rounded-[var(--radius-panel)] p-5">
              <h2 className="font-semibold text-text">History</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {versions.slice(0, 10).map((v) => (
                  <li key={v.version} className="flex justify-between gap-3">
                    <span className="text-text">v{v.version}</span>
                    <span className="truncate text-subtle">
                      {v.edited_by ?? "Unknown"} · {new Date(v.created_at).toUTCString().slice(5, 16)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className="truncate text-text">{value}</dd>
    </div>
  );
}

function WorkflowButton({
  icon,
  busy,
  primary,
  disabled,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  busy: boolean;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={buttonClasses(primary ? "primary" : "secondary", "md", "w-full")}
    >
      {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
