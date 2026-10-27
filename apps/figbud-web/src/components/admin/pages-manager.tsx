"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { ArrowDown, ArrowUp, CalendarClock, Copy, GripVertical, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { type AdminUser, AdminError, type FieldError, adminFetch, hasRole } from "@/lib/admin-client";
import { useSavedBaseline } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import { PATH_PATTERN, type PageList, type PageSummary, type PageTemplate, toPath } from "./page-types";
import { categoryLabel } from "./site-labels";

function PageState({ page }: { page: PageSummary }) {
  const badge = "rounded-full border px-2 py-0.5 text-xs";
  if (page.archived_at) return <span className={cn(badge, "border-line text-subtle")}>Archived</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      <span
        className={cn(badge, page.published ? "border-success/30 text-success" : "border-line text-muted")}
      >
        {page.published ? "Published" : "Not published"}
      </span>
      {page.pending ? (
        <span className={cn(badge, "border-warning/40 bg-warning/10 text-warning")}>Awaiting approval</span>
      ) : page.scheduled_at ? (
        <span
          className={cn(badge, "inline-flex items-center gap-1 border-accent/40 bg-accent-soft/60 text-text")}
        >
          <CalendarClock aria-hidden className="size-3.5 text-accent" />
          Scheduled · <LocalTime iso={page.scheduled_at} />
        </span>
      ) : (
        page.published &&
        page.draft_differs && <span className={cn(badge, "border-line text-muted")}>Draft changes</span>
      )}
    </span>
  );
}

