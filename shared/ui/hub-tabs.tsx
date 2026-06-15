import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState, useId } from "react";

export type HubTabDefinition<T extends string> = {
  id: T;
  label: React.ReactNode;
  helper?: React.ReactNode;
  panel: React.ReactNode;
};

export interface HubTabsProps<T extends string> {
  tabs: HubTabDefinition<T>[];
  activeTab?: T;
  defaultActiveTab?: T;
  onTabChange?: (tabId: T) => void;
  className?: string;
  dataTestId?: string;
}

export function HubTabs<T extends string>({
  tabs,
  activeTab,
  defaultActiveTab,
  onTabChange,
  className,
  dataTestId,
}: HubTabsProps<T>) {
  const generatedId = useId();
  const fallbackId = tabs[0]?.id;
  const [internalActiveTab, setInternalActiveTab] = useState<T | undefined>(
    defaultActiveTab ?? fallbackId,
  );

  useEffect(() => {
    if (activeTab !== undefined) {
      setInternalActiveTab(activeTab);
    }
  }, [activeTab]);

  const resolvedActiveTab = activeTab ?? internalActiveTab ?? fallbackId;

  const handleChange = useCallback(
    (tabId: T) => {
      if (activeTab === undefined) {
        setInternalActiveTab(tabId);
      }
      onTabChange?.(tabId);
    },
    [activeTab, onTabChange],
  );

  const currentTab = useMemo(
    () => tabs.find((tab) => tab.id === resolvedActiveTab) ?? tabs[0],
    [resolvedActiveTab, tabs],
  );

  return (
    <div className={clsx("mb-6", className)} data-testid={dataTestId ?? `hub-tabs-${generatedId}`}>
      <div>
        <nav className="flex flex-wrap gap-2 px-0" role="tablist" id={`hub-tabs-nav-${generatedId}`}>
          {tabs.map((tab) => {
            const isActive = tab.id === resolvedActiveTab;
            return (
              <button
                key={tab.id}
                id={`hub-tab-${tab.id}-${generatedId}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`hub-tab-panel-${tab.id}-${generatedId}`}
                onClick={() => handleChange(tab.id)}
                className={clsx(
                  "rounded-t-md border border-transparent px-5 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isActive
                    ? "border-b-card dark:border-b-card border-t border-l border-r border-border dark:border-border bg-card dark:bg-card text-foreground dark:text-foreground"
                    : "border-b-secondary dark:border-b-card border-t border-l border-r border-border dark:border-border bg-secondary dark:bg-border text-foreground dark:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div
        id={`hub-tab-panel-${resolvedActiveTab}-${generatedId}`}
        role="tabpanel"
        aria-labelledby={`hub-tab-${resolvedActiveTab}-${generatedId}`}
        className="px-6 py-5 border border-border dark:border-border border-t-card dark:border-t-card rounded-b-md bg-surface dark:bg-surface"
      >
        {currentTab?.panel}
      </div>
    </div>
  );
}
