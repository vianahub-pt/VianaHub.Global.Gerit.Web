"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";

type CalendarView = "month" | "week" | "day";
type TimerMode = "running" | "manual";

interface DashboardShellState {
  sidebarCollapsed: boolean;
  calendarView: CalendarView;
  timerMode: TimerMode;
  billable: boolean;
}

type DashboardShellAction =
  | { type: "HYDRATE"; payload: Partial<DashboardShellState> }
  | { type: "TOGGLE_SIDEBAR" }
  | { type: "SET_CALENDAR_VIEW"; payload: CalendarView }
  | { type: "TOGGLE_TIMER_MODE" }
  | { type: "TOGGLE_BILLABLE" };

const STORAGE_KEY = "gerit-dashboard-shell";

const initialState: DashboardShellState = {
  sidebarCollapsed: false,
  calendarView: "week",
  timerMode: "running",
  billable: true,
};

function coerceCalendarView(value: unknown): CalendarView {
  if (value === "month" || value === "week" || value === "day") {
    return value;
  }

  if (value === "dashboard") {
    return "day";
  }

  if (value === "timesheet" || value === "tracker") {
    return "week";
  }

  return initialState.calendarView;
}

function reducer(
  state: DashboardShellState,
  action: DashboardShellAction,
): DashboardShellState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        ...action.payload,
      };
    case "TOGGLE_SIDEBAR":
      return {
        ...state,
        sidebarCollapsed: !state.sidebarCollapsed,
      };
    case "SET_CALENDAR_VIEW":
      return {
        ...state,
        calendarView: action.payload,
      };
    case "TOGGLE_TIMER_MODE":
      return {
        ...state,
        timerMode: state.timerMode === "running" ? "manual" : "running",
      };
    case "TOGGLE_BILLABLE":
      return {
        ...state,
        billable: !state.billable,
      };
    default:
      return state;
  }
}

function useDashboardShellValue() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const savedState = window.localStorage.getItem(STORAGE_KEY);

    if (!savedState) {
      return;
    }

    try {
      const parsedState = JSON.parse(savedState) as Partial<
        DashboardShellState & { selectedView?: string }
      >;

      dispatch({
        type: "HYDRATE",
        payload: {
          ...parsedState,
          calendarView: coerceCalendarView(
            parsedState.calendarView ?? parsedState.selectedView,
          ),
        },
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sidebarCollapsed: state.sidebarCollapsed,
        calendarView: state.calendarView,
        timerMode: state.timerMode,
        billable: state.billable,
      }),
    );
  }, [
    state.billable,
    state.calendarView,
    state.sidebarCollapsed,
    state.timerMode,
  ]);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: "TOGGLE_SIDEBAR" });
  }, []);

  const setCalendarView = useCallback((view: CalendarView) => {
    dispatch({ type: "SET_CALENDAR_VIEW", payload: view });
  }, []);

  const toggleTimerMode = useCallback(() => {
    dispatch({ type: "TOGGLE_TIMER_MODE" });
  }, []);

  const toggleBillable = useCallback(() => {
    dispatch({ type: "TOGGLE_BILLABLE" });
  }, []);

  const shellColumns = useMemo(
    () =>
      state.sidebarCollapsed
        ? "xl:grid-cols-[minmax(0,1fr)_320px]"
        : "xl:grid-cols-[minmax(0,1fr)_360px]",
    [state.sidebarCollapsed],
  );

  return {
    state,
    shellColumns,
    toggleSidebar,
    setCalendarView,
    toggleTimerMode,
    toggleBillable,
  };
}

const DashboardShellContext = createContext<ReturnType<
  typeof useDashboardShellValue
> | null>(null);

export function DashboardShellProvider({ children }: { children: ReactNode }) {
  const value = useDashboardShellValue();

  return (
    <DashboardShellContext.Provider value={value}>
      {children}
    </DashboardShellContext.Provider>
  );
}

export function useDashboardShell() {
  const context = useContext(DashboardShellContext);

  if (!context) {
    throw new Error(
      "useDashboardShell must be used within DashboardShellProvider",
    );
  }

  return context;
}
