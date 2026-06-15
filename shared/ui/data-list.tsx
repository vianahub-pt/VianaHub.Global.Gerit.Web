"use client";

import { useId } from "react";

interface DataListProps {
  items: { label: string; value: string }[];
  dataTestId?: string;
}

export function DataList({ items, dataTestId }: DataListProps) {
  const generatedId = useId();
  return (
    <dl data-testid={dataTestId ?? `data-list-${generatedId}`} id={`data-list-${generatedId}`}>
      {items.map((item, index) => (
        <div key={item.label} id={`data-list-item-${generatedId}-${index}`}>
          <dt id={`data-list-label-${generatedId}-${index}`}>{item.label}</dt>
          <dd id={`data-list-value-${generatedId}-${index}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
