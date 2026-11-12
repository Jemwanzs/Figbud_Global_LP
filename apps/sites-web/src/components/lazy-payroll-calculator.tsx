"use client";

import dynamic from "next/dynamic";

/** The payroll calculator, loaded only on its own page (P2-18). */
export const LazyPayrollCalculator = dynamic(() =>
  import("./public-payroll-calculator").then((m) => m.WebsitePayrollCalculator),
);
