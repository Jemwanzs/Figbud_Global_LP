import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { InviteForm } from "@/components/admin/invite-form";

export const metadata: Metadata = { title: "Accept invite" };

export default function AdminInvitePage() {
  return (
    <AuthCard
      title="Welcome to FigBud Admin"
      lead="Choose how you'll sign in: a passkey (recommended: your device keeps it, protected by your fingerprint, face or screen lock) or a password."
    >
      <InviteForm />
    </AuthCard>
  );
}
