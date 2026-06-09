"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { STORAGE_KEYS } from "@/core/constants/storage-keys";
import { DEFAULT_LANGUAGE, normalizeLanguageTag } from "@/platform/i18n/language";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "@/platform/storage";

const AUTH_STORAGE_KEY = STORAGE_KEYS.authSession;
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60000;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  roleId: number | null;
  roleName: string;
  userId: number;
  userName: string;
  tenantId: number;
  tenantName: string;
  email: string;
  name: string;
}

interface AuthTokenClaims {
  sub?: string;
  tenant_id?: string;
  email?: string;
  role?: string[] | string;
  permissions?: Record<string, string[]>;
  exp?: number;
  nbf?: number;
}

interface SignInPayload {
  email: string;
  password: string;
}

interface RefreshPayload {
  tenantId: number;
  refreshToken: string;
}

interface AuthState {
  status: "hydrating" | "anonymous" | "authenticating" | "authenticated";
  session: AuthSession | null;
  error: string | null;
}

type AuthAction =
  | { type: "HYDRATE_SESSION"; payload: AuthSession | null }
  | { type: "SIGN_IN_START" }
  | { type: "SIGN_IN_SUCCESS"; payload: AuthSession }
  | { type: "SIGN_IN_FAILURE"; payload: string }
  | { type: "SIGN_OUT" };

const initialState: AuthState = {
  status: "hydrating",
  session: null,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "HYDRATE_SESSION":
      return {
        status: action.payload ? "authenticated" : "anonymous",
        session: action.payload,
        error: null,
      };
    case "SIGN_IN_START":
      return {
        ...state,
        status: "authenticating",
        error: null,
      };
    case "SIGN_IN_SUCCESS":
      return {
        status: "authenticated",
        session: action.payload,
        error: null,
      };
    case "SIGN_IN_FAILURE":
      return {
        status: "anonymous",
        session: null,
        error: action.payload,
      };
    case "SIGN_OUT":
      return {
        status: "anonymous",
        session: null,
        error: null,
      };
    default:
      return state;
  }
}

function isValidDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

function isAuthSession(payload: unknown): payload is AuthSession {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const candidate = payload as Partial<AuthSession>;

  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === "string" &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.accessTokenExpiresAt === "string" &&
    isValidDate(candidate.accessTokenExpiresAt) &&
    typeof candidate.refreshTokenExpiresAt === "string" &&
    isValidDate(candidate.refreshTokenExpiresAt) &&
    (typeof candidate.roleId === "number" || candidate.roleId === null) &&
    typeof candidate.roleName === "string" &&
    typeof candidate.userId === "number" &&
    typeof candidate.userName === "string" &&
    typeof candidate.tenantId === "number" &&
    typeof candidate.tenantName === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.name === "string"
  );
}

function normalizeAuthSession(payload: unknown): AuthSession | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as Partial<{
    accessToken: unknown;
    refreshToken: unknown;
    accessTokenExpiresAt: unknown;
    refreshTokenExpiresAt: unknown;
    roleId: unknown;
    roleName: unknown;
    userId: unknown;
    userName: unknown;
    tenantId: unknown;
    tenantName: unknown;
    email: unknown;
    name: unknown;
  }>;

  if (
    typeof candidate.accessToken !== "string" ||
    candidate.accessToken.length === 0 ||
    typeof candidate.refreshToken !== "string" ||
    candidate.refreshToken.length === 0 ||
    typeof candidate.accessTokenExpiresAt !== "string" ||
    !isValidDate(candidate.accessTokenExpiresAt) ||
    typeof candidate.refreshTokenExpiresAt !== "string" ||
    !isValidDate(candidate.refreshTokenExpiresAt) ||
    typeof candidate.userId !== "number" ||
    typeof candidate.tenantId !== "number" ||
    typeof candidate.email !== "string"
  ) {
    return null;
  }

  const normalizedUserName =
    typeof candidate.userName === "string" && candidate.userName.trim().length > 0
      ? candidate.userName.trim()
      : typeof candidate.name === "string" && candidate.name.trim().length > 0
        ? candidate.name.trim()
        : candidate.email;

  const normalizedTenantName =
    typeof candidate.tenantName === "string" && candidate.tenantName.trim().length > 0
      ? candidate.tenantName.trim()
      : String(candidate.tenantId);

  const normalizedRoleName =
    typeof candidate.roleName === "string" ? candidate.roleName : "";

  const normalizedSession: AuthSession = {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    accessTokenExpiresAt: candidate.accessTokenExpiresAt,
    refreshTokenExpiresAt: candidate.refreshTokenExpiresAt,
    roleId: typeof candidate.roleId === "number" ? candidate.roleId : null,
    roleName: normalizedRoleName,
    userId: candidate.userId,
    userName: normalizedUserName,
    tenantId: candidate.tenantId,
    tenantName: normalizedTenantName,
    email: candidate.email,
    name: normalizedUserName,
  };

  return isAuthSession(normalizedSession) ? normalizedSession : null;
}

