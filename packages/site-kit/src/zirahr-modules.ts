import {
  BookOpen,
  CalendarCheck,
  Clock,
  type LucideIcon,
  MonitorSmartphone,
  Target,
  UserRound,
  UserSearch,
  Users,
  Wallet,
} from "lucide-react";

/*
 * ZiraHR's eight core modules, in their approved order (owner's brief, 8 Nov
 * 2026): one catalogue for the hero, the eight-module showcase and anything
 * else that lists them, so they can't drift apart. The API keeps the same keys
 * (`services/api/src/pages/blocks.rs`, `ZIRAHR_MODULE_KEYS`) for the hero's
 * Studio settings. Employee Self-Service runs across all of them, so it's kept
 * apart: a capability, not a ninth module.
 */

export type ZiraModule = {
  key: ZiraModuleKey;
  /** Full name, as on the Platform page. */
  name: string;
  /** Short label for small cards. */
  label: string;
  /** A few words under the label. */
  note: string;
  /** One line for the module showcase. */
  line: string;
  icon: LucideIcon;
};

export const ZIRAHR_MODULE_KEYS = [
  "core_hr",
  "payroll",
  "leave",
  "attendance",
  "performance",
  "teams",
  "recruitment",
  "learning",
] as const;
export type ZiraModuleKey = (typeof ZIRAHR_MODULE_KEYS)[number];

export const ZIRAHR_MODULES: readonly ZiraModule[] = [
  {
    key: "core_hr",
    name: "Core HR & Employee 360",
    label: "Core HR",
    note: "Employee 360",
    line: "Every record, contract and milestone in one place.",
    icon: UserRound,
  },
  {
    key: "payroll",
    name: "Payroll & Statutory Compliance",
    label: "Payroll",
    note: "Statutory ready",
    line: "From earnings and deductions to approvals and reports.",
    icon: Wallet,
  },
  {
    key: "leave",
    name: "Leave Management",
    label: "Leave",
    note: "Requests and approvals",
    line: "Requests, approvals and balances without the back-and-forth.",
    icon: CalendarCheck,
  },
  {
    key: "attendance",
    name: "Time & Attendance",
    label: "Attendance",
    note: "Time and shifts",
    line: "Working time, shifts and overtime, clearly.",
    icon: Clock,
  },
  {
    key: "performance",
    name: "Performance Management",
    label: "Performance",
    note: "Goals and reviews",
    line: "Goals, feedback and progress, connected.",
    icon: Target,
  },
  {
    key: "teams",
    name: "Teams & Collaboration",
    label: "Teams",
    note: "Work together",
    line: "A shared home for work, updates and approvals.",
    icon: Users,
  },
  {
    key: "recruitment",
    name: "Recruitment",
    label: "Recruitment",
    note: "Hire to first day",
    line: "From first application to first day.",
    icon: UserSearch,
  },
  {
    key: "learning",
    name: "Learning & Development",
    label: "Learning",
    note: "Training and growth",
    line: "Training, skills and growth in the employee journey.",
    icon: BookOpen,
  },
];

/** Employee Self-Service: across every module, in any web browser (never a native app). */
export const ZIRAHR_SELF_SERVICE = {
  name: "Employee Self-Service",
  label: "Self-service",
  note: "In any browser",
  icon: MonitorSmartphone,
} as const;

/** The modules in the order chosen in the Studio (unknown or repeated keys ignored), else all eight. */
export function ziraModules(keys?: readonly string[] | null): ZiraModule[] {
  const chosen = [...new Set(keys ?? [])]
    .map((key) => ZIRAHR_MODULES.find((m) => m.key === key))
    .filter((m): m is ZiraModule => !!m);
  return chosen.length ? chosen : [...ZIRAHR_MODULES];
}
