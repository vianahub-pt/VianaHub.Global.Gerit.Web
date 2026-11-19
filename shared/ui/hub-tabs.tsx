"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export type HubTabDefinition<T extends string> = {
  id: T;
  label: ReactNode;
  helper?: ReactNode;
  panel?: ReactNode;
  panelId?: string;
  disabled?: boolean;
};

export interface HubTabsProps<T extends string> {
  tabs: HubTabDefinition<T>[];
  activeTab?: T;
  defaultActiveTab?: T;
  onTabChange?: (tabId: T) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;
  renderPanel?: boolean;
}

export function HubTabs<T extends string>({
  tabs,
  activeTab,
  defaultActiveTab,
  onTabChange,
  ariaLabel,
  id,
  className,
  renderPanel = true,
}: HubTabsProps<T>) {
  const fallbackId = tabs.find((tab) => !tab.disabled)?.id;
  const [internalActiveTab, setInternalActiveTab] = useState<T | undefined>(defaultActiveTab ?? fallbackId);
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());
  const resolvedActiveTab = activeTab ?? internalActiveTab ?? fallbackId;
  const currentTab = tabs.find((tab) => tab.id === resolvedActiveTab) ?? tabs.find((tab) => !tab.disabled);

  const handleChange = (tabId: T) => {
    if (tabs.find((tab) => tab.id === tabId)?.disabled) return;
    if (activeTab === undefined) setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentId: T) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (enabled.length < 1) return;
    const index = enabled.findIndex((tab) => tab.id === currentId);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % enabled.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + enabled.length) % enabled.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabled.length - 1;
    else return;
    event.preventDefault();
    const next = enabled[nextIndex];
    tabRefs.current.get(next.id)?.focus();
    handleChange(next.id);
  };

  return (
    <div className={clsx("mb-6", className)}>
      <nav className="flex min-w-0 gap-3 overflow-x-auto border-b border-border/80" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isActive = tab.id === currentTab?.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = tab.panelId ?? `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(node) => { if (node) tabRefs.current.set(tab.id, node); else tabRefs.current.delete(tab.id); }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={tab.panel !== undefined || tab.panelId ? panelId : undefined}
              aria-disabled={tab.disabled || undefined}
              tabIndex={isActive ? 0 : -1}
              disabled={tab.disabled}
              onKeyDown={(event) => handleKeyDown(event, tab.id)}
              onClick={() => handleChange(tab.id)}
              className={clsx(
                "relative shrink-0 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0 after:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive && "text-foreground after:opacity-100",
                tab.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {renderPanel && currentTab?.panel !== undefined ? (
        <div
          id={currentTab.panelId ?? `${baseId}-panel-${currentTab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${currentTab.id}`}
          tabIndex={0}
          className="border border-t-0 border-border bg-surface px-6 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {currentTab.panel}
        </div>
      ) : null}
    </div>
  );
}