function isSessionExpired(session: AuthSession) {
  return Date.parse(session.refreshTokenExpiresAt) <= Date.now();
}

function isAccessTokenExpiring(session: AuthSession) {
  return (
    Date.parse(session.accessTokenExpiresAt) <=
    Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS
  );
}

function clearPersistedSession() {
  removeStorageItem(AUTH_STORAGE_KEY);
}

function persistSession(session: AuthSession) {
  setStorageItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function restorePersistedSession() {
  const rawSession = getStorageItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = normalizeAuthSession(JSON.parse(rawSession) as unknown);

    if (!parsedSession || isSessionExpired(parsedSession)) {
      clearPersistedSession();
      return null;
    }

    return parsedSession;
  } catch {
    clearPersistedSession();
    return null;
  }
}

function decodeAccessTokenClaims(accessToken: string) {
  try {
    const [, payload] = accessToken.split(".");

    if (!payload) {
      return null;
    }

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalizedBase64 = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const decoded = window.atob(normalizedBase64);
    const claims = JSON.parse(decoded) as AuthTokenClaims;

    return claims;
  } catch {
    return null;
  }
}

function getPreferredRequestLanguage() {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  return normalizeLanguageTag(getStorageItem(STORAGE_KEYS.language));
}

function normalizeAuthError(payload: unknown) {
  if (typeof payload === "object" && payload !== null) {
    const candidate = payload as Record<string, unknown>;

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }

    if (typeof candidate.title === "string" && candidate.title.trim()) {
      return candidate.title;
    }

    if (typeof candidate.error === "string" && candidate.error.trim()) {
      return candidate.error;
    }
  }

  return "Nao foi possivel autenticar com as credenciais indicadas.";
}

