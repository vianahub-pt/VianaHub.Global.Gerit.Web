"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import { type Language, useTranslation } from "@/platform/i18n";
import { STORAGE_KEYS } from "@/core/constants/storage-keys";
import { getStorageItem } from "@/platform/storage";
import { useDashboardShell, WorkspaceShell } from "@/shared/layout";

const viewTabs = ["month", "week", "day"] as const;
const calendarStartMinutes = 0;
const calendarEndMinutes = 24 * 60;
const baseReferenceDate = new Date(2026, 2, 6);
const calendarRowHeightPx = 64;
type DateFormatPreference = "DD-MM-YYYY" | "MM/DD/YYYY" | "DD/MM/YYYY";
type TimeFormatPreference = "24h" | "12h";
interface StoredPreferencesSnapshot {
  dateFormat?: DateFormatPreference;
  timeFormat?: TimeFormatPreference;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return startOfDay(nextDate);
}

function addMonths(date: Date, months: number) {
  const currentDate = startOfDay(date);
  const tentativeDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + months,
    1,
  );
  const lastDayOfMonth = new Date(
    tentativeDate.getFullYear(),
    tentativeDate.getMonth() + 1,
    0,
  ).getDate();

  return new Date(
    tentativeDate.getFullYear(),
    tentativeDate.getMonth(),
    Math.min(currentDate.getDate(), lastDayOfMonth),
  );
}

function getStartOfWeek(date: Date) {
  const normalizedDate = startOfDay(date);
  const weekDay = normalizedDate.getDay();
  const diffToMonday = weekDay === 0 ? -6 : 1 - weekDay;

  return addDays(normalizedDate, diffToMonday);
}

function isSameDay(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function isSameMonth(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth()
  );
}

function formatShortToken(
  date: Date,
  locale: Language,
  part: "weekday" | "month",
) {
  return new Intl.DateTimeFormat(locale, { [part]: "short" })
    .format(date)
    .replace(/\.$/, "");
}

function formatHeaderDate(date: Date, locale: Language) {
  return `${formatShortToken(date, locale, "weekday")}, ${formatShortToken(
    date,
    locale,
    "month",
  )} ${date.getDate()}`;
}

function formatNumericDate(date: Date, dateFormat: DateFormatPreference) {
  const day = `${date.getDate()}`.padStart(2, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const year = `${date.getFullYear()}`;

  if (dateFormat === "MM/DD/YYYY") {
    return `${month}/${day}/${year}`;
  }

  if (dateFormat === "DD/MM/YYYY") {
    return `${day}/${month}/${year}`;
  }

  return `${day}-${month}-${year}`;
}

function formatMonthYear(date: Date, locale: Language) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(/\.$/, "");
}

