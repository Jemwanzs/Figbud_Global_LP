import { cn } from "@figbud/ui";

export type EnquiryStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

export const ENQUIRY_STATUSES: { value: EnquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" },
];

export const KIND_LABELS: Record<string, string> = {
  demo_request: "Demo request",
  contact: "Contact",
  early_access: "Early access",
  waitlist: "Waitlist",
  partnership: "Partnership",
  sales: "Sales",
};

export const PRODUCT_LABELS: Record<string, string> = {
  figbud: "FigBud Global",
  zirahr: "ZiraHR",
  jasiri: "Jasiri LMS",
  expense_now: "Expense Now",
  ziwa: "Ziwa LMS",
};

/** How each outbox state reads to a person following up an enquiry. */
export const EMAIL_STATES: Record<string, string> = {
  pending: "Waiting to send (held until email delivery is configured)",
  sending: "Sending",
  retry: "Retrying after a delivery problem",
  sent: "Delivered to the email provider",
  failed: "Failed; not delivered",
  skipped: "Not sent (simulated in development)",
};

export const TEMPLATE_LABELS: Record<string, string> = {
  team_notification: "Team notification",
  visitor_acknowledgement: "Acknowledgement to the visitor",
};

const STYLES: Record<EnquiryStatus, string> = {
  new: "border-accent/40 bg-accent-soft text-accent-strong",
  contacted: "border-warning/40 bg-warning/10 text-warning",
  qualified: "border-success/30 bg-success/10 text-success",
  closed: "border-line bg-surface-2 text-subtle",
  spam: "border-danger/30 bg-danger/10 text-danger",
};

export function EnquiryStatusPill({ status }: { status: EnquiryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {ENQUIRY_STATUSES.find((s) => s.value === status)?.label ?? status}
    </span>
  );
}
