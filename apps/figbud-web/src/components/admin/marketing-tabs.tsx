import { cn } from "@figbud/ui";
import Link from "next/link";

const TABS = [
  { href: "/admin/marketing", key: "campaigns", label: "Campaigns & Promotions" },
  { href: "/admin/proof?kind=organization", key: "organization", label: "Trusted By" },
  { href: "/admin/proof?kind=testimonial", key: "testimonial", label: "Testimonials" },
  { href: "/admin/proof?kind=metric", key: "metric", label: "Success metrics" },
] as const;

/** Content & Marketing sections, shared by their list pages. */
export function MarketingTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Content & Marketing" className="mt-6 [scrollbar-width:none] overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={tab.key === active ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors",
                tab.key === active
                  ? "border-accent font-medium text-text"
                  : "border-transparent text-muted hover:text-text",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
