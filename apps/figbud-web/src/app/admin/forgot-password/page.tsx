import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { ForgotPasswordForm } from "@/components/admin/password-recovery";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      lead="Enter your work email and we'll send a link to choose a new one."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
