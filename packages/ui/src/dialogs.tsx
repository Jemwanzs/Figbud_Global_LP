"use client";

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { buttonClasses } from "./button";
import { cn } from "./cn";

/*
 * In-app confirmations and notifications (owner's brief, 14 Nov 2026): one
 * design for every FigBud website and the Studio, instead of the browser's
 * own alert(), confirm() and prompt() (which show the hosting domain and
 * ignore the website's look). They use the theme's tokens, so each website,
 * and the Studio, show them in their own colours, light or dark.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Remove this item?", tone: "danger", confirmLabel: "Remove" }))) return;
 *
 * With `onConfirm`, the dialog stays open while it runs (the button shows
 * progress, can't be pressed twice, and the dialog can't be dismissed), and
 * shows the error if it fails, so nothing reports success that didn't happen.
 * Cancelling never runs anything. Confirmation never replaces the server's
 * own permission and validation checks.
 */

export type DialogTone = "default" | "danger" | "warning";

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  /** Runs on confirm; the dialog shows progress and any error, and closes when it succeeds. */
  onConfirm?: () => Promise<void>;
}

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  body?: string;
  /** An optional action, such as Retry or Undo. */
  action?: { label: string; run: () => void };
  /** Milliseconds before it goes (errors stay until dismissed). */
  duration?: number;
}

/** The provider's own wording, in the website's language (English by default). */
export interface DialogLabels {
  confirm: string;
  cancel: string;
  dismiss: string;
  notifications: string;
  failed: string;
}

const ENGLISH: DialogLabels = {
  confirm: "Confirm",
  cancel: "Cancel",
  dismiss: "Dismiss notification",
  notifications: "Notifications",
  failed: "Something went wrong. Please try again.",
};

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface Toast extends ToastOptions {
  id: number;
}

const DialogContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (options: ToastOptions) => void;
} | null>(null);

/** Asks for confirmation in an in-app dialog; resolves `true` only when confirmed (and `onConfirm` succeeded). */
export function useConfirm() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useConfirm needs a DialogProvider");
  return context.confirm;
}

/** Shows a short, non-blocking notification. */
export function useToast() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useToast needs a DialogProvider");
  return context.toast;
}

const TONE_ICON = { default: Info, danger: TriangleAlert, warning: CircleAlert } as const;
const TOAST_ICON = { success: CircleCheck, info: Info, warning: CircleAlert, error: TriangleAlert } as const;
const TOAST_COLOUR = {
  success: "text-success",
  info: "text-accent",
  warning: "text-warning",
  error: "text-danger",
} as const;

export function DialogProvider({
  children,
  labels: given,
}: {
  children: ReactNode;
  /** Wording in the website's language. */
  labels?: Partial<DialogLabels>;
}) {
  const labels = { ...ENGLISH, ...given };
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // The open request, and whether its action is running: refs, so a second
  // press before the next render is still refused.
  const current = useRef<Pending | null>(null);
  const running = useRef(false);
  const nextId = useRef(1);
  const uid = useId();

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // One at a time: a newer request cancels an unanswered one (never while its action runs).
        if (running.current) return resolve(false);
        current.current?.resolve(false);
        if (!current.current)
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        current.current = { ...options, resolve };
        setError(null);
        setBusy(false);
        setPending(current.current);
      }),
    [],
  );

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((all) =>
        // No duplicates, and no more than three at once.
        [
          ...all.filter((t) => t.title !== options.title || t.body !== options.body),
          { ...options, id },
        ].slice(-3),
      );
      const duration = options.duration ?? (options.tone === "error" ? 0 : 5_000);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  // Opens and closes the native dialog (focus is trapped inside while open).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending) {
      if (!dialog.open) dialog.showModal();
      // The confirm button, or Cancel for destructive actions (the safe choice).
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const finish = (ok: boolean) => {
    current.current?.resolve(ok);
    current.current = null;
    running.current = false;
    setPending(null);
    setBusy(false);
    // Back to whatever opened it.
    window.setTimeout(() => opener.current?.focus(), 0);
  };

  const accept = async () => {
    if (!pending || running.current) return;
    if (!pending.onConfirm) return finish(true);
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await pending.onConfirm();
      finish(true);
    } catch (err) {
      running.current = false;
      setBusy(false);
      setError(err instanceof Error && err.message ? err.message : labels.failed);
    }
  };

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast]);
  const tone = pending?.tone ?? "default";
  const Icon = TONE_ICON[tone];

  return (
    <DialogContext.Provider value={value}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        aria-describedby={pending?.body ? `${uid}-body` : undefined}
        data-confirm-dialog=""
        // Escape cancels, unless an action is running.
        onCancel={(e) => {
          e.preventDefault();
          if (!running.current) finish(false);
        }}
        // A click on the backdrop cancels, unless an action is running.
        onClick={(e) => {
          if (e.target === e.currentTarget && !running.current) finish(false);
        }}
        className="fb-overlay m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-bg p-0 text-text shadow-[var(--shadow-elevated)] backdrop:bg-black/60"
      >
        {pending && (
          <div className="p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                  tone === "danger"
                    ? "bg-danger/10 text-danger"
                    : tone === "warning"
                      ? "bg-warning/10 text-warning"
                      : "bg-accent-soft text-accent",
                )}
              >
                <Icon className="size-[1.1rem]" />
              </span>
              <div className="min-w-0">
                <h2 id={`${uid}-title`} className="text-lg font-semibold tracking-tight text-text">
                  {pending.title}
                </h2>
                {pending.body && (
                  <div id={`${uid}-body`} className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                    {pending.body}
                  </div>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => finish(false)}
                // Destructive actions start on the safe choice.
                data-autofocus={tone === "danger" ? "" : undefined}
                className={buttonClasses("secondary", "md")}
              >
                {pending.cancelLabel ?? labels.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={accept}
                data-autofocus={tone !== "danger" ? "" : undefined}
                className={cn(
                  buttonClasses("primary", "md"),
                  tone === "danger" && "bg-danger text-white hover:bg-danger/90",
                )}
              >
                {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                {pending.confirmLabel ?? labels.confirm}
              </button>
            </div>
          </div>
        )}
      </dialog>
      {/* A named region (landmark), so the page's content stays in landmarks even while it's empty. */}
      <section aria-label={labels.notifications}>
        <ol className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:end-4 sm:w-96">
          {toasts.map((t) => {
            const ToastIcon = TOAST_ICON[t.tone ?? "info"];
            return (
              <li
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                data-toast={t.tone ?? "info"}
                className="fb-rise pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-line bg-bg p-4 text-sm shadow-[var(--shadow-elevated)] [animation-duration:.3s]"
              >
                <ToastIcon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", TOAST_COLOUR[t.tone ?? "info"])}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-muted">{t.body}</p>}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        dismiss(t.id);
                        t.action!.run();
                      }}
                      className="mt-2 font-medium text-accent underline underline-offset-2"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={labels.dismiss}
                  onClick={() => dismiss(t.id)}
                  className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-text"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </DialogContext.Provider>
  );
}
