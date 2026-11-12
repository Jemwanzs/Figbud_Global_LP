import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/admin/auth-card";

export const metadata: Metadata = { title: "Help signing in" };

/**
 * Help signing in (owner's brief, 12 Nov 2026). The same guidance for
 * everyone: it never says whether an account exists or how it signs in.
 * Setting up a password always starts from a way in the person already has
 * (their passkey) or a recovery link from an owner, never from an email
 * address alone.
 */
export default function SignInHelpPage() {
  const link = "font-medium text-accent underline underline-offset-4 hover:text-accent-strong";
  return (
    <AuthCard title="Need help signing in?" lead="Pick what matches your situation.">
      <div className="grid gap-6 text-sm leading-relaxed text-muted">
        <section id="set-up-password" aria-labelledby="h-setup" className="scroll-mt-24">
          <h2 id="h-setup" className="font-medium text-text">
            Set up a password
          </h2>
          <ol className="mt-2 list-decimal space-y-1.5 ps-5">
            <li>
              <Link href="/admin/login" className={link}>
                Sign in with your passkey
              </Link>{" "}
              (your fingerprint, face or screen lock).
            </li>
            <li>Open Settings &amp; Security → Security &amp; Authentication.</li>
            <li>Turn on two-factor with an authenticator app, then create your password.</li>
          </ol>
          <p className="mt-2">From then on you can sign in with either. Your passkeys keep working.</p>
        </section>
        <section aria-labelledby="h-forgot">
          <h2 id="h-forgot" className="font-medium text-text">
            Forgot your password?
          </h2>
          <p className="mt-2">
            <Link href="/admin/forgot-password" className={link}>
              Reset it by email
            </Link>
            , or sign in with your passkey and change it in Security &amp; Authentication. You&apos;ll still
            need your authenticator app.
          </p>
        </section>
        <section aria-labelledby="h-lost">
          <h2 id="h-lost" className="font-medium text-text">
            Lost your passkey and password?
          </h2>
          <p className="mt-2">
            Ask a FigBud Studio owner: they can create a one-time recovery link for you from Users &amp;
            access, or invite you again. If no owner can sign in, contact FigBud&apos;s technical
            administrator.
          </p>
        </section>
        <p>
          <Link href="/admin/login" className={link}>
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
