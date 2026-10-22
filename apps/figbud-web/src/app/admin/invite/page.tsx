import type { Metadata } from "next";

import { AuthCard } from "@/components/admin/auth-card";
import { InviteForm } from "@/components/admin/invite-form";

export const metadata: Metadata = { title: "Accept invite" };

export default function AdminInvitePage() {
  return (
    <AuthCard
      title="Welcome to FigBud Admin"
      lead="Create a passkey to sign in. There is no password: your device keeps the key, protected by your fingerprint, face or screen lock."
    >
      <InviteForm />
    </AuthCard>
  );
}
