

export function ModulePlaceholder({ title }: { title: string }) {
  return (
      <div data-testid="module-placeholder-root" className="flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center p-6">
        <div className="rounded-[1.75rem] border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-[0_24px_60px_rgba(15,23,42,0.1)] dark:border-border dark:bg-card dark:text-muted-foreground">
          {title}
        </div>
      </div>
  );
}

