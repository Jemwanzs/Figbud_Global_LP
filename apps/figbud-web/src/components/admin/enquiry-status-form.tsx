"use client";

import { buttonClasses } from "@figbud/ui";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminFetch, describePasskeyError } from "@/lib/admin-client";

import { ENQUIRY_STATUSES, type EnquiryStatus } from "./enquiry-labels";

/** Moves an enquiry along new → contacted → qualified → closed (or spam). */
export function EnquiryStatusForm({ id, status }: { id: string; status: EnquiryStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saved, setSaved] = useState(status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage(null);
        try {
          await adminFetch(`enquiries/${id}/status`, { status: value });
          setSaved(value);
          setMessage({ tone: "ok", text: "Status updated." });
          router.refresh();
        } catch (err) {
          setMessage({ tone: "error", text: describePasskeyError(err) });
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <label htmlFor="enquiry-status" className="block text-sm font-medium text-text">
          Follow-up status
        </label>
        <select
          id="enquiry-status"
          value={value}
          onChange={(e) => setValue(e.target.value as EnquiryStatus)}
          className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text"
        >
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={busy || value === saved} className={buttonClasses("primary", "md")}>
        {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        Update status
      </button>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
