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
    return "bg-muted text-primary dark:bg-card dark:text-primary";
  }

  if (isWeekend) {
    return "bg-muted text-muted-foreground dark:bg-background dark:text-muted-foreground";
  }

  return "bg-muted text-foreground dark:bg-card dark:text-foreground";
}

function getBodyTone({
  isActive,
  isWeekend,
}: {
  isActive: boolean;
  isWeekend: boolean;
}) {
  if (isActive) {
    return "bg-muted dark:bg-card";
  }

  if (isWeekend) {
    return "bg-background dark:bg-background";
  }

  return "bg-card dark:bg-card";
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
      <div className="flex flex-col gap-3 border-b border-border bg-muted px-4 py-3 dark:border-border dark:bg-muted sm:px-6 md:flex-row md:items-center md:justify-between md:py-2">
        <div className="flex items-center overflow-x-auto">
          <button
            type="button"
            className="flex h-9 items-center border border-border bg-card px-4 text-sm font-medium text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground"
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
                  ? "border-border bg-card text-foreground dark:border-border dark:bg-card dark:text-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-secondary dark:border-border dark:bg-muted dark:text-muted-foreground dark:hover:bg-secondary",
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
              className="flex h-9 items-center gap-2 border border-border bg-card px-4 text-sm font-medium text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground"
              aria-expanded={rangePickerOpen}
            >
              <CalendarDays
                className="h-4 w-4 text-muted-foreground dark:text-muted-foreground"
                aria-hidden="true"
              />
              {buttonPeriodLabel}
            </button>

            {rangePickerOpen ? (
              <div className="gerit-animate-enter absolute right-0 top-11 z-30 flex w-[48rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-sm border border-border bg-card shadow-[0_24px_48px_rgba(15,23,42,0.14)] dark:border-border dark:bg-card dark:shadow-[0_24px_48px_rgba(0,0,0,0.4)]">
                <div className="w-40 shrink-0 border-r border-border bg-secondary py-2 dark:border-border dark:bg-secondary">
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
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary dark:text-muted-foreground dark:hover:bg-secondary",
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
                        <div className="mb-3 text-center text-sm font-semibold text-foreground dark:text-foreground">
                          {pickerMonthLabel}
                        </div>

                        <div className="mb-2 grid grid-cols-7">
                          {weekdayHeaders.map((weekday) => (
                            <div
                              key={`${pickerMonthLabel}-${weekday}`}
                              className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground dark:text-muted-foreground"
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
                                    ? "text-foreground hover:bg-secondary dark:text-foreground dark:hover:bg-secondary"
                                    : "text-muted-foreground hover:bg-secondary dark:text-muted-foreground dark:hover:bg-secondary",
                                  (isWeekStart || isWeekEnd) &&
                                    "bg-primary text-primary-foreground hover:bg-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary",
                                  isWeekMiddle &&
                                    "bg-primary/20 text-primary hover:bg-primary/20 dark:bg-primary dark:text-primary dark:hover:bg-primary",
                                  isSelectedDay &&
                                    !isMonthView &&
                                    !isDayView &&
                                    "ring-2 ring-inset ring-primary",
                                  isSelectedDay &&
                                    (isMonthView || isDayView) &&
                                    "bg-primary text-primary-foreground hover:bg-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary",
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
            className="flex h-9 w-10 items-center justify-center border border-l-0 border-border bg-card text-muted-foreground transition-colors hover:text-foreground dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground"
            aria-label={previousPeriodLabel}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleNextPeriod}
            className="flex h-9 w-10 items-center justify-center border border-l-0 border-border bg-card text-muted-foreground transition-colors hover:text-foreground dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground"
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
          <section className="min-w-[52rem] overflow-hidden rounded-sm border border-border bg-card dark:border-border dark:bg-card">
            <div className="grid grid-cols-7 border-b border-border dark:border-border">
              {weekdayHeaders.map((weekday) => (
                <div
                  key={weekday}
                  className="flex h-11 items-center justify-center border-r border-border bg-secondary text-sm font-medium text-foreground last:border-r-0 dark:border-border dark:bg-secondary dark:text-foreground"
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
                      ? "border-border bg-card text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-card"
                      : "border-border bg-muted text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-card",
                    cell.isWeekend && "dark:bg-background",
                    isSameDay(cell.date, referenceDate) &&
                      "ring-2 ring-inset ring-primary dark:ring-primary",
                  )}
                >
                  <span
                    className={clsx(
                      "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                      isSameDay(cell.date, referenceDate)
                        ? "bg-primary text-white"
                        : cell.isCurrentMonth
                          ? "text-inherit"
                          : "text-inherit/90",
                    )}
                  >
                    {cell.dayNumber}
                  </span>

                  {isSameDay(cell.date, todayDate) ? (
                    <span className="mt-2 text-xs font-medium text-primary">
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
              "min-h-0 flex h-full flex-1 flex-col overflow-hidden rounded-sm border border-border bg-card dark:border-border dark:bg-card",
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
              <div className="flex h-[3.25rem] items-center gap-1 border-b border-r border-border bg-secondary px-3 dark:border-border dark:bg-secondary">
                <button
                  type="button"
                  onClick={() => setSlotMinutes(60)}
                  disabled={slotMinutes === 60}
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center border transition-colors disabled:cursor-default",
                    slotMinutes === 60
                      ? "border-border bg-card text-foreground dark:border-border dark:bg-card dark:text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground dark:border-border dark:bg-secondary dark:text-muted-foreground dark:hover:text-foreground",
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
                      ? "border-border bg-card text-foreground dark:border-border dark:bg-card dark:text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground dark:border-border dark:bg-secondary dark:text-muted-foreground dark:hover:text-foreground",
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
                    "flex h-[3.25rem] flex-col items-center justify-center border-b border-r border-border px-4 text-center text-xs dark:border-border",
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
                      <div className="flex h-[4rem] items-start justify-end border-r border-border bg-card pr-2 pt-3 text-[0.72rem] text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
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
                            "relative h-[4rem] border-r border-b border-dashed border-border text-left transition-colors dark:border-border",
                            getBodyTone({
                              isActive: day.isActive,
                              isWeekend: day.isWeekend,
                            }),
                            selectedGridCell?.dayKey === day.key &&
                              selectedGridCell?.slotLabel === slot.label &&
                              "ring-2 ring-inset ring-primary",
                          )}
                          aria-pressed={
                            selectedGridCell?.dayKey === day.key &&
                            selectedGridCell?.slotLabel === slot.label
                          }
                        >
                          {day.isToday && containsCurrentTime ? (
                            <>
                              <span
                                className="absolute left-2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_rgba(17,183,255,0.9)]"
                                style={{ top: `${currentTimeOffset}%` }}
                              />
                              <span
                                className="absolute left-3 h-[0.18rem] w-[82%] -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_rgba(17,183,255,0.7)]"
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
