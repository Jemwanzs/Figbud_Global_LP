import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { ResetPasswordForm } from "@/components/admin/password-recovery";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      lead="You'll still need your authenticator app to sign in afterwards."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