const AuthContext = createContext<{
  state: AuthState;
  session: AuthSession | null;
  claims: AuthTokenClaims | null;
  roles: string[];
  permissions: Record<string, string[]>;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isAuthenticating: boolean;
  signIn: (payload: SignInPayload) => Promise<AuthSession>;
  signOut: () => void;
  signOutAndRedirect: () => void;
  refreshSession: () => Promise<AuthSession | null>;
  fetchWithAuth: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response | null>;
  hasPermission: (resource: string, action: string) => boolean;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const refreshPromiseRef = useRef<Promise<AuthSession | null> | null>(null);

  useEffect(() => {
    const persistedSession = restorePersistedSession();

    dispatch({
      type: "HYDRATE_SESSION",
      payload: persistedSession,
    });
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY) {
        return;
      }

      dispatch({
        type: "HYDRATE_SESSION",
        payload: restorePersistedSession(),
      });
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const signOut = useCallback(() => {
    clearPersistedSession();
    dispatch({ type: "SIGN_OUT" });
  }, []);

  const signOutAndRedirect = useCallback(() => {
    clearPersistedSession();
    dispatch({ type: "SIGN_OUT" });

    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }, []);

  const persistAuthenticatedSession = useCallback((session: AuthSession) => {
    persistSession(session);
    dispatch({ type: "SIGN_IN_SUCCESS", payload: session });
  }, []);

  useEffect(() => {
    if (!state.session) {
      return;
    }

    const activeSession = state.session;

    const syncSessionLifetime = () => {
      if (isSessionExpired(activeSession)) {
        signOutAndRedirect();
      }
    };

    syncSessionLifetime();

    const intervalId = window.setInterval(syncSessionLifetime, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [signOutAndRedirect, state.session]);

  const signIn = useCallback(async (payload: SignInPayload) => {
    dispatch({ type: "SIGN_IN_START" });

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Accept-Language": getPreferredRequestLanguage(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawResponsePayload = (await response.json().catch(() => null)) as unknown;
      const responsePayload = normalizeAuthSession(rawResponsePayload);

      if (!response.ok || !responsePayload) {
        const message = response.ok
          ? "Resposta de autenticacao invalida."
          : normalizeAuthError(rawResponsePayload);

        throw new Error(message);
      }

      persistAuthenticatedSession(responsePayload);

      return responsePayload;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Nao foi possivel autenticar com as credenciais indicadas.";

      dispatch({ type: "SIGN_IN_FAILURE", payload: message });
      throw new Error(message);
    }
  }, [persistAuthenticatedSession]);

  const refreshSession = useCallback(async () => {
    const activeSession = state.session;

    if (!activeSession) {
      return null;
    }

    if (isSessionExpired(activeSession)) {
      signOutAndRedirect();
      return null;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      const payload: RefreshPayload = {
        tenantId: activeSession.tenantId,
        refreshToken: activeSession.refreshToken,
      };

      try {
        const response = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: {
            "Accept-Language": getPreferredRequestLanguage(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const rawResponsePayload = (await response.json().catch(() => null)) as unknown;
        const responsePayload = normalizeAuthSession(rawResponsePayload);

        if (!response.ok || !responsePayload) {
          signOutAndRedirect();
          return null;
        }

        persistAuthenticatedSession(responsePayload);

        return responsePayload;
      } catch {
        signOutAndRedirect();
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [persistAuthenticatedSession, signOutAndRedirect, state.session]);

  const getActiveSession = useCallback(async () => {
    const activeSession = state.session;

    if (!activeSession) {
      return null;
    }

    if (isSessionExpired(activeSession)) {
      signOutAndRedirect();
      return null;
    }

    if (isAccessTokenExpiring(activeSession)) {
      return refreshSession();
    }

    return activeSession;
  }, [refreshSession, signOutAndRedirect, state.session]);

  const fetchWithAuth = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const activeSession = await getActiveSession();

      if (!activeSession) {
        return null;
      }

      const buildHeaders = (accessToken: string) => {
        const headers = new Headers(init.headers);

        headers.set("Authorization", `Bearer ${accessToken}`);

        if (!headers.has("Accept-Language")) {
          headers.set("Accept-Language", getPreferredRequestLanguage());
        }

        return headers;
      };

      let response = await fetch(input, {
        ...init,
        headers: buildHeaders(activeSession.accessToken),
      });

      if (response.status !== 401) {
        return response;
      }

      const renewedSession = await refreshSession();

      if (!renewedSession) {
        return null;
      }

      response = await fetch(input, {
        ...init,
        headers: buildHeaders(renewedSession.accessToken),
      });

      if (response.status === 401) {
        signOutAndRedirect();
        return null;
      }

      return response;
    },
    [getActiveSession, refreshSession, signOutAndRedirect],
  );

  const activeSession = useMemo(() => {
    if (state.session === null || isSessionExpired(state.session)) {
      return null;
    }

    return state.session;
  }, [state.session]);

  const claims = useMemo(
    () =>
      activeSession === null
        ? null
        : decodeAccessTokenClaims(activeSession.accessToken),
    [activeSession],
  );

  const roles = useMemo(() => {
    if (!claims?.role) {
      return [];
    }

    return Array.isArray(claims.role) ? claims.role : [claims.role];
  }, [claims]);

  const permissions = useMemo(
    () => claims?.permissions ?? {},
    [claims],
  );

  const hasPermission = useCallback(
    (resource: string, action: string) => {
      const allowedActions = permissions[resource] ?? [];
      return allowedActions.includes(action);
    },
    [permissions],
  );

  const value = useMemo(
    () => ({
      state,
      session: activeSession,
      claims,
      roles,
      permissions,
      isAuthenticated: state.status === "authenticated" && activeSession !== null,
      isHydrating: state.status === "hydrating",
      isAuthenticating: state.status === "authenticating",
      signIn,
      signOut,
      signOutAndRedirect,
      refreshSession,
      fetchWithAuth,
      hasPermission,
    }),
    [
      activeSession,
      claims,
      fetchWithAuth,
      hasPermission,
      permissions,
      refreshSession,
      roles,
      signIn,
      signOut,
      signOutAndRedirect,
      state,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
