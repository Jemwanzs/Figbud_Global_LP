import Link from "next/link";

import { AuthCard } from "./auth-card";
import { StudioProblem } from "./studio-states";

/**
 * The admin service couldn't be reached. Inside the Studio it shows in the
 * content area (the shell stays); `standalone` is for pages without the shell.
 */
export function AdminUnavailable({ standalone = false }: { standalone?: boolean }) {
  if (!standalone) {
    return (
      <StudioProblem
        title="This section is temporarily unavailable"
        lead="We couldn't reach the admin service. Please try again in a moment."
      />
    );
  }
  return (
    <AuthCard
      title="Admin is temporarily unavailable"
      lead="We couldn't reach the admin service. Please try again in a moment."
    >
      <Link href="/admin" className="font-medium text-accent hover:underline">
        Try again
      </Link>
    </AuthCard>
  );
}
