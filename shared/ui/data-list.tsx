"use client";

interface DataListProps {
  items: { label: string; value: string }[];
}

export function DataList({ items }: DataListProps) {
  return (
    <dl>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
