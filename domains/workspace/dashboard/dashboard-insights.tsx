"use client";

interface DashboardInsightsProps {
  labels: {
    insightsTitle: string;
    insightsDescription: string;
    activityTitle: string;
    activityItems: string[];
    agendaTitle: string;
    agendaItems: Array<{
      title: string;
      time: string;
      accent: string;
    }>;
    capacityTitle: string;
    capacityValue: string;
    capacityCaption: string;
    focusTitle: string;
    focusValue: string;
    focusCaption: string;
  };
}

export default function DashboardInsights({ labels }: DashboardInsightsProps) {
  return (
    <aside className="gerit-animate-enter flex flex-col gap-4">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-600 dark:text-sky-400">
          {labels.insightsTitle}
        </p>
        <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-white">
          {labels.insightsDescription}
        </h2>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white dark:bg-slate-800">
            <p className="text-sm text-slate-300">{labels.capacityTitle}</p>
            <strong className="mt-2 block text-3xl">{labels.capacityValue}</strong>
            <p className="mt-2 text-sm text-slate-300">{labels.capacityCaption}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-sm text-slate-500 dark:text-slate-300">{labels.focusTitle}</p>
            <strong className="mt-2 block text-3xl text-slate-900 dark:text-white">
              {labels.focusValue}
            </strong>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{labels.focusCaption}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">
          {labels.activityTitle}
        </h3>
        <ul className="mt-4 space-y-3">
          {labels.activityItems.map((item) => (
            <li
              key={item}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">
          {labels.agendaTitle}
        </h3>
        <ul className="mt-4 space-y-3">
          {labels.agendaItems.map((item) => (
            <li
              key={`${item.title}-${item.time}`}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700"
            >
              <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.accent}`} aria-hidden="true" />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{item.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{item.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
