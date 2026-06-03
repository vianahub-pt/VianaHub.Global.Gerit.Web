"use client";

import * as React from "react";

// Limite de toasts visíveis simultaneamente
const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToastVariant = "default" | "destructive";

export interface ToastProps {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ActionType =
  | { type: "ADD_TOAST"; toast: ToastProps }
  | { type: "UPDATE_TOAST"; toast: Partial<ToastProps> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

interface State {
  toasts: ToastProps[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<ActionType>) {
  if (toastTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: ActionType): State {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };
    case "DISMISS_TOAST": {
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined
            ? { ...t, open: false }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: action.toastId
          ? state.toasts.filter((t) => t.id !== action.toastId)
          : [],
      };
    default:
      return state;
  }
}

let count = 0;
function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// Estado global compartilhado entre instâncias do hook
const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: ActionType) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));

  if (action.type === "DISMISS_TOAST") {
    const { toastId } = action;
    if (toastId) {
      addToRemoveQueue(toastId, dispatch);
    } else {
      memoryState.toasts.forEach((t) => addToRemoveQueue(t.id, dispatch));
    }
  }
}

type ToastInput = Omit<ToastProps, "id">;

function toast(props: ToastInput) {
  const id = genId();
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });
  dispatch({
    type: "ADD_TOAST",
    toast: { ...props, id, open: true, onOpenChange: (open) => { if (!open) dismiss(); } },
  });
  return { id, dismiss, update: (p: ToastInput) => dispatch({ type: "UPDATE_TOAST", toast: { ...p, id } }) };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}
