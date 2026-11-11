import type { DemoKind } from "./product-demos";

/**
 * Demonstrations with steps, which scrolling can guide (`GuidedDemo`, owner's
 * brief, 12 Nov 2026), and how many steps each has. A plain module, not a
 * client one, so the server-rendered page blocks can read it. Keep in step
 * with the demonstrations in product-demos.tsx.
 */
export const GUIDED_STEPS: Partial<Record<DemoKind, number>> = {
  pay_run: 5,
  payslip: 6,
  self_service: 3,
  leave_flow: 5,
  team_calendar: 5,
  attendance: 6,
};
