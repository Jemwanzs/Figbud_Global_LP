import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <AuthCard
      title="Sign in to FigBud Admin"
      lead="Use the passkey on this device: your fingerprint, face or screen lock."
    >
      <LoginForm />
    </AuthCard>
  );
}