/** A website's pages: create from a template, order (drag or keyboard), duplicate, archive. */
export function PagesManager({ slug, user, initial }: { slug: string; user: AdminUser; initial: PageList }) {
  const router = useRouter();
  const uid = useId();
  const canEdit = hasRole(user, "editor");
  const canArchive = hasRole(user, "reviewer");
  const live = initial.pages.filter((p) => !p.archived_at);
  const archived = initial.pages.filter((p) => p.archived_at);

  const [order, setOrder] = useState(live.map((p) => p.id));
  const { dirty: orderChanged, markSaved: markOrderSaved } = useSavedBaseline(
    order,
    live.map((p) => p.id),
  );
  const [dragging, setDragging] = useState<number | null>(null);

  // Suggested title and address for a template, unless the address is already used.
  const suggestion = (t: PageTemplate | undefined) =>
    t && t.id !== "blank" && !live.some((p) => p.path === t.path)
      ? { title: t.title, path: t.path }
      : { title: "", path: "" };
  const first = initial.templates[0];
  const [template, setTemplate] = useState(first?.id ?? "blank");
  const [title, setTitle] = useState(suggestion(first).title);
  const [path, setPath] = useState(suggestion(first).path);
  const [titleTouched, setTitleTouched] = useState(false);
  const [pathTouched, setPathTouched] = useState(false);
  const [fields, setFields] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const byId = new Map(initial.pages.map((p) => [p.id, p]));
  const errorFor = (field: string) => fields.find((f) => f.field === field)?.message;
  const normalPath = path.trim().replace(/^\/+|\/+$/g, "");
  const takenBy = live.find((p) => p.path === normalPath);
  const creatable = title.trim() !== "" && PATH_PATTERN.test(normalPath) && !takenBy;
  const own = initial.templates.filter((t) => t.category);
  const general = initial.templates.filter((t) => !t.category);
  const choose = (t: PageTemplate) => {
    setTemplate(t.id);
    const next = suggestion(t);
    if (!titleTouched) setTitle(next.title);
    // Once the title is the admin's own, the address keeps following it.
    if (!pathTouched) setPath(titleTouched ? toPath(title) : next.path);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  async function act(label: string, fn: () => Promise<unknown>, success: string) {
    setBusy(label);
    setMessage(null);
    setFields([]);
    try {
      await fn();
      setMessage({ tone: "ok", text: success });
      router.refresh();
    } catch (err) {
      if (err instanceof AdminError) setFields(err.fields);
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    setMessage(null);
    setFields([]);
    try {
      const created = await adminFetch<{ id: string }>(`sites/${slug}/pages`, {
        title: title.trim(),
        path: path.trim(),
        template,
      });
      router.push(`/admin/sites/${slug}/pages/${created.id}`);
    } catch (err) {
      if (err instanceof AdminError) setFields(err.fields);
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
      setBusy(null);
    }
  }

  const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text";

  return (
    <div className="space-y-8">
      {canEdit && (
        <section aria-labelledby={`${uid}-new`} className="fb-panel rounded-[var(--radius-panel)] p-6">
          <h2 id={`${uid}-new`} className="font-semibold text-text">
            New page
          </h2>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (creatable && !busy) create();
            }}
            className="mt-4 space-y-5"
          >
            <fieldset>
              <legend className="text-sm font-medium text-text">Start from</legend>
              {[
                {
                  heading: own.length ? `For ${categoryLabel(initial.site.category)} websites` : null,
                  list: own,
                },
                { heading: own.length ? "For any website" : null, list: general },
              ]
                .filter((group) => group.list.length > 0)
                .map((group) => (
                  <div key={group.heading ?? "all"} className="mt-3">
                    {group.heading && <p className="mb-2 text-xs font-medium text-subtle">{group.heading}</p>}
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {group.list.map((t) => (
                        <label
                          key={t.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                            template === t.id
                              ? "border-accent bg-accent-soft/60"
                              : "border-line hover:border-line-strong",
                          )}
                        >
                          <input
                            type="radio"
                            name={`${uid}-template`}
                            value={t.id}
                            checked={template === t.id}
                            onChange={() => choose(t)}
                            className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-text">{t.label}</span>
                            <span className="block text-sm text-muted">{t.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </fieldset>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <div>
                <label htmlFor={`${uid}-title`} className="block text-sm font-medium text-text">
                  Page title
                </label>
                <input
                  id={`${uid}-title`}
                  value={title}
                  maxLength={120}
                  onChange={(e) => {
                    setTitleTouched(true);
                    setTitle(e.target.value);
                    if (!pathTouched) setPath(toPath(e.target.value));
                  }}
                  aria-invalid={errorFor("title") ? true : undefined}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`${uid}-path`} className="block text-sm font-medium text-text">
                  Address
                </label>
                <input
                  id={`${uid}-path`}
                  value={path}
                  maxLength={180}
                  onChange={(e) => {
                    setPathTouched(true);
                    setPath(e.target.value);
                  }}
                  aria-invalid={errorFor("path") ? true : undefined}
                  aria-describedby={`${uid}-path-hint`}
                  className={cn(inputClass, "font-mono text-sm")}
                />
              </div>
              <ActionButton
                type="submit"
                ready={creatable}
                busy={busy === "create"}
                icon={<Plus aria-hidden className="size-4" />}
              >
                Create page
              </ActionButton>
            </div>
          </form>
          <p
            id={`${uid}-path-hint`}
            className={cn(
              "mt-2 text-sm",
              errorFor("path") || errorFor("title") || takenBy ? "text-danger" : "text-subtle",
            )}
          >
            {errorFor("path") ??
              errorFor("title") ??
              (takenBy
                ? `/${normalPath} is already used by “${takenBy.title}”. Choose another address.`
                : `/${normalPath} · leave the address empty for the home page. New pages are drafts until approved.`)}
          </p>
        </section>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {message.text}
        </p>
      )}

      <section aria-labelledby={`${uid}-pages`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${uid}-pages`} className="font-semibold text-text">
            Pages <span className="font-normal text-subtle">· in navigation order</span>
          </h2>
          {canEdit && live.length > 1 && (
            <ActionButton
              variant="secondary"
              ready={orderChanged && !busy}
              busy={busy === "order"}
              hint="Drag pages or use the arrows to reorder"
              onClick={() =>
                act(
                  "order",
                  async () => {
                    await adminFetch(`sites/${slug}/pages/order`, { ids: order });
                    markOrderSaved(order);
                  },
                  "Order saved.",
                )
              }
            >
              Save order
            </ActionButton>
          )}
        </div>
        {live.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-8 text-center text-muted">
            No pages yet. Start with a home page.
          </p>
        ) : (
          <ol className="mt-4 space-y-2" aria-label="Pages">
            {order.map((id, i) => {
              const page = byId.get(id)!;
              return (
                <li
                  key={id}
                  draggable={canEdit}
                  onDragStart={() => setDragging(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragging !== null) move(dragging, i);
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors",
                    dragging === i && "border-accent opacity-70",
                  )}
                >
                  {canEdit && (
                    <GripVertical aria-hidden className="size-5 shrink-0 cursor-grab text-subtle" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/sites/${slug}/pages/${id}`}
                      className="font-medium text-text hover:underline"
                    >
                      {page.title}
                    </Link>
                    <p className="font-mono text-xs text-subtle">/{page.path}</p>
                  </div>
                  <PageState page={page} />
                  <span className="text-xs text-subtle">
                    {page.sections} {page.sections === 1 ? "section" : "sections"}
                  </span>
                  <div className="flex gap-1">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => move(i, i - 1)}
                          disabled={i === 0}
                          className={buttonClasses("ghost", "md", "px-2.5")}
                        >
                          <ArrowUp aria-hidden className="size-4" />
                          <span className="sr-only">Move {page.title} up</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, i + 1)}
                          disabled={i === order.length - 1}
                          className={buttonClasses("ghost", "md", "px-2.5")}
                        >
                          <ArrowDown aria-hidden className="size-4" />
                          <span className="sr-only">Move {page.title} down</span>
                        </button>
                        <button
                          type="button"
                          disabled={!!busy || orderChanged}
                          title={orderChanged ? "Save the order first" : undefined}
                          onClick={() =>
                            act(
                              `dup-${id}`,
                              () => adminFetch(`pages/${id}/duplicate`, {}),
                              "Page duplicated as a draft.",
                            )
                          }
                          className={buttonClasses("ghost", "md", "px-2.5")}
                        >
                          <Copy aria-hidden className="size-4" />
                          <span className="sr-only">Duplicate {page.title}</span>
                        </button>
                      </>
                    )}
                    <Link
                      href={`/admin/sites/${slug}/pages/${id}`}
                      className={buttonClasses("secondary", "md", "px-4")}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Edit<span className="sr-only"> {page.title}</span>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {orderChanged && <p className="mt-2 text-sm text-warning">The new order isn&apos;t saved yet.</p>}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby={`${uid}-archived`}>
          <h2 id={`${uid}-archived`} className="font-semibold text-text">
            Archived
          </h2>
          <ul className="mt-3 space-y-2">
            {archived.map((page) => (
              <li
                key={page.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3 opacity-80"
              >
                <span className="min-w-0 flex-1 text-text">
                  {page.title} <span className="font-mono text-xs text-subtle">/{page.path}</span>
                </span>
                {canArchive && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      act(
                        `restore-${page.id}`,
                        () => adminFetch(`pages/${page.id}/restore`, {}),
                        "Page restored.",
                      )
                    }
                    className={buttonClasses("ghost", "md")}
                  >
                    Restore<span className="sr-only"> {page.title}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