function formatTime(minutes: number, timeFormat: TimeFormatPreference) {
  const hours = Math.floor(minutes / 60);
  const mins = `${minutes % 60}`.padStart(2, "0");

  if (timeFormat === "12h") {
    const period = hours >= 12 ? "PM" : "AM";
    const normalizedHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${`${normalizedHours}`.padStart(2, "0")}:${mins} ${period}`;
  }

  return `${`${hours}`.padStart(2, "0")}:${mins}`;
}

function buildTimeSlots(
  intervalMinutes: 30 | 60,
  timeFormat: TimeFormatPreference,
) {
  const slots: Array<{ label: string; minutes: number }> = [];

  for (
    let currentMinutes = calendarStartMinutes;
    currentMinutes < calendarEndMinutes;
    currentMinutes += intervalMinutes
  ) {
    slots.push({
      label: formatTime(currentMinutes, timeFormat),
      minutes: currentMinutes,
    });
  }

  return slots;
}

function buildMonthCells(referenceDate: Date) {
  const monthStart = startOfMonth(referenceDate);
  const gridStart = getStartOfWeek(monthStart);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);

    return {
      date,
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === referenceDate.getMonth(),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
    };
  });
}

function getWeekdayHeaders(locale: Language) {
  const mondayReferenceDate = new Date(2024, 0, 1);

  return Array.from({ length: 7 }, (_, index) =>
    formatShortToken(addDays(mondayReferenceDate, index), locale, "weekday"),
  );
}

function getHeaderTone({
  isActive,
  isWeekend,
}: {
  isActive: boolean;
  isWeekend: boolean;
}) {
  if (isActive) {
    return "bg-[#eef3f5] text-[#21b6ec] dark:bg-[#091821] dark:text-[#15bfff]";
  }

  if (isWeekend) {
    return "bg-[#eef1f3] text-[#6d7980] dark:bg-[#07131a] dark:text-[#b8c6cd]";
  }

  return "bg-[#e6eaed] text-[#445159] dark:bg-[#0b1820] dark:text-[#d7e1e7]";
}

function getBodyTone({
  isActive,
  isWeekend,
}: {
  isActive: boolean;
  isWeekend: boolean;
}) {
  if (isActive) {
    return "bg-[#f4f4f5] dark:bg-[#1a2a35]";
  }

  if (isWeekend) {
    return "bg-[#fafbfc] dark:bg-[#06131a]";
  }

  return "bg-[#fcfcfd] dark:bg-[#13212b]";
}

function GeritDashboardHomeContent() {
  const { state, setCalendarView } = useDashboardShell();
  const { language, t } = useTranslation();
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState<Date | null>(null);
  const [slotMinutes, setSlotMinutes] = useState<30 | 60>(60);
  const [dateFormatPreference, setDateFormatPreference] =
    useState<DateFormatPreference>("DD-MM-YYYY");
  const [timeFormatPreference, setTimeFormatPreference] =
    useState<TimeFormatPreference>("24h");
  const [referenceDate, setReferenceDate] = useState(() =>
    startOfDay(baseReferenceDate),
  );
  const [selectedGridCell, setSelectedGridCell] = useState<{
    dayKey: string;
    slotLabel: string;
  } | null>(null);
  const rangePickerRef = useRef<HTMLDivElement>(null);
  const calendarScrollRef = useRef<HTMLDivElement>(null);

  const locale = language;
  useEffect(() => {
    const syncCalendarPreferences = () => {
      const rawSnapshot = getStorageItem(STORAGE_KEYS.userPreferencesCurrent);

      if (!rawSnapshot) {
        return;
      }

      try {
        const parsedSnapshot = JSON.parse(
          rawSnapshot,
        ) as StoredPreferencesSnapshot;

        if (
          parsedSnapshot.dateFormat === "MM/DD/YYYY" ||
          parsedSnapshot.dateFormat === "DD-MM-YYYY" ||
          parsedSnapshot.dateFormat === "DD/MM/YYYY"
        ) {
          setDateFormatPreference(parsedSnapshot.dateFormat);
        }

        if (
          parsedSnapshot.timeFormat === "12h" ||
          parsedSnapshot.timeFormat === "24h"
        ) {
          setTimeFormatPreference(parsedSnapshot.timeFormat);
        }
      } catch {
        // Ignora dados mal formados no storage local.
      }
    };

    syncCalendarPreferences();
    window.addEventListener("storage", syncCalendarPreferences);

    return () => {
      window.removeEventListener("storage", syncCalendarPreferences);
    };
  }, []);

  const copy = useMemo(
    () => ({
      previousMonth: t("dashboard.previousMonth"),
      nextMonth: t("dashboard.nextMonth"),
      previousWeek: t("dashboard.previousWeek"),
      nextWeek: t("dashboard.nextWeek"),
      previousDay: t("dashboard.previousDay"),
      nextDay: t("dashboard.nextDay"),
      zoomOut: t("dashboard.zoomOut"),
      zoomIn: t("dashboard.zoomIn"),
      tabs: {
        calendar: t("dashboard.tabs.calendar"),
        month: t("dashboard.tabs.month"),
        week: t("dashboard.tabs.week"),
        day: t("dashboard.tabs.day"),
      },
      shortcuts: {
        today: t("dashboard.shortcuts.today"),
        yesterday: t("dashboard.shortcuts.yesterday"),
        tomorrow: t("dashboard.shortcuts.tomorrow"),
        thisWeek: t("dashboard.shortcuts.thisWeek"),
        lastWeek: t("dashboard.shortcuts.lastWeek"),
        thisMonth: t("dashboard.shortcuts.thisMonth"),
        lastMonth: t("dashboard.shortcuts.lastMonth"),
      },
    }),
    [t],
  );
  const timeSlots = useMemo(
    () => buildTimeSlots(slotMinutes, timeFormatPreference),
    [slotMinutes, timeFormatPreference],
  );
  const todayDate = useMemo(
    () => startOfDay(currentDateTime ?? baseReferenceDate),
    [currentDateTime],
  );
  const currentTimeMinutes = useMemo(
    () =>
      currentDateTime === null
        ? 0
        : currentDateTime.getHours() * 60 + currentDateTime.getMinutes(),
    [currentDateTime],
  );
  const currentWeekStart = useMemo(
    () => getStartOfWeek(referenceDate),
    [referenceDate],
  );
  const currentWeekEnd = useMemo(
    () => addDays(currentWeekStart, 6),
    [currentWeekStart],
  );
  const todayWeekStart = useMemo(() => getStartOfWeek(todayDate), [todayDate]);
  const monthCells = useMemo(
    () => buildMonthCells(referenceDate),
    [referenceDate],
  );
  const weekdayHeaders = useMemo(() => getWeekdayHeaders(locale), [locale]);
  const pickerMonthAnchors = useMemo(
    () => [
      startOfMonth(referenceDate),
      addMonths(startOfMonth(referenceDate), 1),
    ],
    [referenceDate],
  );

  const isMonthView = state.calendarView === "month";
  const isDayView = state.calendarView === "day";
  const visibleDays = useMemo(
    () =>
      (isDayView
        ? [referenceDate]
        : Array.from({ length: 7 }, (_, index) =>
            addDays(currentWeekStart, index),
          )
      ).map((date) => ({
        date,
        key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
        label: formatHeaderDate(date, locale),
        time: "",
        isActive: isSameDay(date, referenceDate),
        isToday: isSameDay(date, todayDate),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      })),
    [currentWeekStart, isDayView, locale, referenceDate, todayDate],
  );

  const buttonPeriodLabel = useMemo(() => {
    if (isMonthView) {
      return formatMonthYear(referenceDate, locale);
    }

    if (isDayView) {
      return formatNumericDate(referenceDate, dateFormatPreference);
    }

    return `${formatNumericDate(currentWeekStart, dateFormatPreference)} - ${formatNumericDate(
      currentWeekEnd,
      dateFormatPreference,
    )}`;
  }, [
    currentWeekEnd,
    currentWeekStart,
    dateFormatPreference,
    isDayView,
    isMonthView,
    referenceDate,
  ]);

  const previousPeriodLabel = isMonthView
    ? copy.previousMonth
    : isDayView
      ? copy.previousDay
      : copy.previousWeek;
  const nextPeriodLabel = isMonthView
    ? copy.nextMonth
    : isDayView
      ? copy.nextDay
      : copy.nextWeek;

  const rangeShortcuts = useMemo(() => {
    if (isMonthView) {
      return [
        {
          id: "this-month",
          label: copy.shortcuts.thisMonth,
          active: isSameMonth(referenceDate, todayDate),
          run: () => setReferenceDate(todayDate),
        },
        {
          id: "last-month",
          label: copy.shortcuts.lastMonth,
          active: isSameMonth(referenceDate, addMonths(todayDate, -1)),
          run: () => setReferenceDate(addMonths(todayDate, -1)),
        },
      ];
    }

    if (isDayView) {
      return [
        {
          id: "today",
          label: copy.shortcuts.today,
          active: isSameDay(referenceDate, todayDate),
          run: () => setReferenceDate(todayDate),
        },
        {
          id: "yesterday",
          label: copy.shortcuts.yesterday,
          active: isSameDay(referenceDate, addDays(todayDate, -1)),
          run: () => setReferenceDate(addDays(todayDate, -1)),
        },
        {
          id: "tomorrow",
          label: copy.shortcuts.tomorrow,
          active: isSameDay(referenceDate, addDays(todayDate, 1)),
          run: () => setReferenceDate(addDays(todayDate, 1)),
        },
      ];
    }

    return [
      {
        id: "today",
        label: copy.shortcuts.today,
        active: isSameDay(referenceDate, todayDate),
        run: () => setReferenceDate(todayDate),
      },
      {
        id: "yesterday",
        label: copy.shortcuts.yesterday,
        active: isSameDay(referenceDate, addDays(todayDate, -1)),
        run: () => setReferenceDate(addDays(todayDate, -1)),
      },
      {
        id: "this-week",
        label: copy.shortcuts.thisWeek,
        active: isSameDay(currentWeekStart, todayWeekStart),
        run: () => setReferenceDate(todayDate),
      },
      {
        id: "last-week",
        label: copy.shortcuts.lastWeek,
        active: isSameDay(currentWeekStart, addDays(todayWeekStart, -7)),
        run: () => setReferenceDate(addDays(todayDate, -7)),
      },
    ];
  }, [
    copy.shortcuts.lastMonth,
    copy.shortcuts.lastWeek,
    copy.shortcuts.thisMonth,
    copy.shortcuts.thisWeek,
    copy.shortcuts.today,
    copy.shortcuts.tomorrow,
    copy.shortcuts.yesterday,
    currentWeekStart,
    isDayView,
    isMonthView,
    referenceDate,
    todayDate,
    todayWeekStart,
  ]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const syncCurrentTime = () => {
      setCurrentDateTime(new Date());

      const millisecondsUntilNextMinute = 60000 - (Date.now() % 60000);
      timeoutId = window.setTimeout(
        syncCurrentTime,
        millisecondsUntilNextMinute,
      );
    };

    syncCurrentTime();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!rangePickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rangePickerRef.current?.contains(event.target as Node)) {
        setRangePickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [rangePickerOpen]);

  useEffect(() => {
    if (isMonthView) {
      return;
    }

    const fallbackDay =
      visibleDays.find((day) => isSameDay(day.date, referenceDate)) ??
      visibleDays[0];
    const fallbackSlot =
      timeSlots.find(
        (slot) =>
          currentTimeMinutes >= slot.minutes &&
          currentTimeMinutes < slot.minutes + slotMinutes,
      ) ?? timeSlots[0];

    setSelectedGridCell((currentCell) => {
      const cellStillVisible =
        currentCell !== null &&
        visibleDays.some((day) => day.key === currentCell.dayKey) &&
        timeSlots.some((slot) => slot.label === currentCell.slotLabel);

      if (cellStillVisible) {
        return currentCell;
      }

      if (!fallbackDay || !fallbackSlot) {
        return null;
      }

      return {
        dayKey: fallbackDay.key,
        slotLabel: fallbackSlot.label,
      };
    });
  }, [
    currentTimeMinutes,
    isMonthView,
    referenceDate,
    slotMinutes,
    timeSlots,
    visibleDays,
  ]);

  const centerCurrentTimeInView = () => {
    if (
      isMonthView ||
      currentDateTime === null ||
      !visibleDays.some((day) => day.isToday)
    ) {
      return false;
    }

    const scrollContainer = calendarScrollRef.current;

    if (!scrollContainer) {
      return false;
    }

    const currentSlotIndex = timeSlots.findIndex(
      (slot) =>
        currentTimeMinutes >= slot.minutes &&
        currentTimeMinutes < slot.minutes + slotMinutes,
    );

    if (currentSlotIndex < 0) {
      return false;
    }

    const minutesIntoSlot =
      currentTimeMinutes - timeSlots[currentSlotIndex].minutes;
    const markerOffset =
      currentSlotIndex * calendarRowHeightPx +
      (minutesIntoSlot / slotMinutes) * calendarRowHeightPx;
    const nextScrollTop = Math.max(
      0,
      Math.min(
        markerOffset - scrollContainer.clientHeight / 2,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      ),
    );

    scrollContainer.scrollTop = nextScrollTop;
    return true;
  };

  useEffect(() => {
    if (currentDateTime === null || isMonthView) {
      return;
    }

    centerCurrentTimeInView();
  }, [currentDateTime === null, isMonthView, state.calendarView]);

  const handlePreviousPeriod = () => {
    setReferenceDate((currentDate) => {
      if (isMonthView) {
        return addMonths(currentDate, -1);
      }

      return addDays(currentDate, isDayView ? -1 : -7);
    });
  };

  const handleNextPeriod = () => {
    setReferenceDate((currentDate) => {
      if (isMonthView) {
        return addMonths(currentDate, 1);
      }

      return addDays(currentDate, isDayView ? 1 : 7);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#d9dee2] bg-[#eff2f4] px-4 py-3 dark:border-[#17313a] dark:bg-[#22303a] sm:px-6 md:flex-row md:items-center md:justify-between md:py-2">
        <div className="flex items-center overflow-x-auto">
          <button
            type="button"
            className="flex h-9 items-center border border-[#d3d9de] bg-[#f8f9fa] px-4 text-sm font-medium text-[#b0b9bf] dark:border-[#3a4c55] dark:bg-[#2f414b] dark:text-[#d1dde2]"
            aria-current="page"
          >
            {copy.tabs.calendar}
          </button>

          {viewTabs.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setCalendarView(tabKey)}
              className={clsx(
                "flex h-9 items-center border border-l-0 px-4 text-sm font-medium transition-colors",
                state.calendarView === tabKey
                  ? "border-[#d3d9de] bg-[#f8f9fa] text-[#11191f] dark:border-[#3a4c55] dark:bg-[#2f414b] dark:text-white"
                  : "border-[#d3d9de] bg-[#eff2f4] text-[#6d7980] hover:bg-[#f7f8fa] dark:border-[#3a4c55] dark:bg-[#22303a] dark:text-[#d1dde2] dark:hover:bg-[#2b3b44]",
              )}
              aria-current={state.calendarView === tabKey ? "page" : undefined}
            >
              {copy.tabs[tabKey]}
            </button>
          ))}
        </div>

        <div className="flex items-center self-start md:self-auto">
          <div className="relative" ref={rangePickerRef}>
            <button
              type="button"
              onClick={() => {
                setRangePickerOpen((current) => !current);
              }}
              className="flex h-9 items-center gap-2 border border-[#d3d9de] bg-[#f8f9fa] px-4 text-sm font-medium text-[#65727a] dark:border-[#3a4c55] dark:bg-[#22303a] dark:text-[#d7e1e7]"
              aria-expanded={rangePickerOpen}
            >
              <CalendarDays
                className="h-4 w-4 text-[#b5bcc2] dark:text-[#9db1b9]"
                aria-hidden="true"
              />
              {buttonPeriodLabel}
            </button>

            {rangePickerOpen ? (
              <div className="gerit-animate-enter absolute right-0 top-11 z-30 flex w-[48rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-sm border border-[#d3d9de] bg-[#f8f9fa] shadow-[0_24px_48px_rgba(15,23,42,0.14)] dark:border-[#3a4c55] dark:bg-[#22303a] dark:shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
                <div className="w-40 shrink-0 border-r border-[#d3d9de] bg-[#f6f8f9] py-2 dark:border-[#3a4c55] dark:bg-[#1c2b34]">
                  {rangeShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      type="button"
                      onClick={() => {
                        shortcut.run();
                        setRangePickerOpen(false);
                      }}
                      className={clsx(
                        "flex w-full items-center px-4 py-3 text-left text-sm transition-colors",
                        shortcut.active
                          ? "bg-[#11b7ff] text-white"
                          : "text-[#4b5961] hover:bg-[#eef3f6] dark:text-[#d1dde2] dark:hover:bg-[#2b3b44]",
                      )}
                    >
                      {shortcut.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 gap-5 p-4">
                  {pickerMonthAnchors.map((monthAnchor) => {
                    const pickerCells = buildMonthCells(monthAnchor);
                    const pickerMonthLabel = formatMonthYear(
                      monthAnchor,
                      locale,
                    );

                    return (
                      <div key={pickerMonthLabel} className="min-w-0 flex-1">
                        <div className="mb-3 text-center text-sm font-semibold text-[#48565e] dark:text-[#d1dde2]">
                          {pickerMonthLabel}
                        </div>

                        <div className="mb-2 grid grid-cols-7">
                          {weekdayHeaders.map((weekday) => (
                            <div
                              key={`${pickerMonthLabel}-${weekday}`}
                              className="flex h-8 items-center justify-center text-xs font-medium text-[#6d7980] dark:text-[#9fb0b8]"
                            >
                              {weekday}
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7">
                          {pickerCells.map((cell) => {
                            const isSelectedDay = isSameDay(
                              cell.date,
                              referenceDate,
                            );
                            const isWeekStart =
                              !isMonthView &&
                              !isDayView &&
                              isSameDay(cell.date, currentWeekStart);
                            const isWeekEnd =
                              !isMonthView &&
                              !isDayView &&
                              isSameDay(cell.date, currentWeekEnd);
                            const isWeekMiddle =
                              !isMonthView &&
                              !isDayView &&
                              cell.date > currentWeekStart &&
                              cell.date < currentWeekEnd &&
                              cell.date.getDay() >= 2 &&
                              cell.date.getDay() <= 6;

                            return (
                              <button
                                key={cell.key}
                                type="button"
                                onClick={() => {
                                  setReferenceDate(cell.date);
                                  setRangePickerOpen(false);
                                }}
                                className={clsx(
                                  "flex h-9 items-center justify-center rounded text-sm transition-colors",
                                  cell.isCurrentMonth
                                    ? "text-[#445159] hover:bg-[#eef3f5] dark:text-[#d7e1e7] dark:hover:bg-[#2b3b44]"
                                    : "text-[#a7b0b6] hover:bg-[#eef3f5] dark:text-[#667882] dark:hover:bg-[#2b3b44]",
                                  (isWeekStart || isWeekEnd) &&
                                    "bg-[#3d8fd6] text-white hover:bg-[#3d8fd6] dark:bg-[#3d8fd6] dark:text-white dark:hover:bg-[#3d8fd6]",
                                  isWeekMiddle &&
                                    "bg-[#d6ebfb] text-[#266eb1] hover:bg-[#d6ebfb] dark:bg-[#25557c] dark:text-[#dff1ff] dark:hover:bg-[#25557c]",
                                  isSelectedDay &&
                                    !isMonthView &&
                                    !isDayView &&
                                    "ring-2 ring-inset ring-[#1a6fb7]",
                                  isSelectedDay &&
                                    (isMonthView || isDayView) &&
                                    "bg-[#3d8fd6] text-white hover:bg-[#3d8fd6] dark:bg-[#3d8fd6] dark:text-white dark:hover:bg-[#3d8fd6]",
                                )}
                              >
                                {cell.dayNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handlePreviousPeriod}
            className="flex h-9 w-10 items-center justify-center border border-l-0 border-[#d3d9de] bg-[#f8f9fa] text-[#b5bcc2] transition-colors hover:text-[#526168] dark:border-[#3a4c55] dark:bg-[#22303a] dark:text-[#9db1b9] dark:hover:text-white"
            aria-label={previousPeriodLabel}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleNextPeriod}
            className="flex h-9 w-10 items-center justify-center border border-l-0 border-[#d3d9de] bg-[#f8f9fa] text-[#b5bcc2] transition-colors hover:text-[#526168] dark:border-[#3a4c55] dark:bg-[#22303a] dark:text-[#9db1b9] dark:hover:text-white"
            aria-label={nextPeriodLabel}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className={clsx(
          "min-h-0 flex-1 px-3 py-3 sm:px-4",
          isMonthView
            ? "gerit-calendar-scrollbar overflow-auto"
            : "gerit-calendar-scrollbar flex overflow-x-auto overflow-y-hidden",
        )}
      >
        {isMonthView ? (
          <section className="min-w-[52rem] overflow-hidden rounded-sm border border-[#dce1e5] bg-[#f6f7f8] dark:border-[#17313a] dark:bg-[#0a171e]">
            <div className="grid grid-cols-7 border-b border-[#dce1e5] dark:border-[#17313a]">
              {weekdayHeaders.map((weekday) => (
                <div
                  key={weekday}
                  className="flex h-11 items-center justify-center border-r border-[#dce1e5] bg-[#edf1f4] text-sm font-medium text-[#526168] last:border-r-0 dark:border-[#17313a] dark:bg-[#0f1d25] dark:text-[#c8d5db]"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthCells.map((cell) => (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setReferenceDate(cell.date)}
                  className={clsx(
                    "flex h-28 flex-col items-start justify-start border-r border-b px-3 py-3 text-left transition-colors last:border-r-0",
                    cell.isCurrentMonth
                      ? "border-[#e4e8eb] bg-[#fbfcfd] text-[#3e4a52] hover:bg-[#f3f6f8] dark:border-[#233944] dark:bg-[#13212b] dark:text-[#d7e1e7] dark:hover:bg-[#162733]"
                      : "border-[#e4e8eb] bg-[#f3f5f7] text-[#a2adb4] hover:bg-[#edf2f5] dark:border-[#233944] dark:bg-[#0d1a22] dark:text-[#647985] dark:hover:bg-[#12212a]",
                    cell.isWeekend && "dark:bg-[#0c171f]",
                    isSameDay(cell.date, referenceDate) &&
                      "ring-2 ring-inset ring-[#11b7ff] dark:ring-[#11b7ff]",
                  )}
                >
                  <span
                    className={clsx(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                      isSameDay(cell.date, referenceDate)
                        ? "bg-[#11b7ff] text-white"
                        : cell.isCurrentMonth
                          ? "text-inherit"
                          : "text-inherit/90",
                    )}
                  >
                    {cell.dayNumber}
                  </span>

                  {isSameDay(cell.date, todayDate) ? (
                    <span className="mt-2 text-xs font-medium text-[#11b7ff]">
                      Gerit
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section
            className={clsx(
              "min-h-0 flex h-full flex-1 flex-col overflow-hidden rounded-sm border border-[#dce1e5] bg-[#f6f7f8] dark:border-[#17313a] dark:bg-[#0a171e]",
              isDayView ? "min-w-[24rem]" : "min-w-[68rem]",
            )}
          >
            <div
              className={clsx(
                "grid",
                isDayView
                  ? "grid-cols-[4rem_minmax(0,1fr)]"
                  : "grid-cols-[4rem_repeat(7,minmax(8.75rem,1fr))]",
              )}
            >
              <div className="flex h-[3.25rem] items-center gap-1 border-b border-r border-[#dce1e5] bg-[#edf1f4] px-3 dark:border-[#17313a] dark:bg-[#0f1d25]">
                <button
                  type="button"
                  onClick={() => setSlotMinutes(60)}
                  disabled={slotMinutes === 60}
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center border transition-colors disabled:cursor-default",
                    slotMinutes === 60
                      ? "border-[#bcc6cc] bg-[#f8f9fa] text-[#526168] dark:border-[#335260] dark:bg-[#19303b] dark:text-white"
                      : "border-[#d4dbe0] bg-[#eef2f5] text-[#b8c0c5] hover:text-[#526168] dark:border-[#213844] dark:bg-[#13222b] dark:text-[#90a4ad] dark:hover:text-white",
                  )}
                  aria-pressed={slotMinutes === 60}
                  aria-label={copy.zoomOut}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setSlotMinutes(30)}
                  disabled={slotMinutes === 30}
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center border transition-colors disabled:cursor-default",
                    slotMinutes === 30
                      ? "border-[#bcc6cc] bg-[#f8f9fa] text-[#526168] dark:border-[#335260] dark:bg-[#19303b] dark:text-white"
                      : "border-[#d4dbe0] bg-[#eef2f5] text-[#b8c0c5] hover:text-[#526168] dark:border-[#213844] dark:bg-[#13222b] dark:text-[#90a4ad] dark:hover:text-white",
                  )}
                  aria-pressed={slotMinutes === 30}
                  aria-label={copy.zoomIn}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {visibleDays.map((day) => (
                <div
                  key={day.key}
                  className={clsx(
                    "flex h-[3.25rem] flex-col items-center justify-center border-b border-r border-[#dce1e5] px-4 text-center text-xs dark:border-[#17313a]",
                    getHeaderTone({
                      isActive: day.isActive,
                      isWeekend: day.isWeekend,
                    }),
                  )}
                >
                  <span className="font-medium">{day.label}</span>
                  {day.time ? (
                    <span className="mt-1 text-[0.92rem] text-inherit/90">
                      {day.time}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <div
              ref={calendarScrollRef}
              className="gerit-calendar-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
            >
              <div
                className={clsx(
                  "grid",
                  isDayView
                    ? "grid-cols-[4rem_minmax(0,1fr)]"
                    : "grid-cols-[4rem_repeat(7,minmax(8.75rem,1fr))]",
                )}
              >
                {timeSlots.map((slot) => {
                  const containsCurrentTime =
                    currentDateTime !== null &&
                    currentTimeMinutes >= slot.minutes &&
                    currentTimeMinutes < slot.minutes + slotMinutes;
                  const currentTimeOffset =
                    currentDateTime === null
                      ? 0
                      : ((currentTimeMinutes - slot.minutes) / slotMinutes) *
                        100;

                  return (
                    <Fragment key={slot.label}>
                      <div className="flex h-[4rem] items-start justify-end border-r border-[#e1e5e8] bg-[#fbfcfd] pr-2 pt-3 text-[0.72rem] text-[#b3bcc2] dark:border-[#17313a] dark:bg-[#13212b] dark:text-[#8ea3ad]">
                        {slot.label}
                      </div>

                      {visibleDays.map((day) => (
                        <button
                          key={`${day.key}-${slot.label}`}
                          type="button"
                          onClick={() => {
                            setReferenceDate(day.date);
                            setSelectedGridCell({
                              dayKey: day.key,
                              slotLabel: slot.label,
                            });
                          }}
                          className={clsx(
                            "relative h-[4rem] border-r border-b border-dashed border-[#e4e8eb] text-left transition-colors dark:border-[#233944]",
                            getBodyTone({
                              isActive: day.isActive,
                              isWeekend: day.isWeekend,
                            }),
                            selectedGridCell?.dayKey === day.key &&
                              selectedGridCell?.slotLabel === slot.label &&
                              "ring-2 ring-inset ring-[#11b7ff]",
                          )}
                          aria-pressed={
                            selectedGridCell?.dayKey === day.key &&
                            selectedGridCell?.slotLabel === slot.label
                          }
                        >
                          {day.isToday && containsCurrentTime ? (
                            <>
                              <span
                                className="absolute left-2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#11b7ff] shadow-[0_0_12px_rgba(17,183,255,0.9)]"
                                style={{ top: `${currentTimeOffset}%` }}
                              />
                              <span
                                className="absolute left-3 h-[0.18rem] w-[82%] -translate-y-1/2 rounded-full bg-[#11b7ff] shadow-[0_0_18px_rgba(17,183,255,0.7)]"
                                style={{ top: `${currentTimeOffset}%` }}
                              />
                            </>
                          ) : null}
                        </button>
                      ))}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function GeritDashboardHome() {
  return (
    <WorkspaceShell>
      <GeritDashboardHomeContent />
    </WorkspaceShell>
  );
}
