import { IdentityPreferencesProvider } from "@/domains/identity/preferences";
import { WorkspaceHeaderControls } from "@/domains/workspace/workspace-header-controls";
import { WorkspaceShell } from "@/shared/layout";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <IdentityPreferencesProvider>
      <WorkspaceShell headerControls={<WorkspaceHeaderControls />}>
        {children}
      </WorkspaceShell>
    </IdentityPreferencesProvider>
  );
}
