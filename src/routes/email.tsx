import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { EmailPanel } from "@/components/email/EmailPanel";

export const Route = createFileRoute("/email")({
  component: () => (
    <AuthGate>
      <AppShell>
        <EmailPanel mode="full" />
      </AppShell>
    </AuthGate>
  ),
});
