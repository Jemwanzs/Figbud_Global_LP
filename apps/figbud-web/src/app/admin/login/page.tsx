import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <AuthCard
      title="Welcome back to FigBud Studio"
      lead="Your workspace, your way. Choose how you'd like to sign in."
    >
      <LoginForm />
    </AuthCard>
  );
}
