import { buttonClasses } from "@figbud/ui";
import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/admin/auth-card";
import { ForgotPasswordForm } from "@/components/admin/password-recovery";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * Forgotten passwords (owner's brief, 13 Nov 2026): no email is needed. A
 * passkey resets it; otherwise an owner creates a one-time recovery link in
 * the Studio. Email links remain where email is set up. An email address
 * alone never resets anything.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      lead="Reset it with your passkey. Without one, an owner can give you a one-time recovery link."
    >
      <Link href="/admin/create-password" className={buttonClasses("primary", "lg", "w-full")}>
        <KeyRound aria-hidden className="size-4" />
        Reset with your passkey
      </Link>
      <p className="mt-3 text-sm text-muted">
        No passkey on this device? Ask a Studio owner: they can create a one-time recovery link for you in
        Users &amp; access. It works once and expires.
      </p>
      <details className="mt-6 border-t border-line pt-5">
        <summary className="cursor-pointer text-sm font-medium text-text">Or get a link by email</summary>
        <p className="mt-2 mb-4 text-sm text-muted">
          Only where the Studio sends email, and only for accounts with two-factor (you&apos;ll still need
          your authenticator app).
        </p>
        <ForgotPasswordForm />
      </details>
      <p className="mt-6 text-sm">
        <Link href="/admin/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
