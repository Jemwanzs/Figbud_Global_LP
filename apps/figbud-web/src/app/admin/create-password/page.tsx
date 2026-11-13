import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { CreatePassword } from "@/components/admin/create-password";

export const metadata: Metadata = { title: "Create password" };

/** Create or reset a Studio password, confirmed with a passkey; no email involved. */
export default function CreatePasswordPage() {
  return (
    <AuthCard
      title="Create or reset your password"
      lead="Confirm it's you with your passkey, then choose a password for signing in on any device."
    >
      <CreatePassword />
    </AuthCard>
  );
}
