"use client";

import {
  PayrollCalculator,
  PayrollError,
  type PayrollInput,
  type PayrollResult,
  type PublicPayrollCalculator,
} from "@figbud/site-kit/payroll-calculator";
import { useCallback } from "react";

/** The website's calculator, asking this website's own endpoint. */
export function WebsitePayrollCalculator({
  calculator,
  endpoint,
}: {
  calculator: PublicPayrollCalculator;
  endpoint: string;
}) {
  const calculate = useCallback(
    async (input: PayrollInput, signal: AbortSignal): Promise<PayrollResult> => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const field = data?.error?.fields?.[0];
        throw new PayrollError(
          field?.message ?? data?.error?.message ?? "The calculator isn't available right now.",
          field?.field === "amount" || field?.field === "pay_month" ? field.field : undefined,
        );
      }
      return data.result;
    },
    [endpoint],
  );
  return (
    <PayrollCalculator
      calculate={calculate}
      exampleGross={calculator.example_gross}
      exampleNet={calculator.example_net}
      disclaimer={calculator.disclaimer}
    />
  );
}
