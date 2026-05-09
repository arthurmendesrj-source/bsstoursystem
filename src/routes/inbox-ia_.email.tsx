import { createFileRoute } from "@tanstack/react-router";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { TriageEmailPanel } from "@/components/inbox-ia/TriageEmailPanel";

export const Route = createFileRoute("/inbox-ia_/email")({
  component: () => (
    <AuthGate>
      <AppShell>
        <TriageEmailPanel />
      </AppShell>
    </AuthGate>
  ),
});
