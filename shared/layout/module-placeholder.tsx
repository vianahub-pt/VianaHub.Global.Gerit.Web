import { WorkspaceShell } from "@/shared/layout/workspace-shell";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <WorkspaceShell>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-[1.75rem] border border-[#d4dde1] bg-white px-6 py-5 text-sm text-[#4b5961] shadow-[0_24px_60px_rgba(15,23,42,0.1)] dark:border-[#17313a] dark:bg-[#07161d] dark:text-[#d7e1e7]">
          {title}
        </div>
      </div>
    </WorkspaceShell>
  );
}

