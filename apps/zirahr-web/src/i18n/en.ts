/**
 * ZiraHR website copy (English). Only confirmed positioning and the scope in
 * the master brief: no customer names, figures or regulatory claims.
 * Translations join once a native speaker has reviewed them (Q6).
 */
const en = {
  meta: {
    siteName: "ZiraHR",
    title: "ZiraHR · People. Payroll. Progress. Connected.",
    description:
      "ZiraHR is the connected workforce platform from FigBud Global: employee records, rules-based payroll, leave, attendance and approvals in one configurable system.",
  },
  header: {
    navLabel: "ZiraHR",
    nav: {
      platform: "Platform",
      modules: "Modules",
      solutions: "Solutions",
      payrollCalculator: "Payroll Calculator",
      resources: "Resources",
      pricing: "Pricing",
      company: "Company",
    } as Record<string, string>,
    cta: "Book a demo",
    backToFigbud: "Back to FigBud Global",
    opensInNewTab: "opens in a new tab",
    menu: { open: "Open menu", close: "Close menu" },
    theme: { toLight: "Switch to light theme", toDark: "Switch to dark theme" },
    language: { label: "Language", inReview: "In review" },
  },
  footer: {
    tagline: "The connected workforce platform: people, payroll and progress in one place.",
    explore: "Explore ZiraHR",
    ecosystem: "The FigBud ecosystem",
    company: "FigBud Global",
    about: "About FigBud Global",
    contact: "Contact",
    privacy: "Privacy",
    terms: "Terms",
    partOf: "{product} is a FigBud Global platform.",
  },
  skipToContent: "Skip to content",
  home: {
    eyebrow: "The Connected Workforce",
    title: "People. Payroll. Progress. Connected.",
    lead: "People aren't spreadsheets. Your HR platform shouldn't treat them like one.",
    secondaryCta: "Explore the modules",
    modulesTitle: "One platform for the whole employee journey",
    modulesLead:
      "From an employee's first day to their last, every record, approval and payslip lives in one configurable system.",
    modules: [
      {
        title: "Employee 360",
        body: "Onboarding, confirmation, promotion and departure in one complete record.",
      },
      {
        title: "Payroll and compliance",
        body: "Rules-based, effective-dated payroll, with Kenya as the starting point.",
      },
      { title: "Leave", body: "Requests, balances and approvals that flow without chasing." },
      { title: "Attendance", body: "Shifts, geofencing and clock-ins for teams on site and on the move." },
      { title: "Approvals", body: "Configurable approval chains that follow how your organisation works." },
      { title: "Performance", body: "Goals, reviews and progress, connected to the people record." },
      { title: "Collaboration", body: "Keep teams connected around the work they share." },
      { title: "Executive analytics", body: "Workforce insight for the people who lead the organisation." },
      {
        title: "Employee self-service",
        body: "Payslips, leave and personal details, available to every employee.",
      },
      {
        title: "Reporting",
        body: "The reports HR, finance and leadership rely on, without spreadsheet work.",
      },
    ],
    payrollTitle: "Payroll you can stand behind",
    payrollBody:
      "Statutory rules change during the year. ZiraHR calculates with the rules that applied on each date, so every period stays correct and explainable.",
    finalTitle: "See ZiraHR with your own workflows",
    finalBody:
      "Tell us how your organisation runs payroll, leave and approvals, and we'll show you ZiraHR configured for it.",
  },
  section: {
    eyebrow: "Coming soon",
    body: "This page is being prepared. In the meantime, our team will gladly walk you through ZiraHR.",
    back: "Back to the ZiraHR home page",
  },
};

export type Dictionary = typeof en;
export default en;
