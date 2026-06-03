"use client";

interface CounterProps {
  value: number;
  label: string;
}

export function Counter({ value, label }: CounterProps) {
  return (
    <div className="text-center">
      <span className="text-4xl font-bold">{value}</span>
      <p className="text-sm">{label}</p>
    </div>
  );
}
