import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

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
}

export function HubTabs<T extends string>({
  tabs,
  activeTab,
  defaultActiveTab,
  onTabChange,
  className,
}: HubTabsProps<T>) {
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
    <div className={clsx("mb-6", className)}>
      <div>
        <nav className="flex flex-wrap gap-2 px-0" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === resolvedActiveTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleChange(tab.id)}
                className={clsx(
                  "rounded-t-md border border-transparent px-5 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08aee5] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1826]",
                  isActive
                    ? "border-b-[#ffffff] dark:border-b-[#1d272c] border-t border-l border-r border-[#e1e9ef] dark:border-[#000000] bg-[#ffffff] dark:bg-[#1d272c] text-[#000000] dark:text-[#ffffff]"
                    : "border-b-[#e4eaee] dark:border-b-[#1d272c] border-t border-l border-r border-[#e1e9ef] dark:border-[#000000] bg-[#e4eaee] dark:bg-[#000000] text-[#000000] dark:text-[#ffffff]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="px-6 py-5 border border-[#e4eaee] dark:border-[#000000] border-t-[#ffffff] dark:border-t-[#1d272c] rounded-b-md bg-white dark:bg-[#1d272c]">
        {currentTab?.panel}
      </div>
    </div>
  );
}
