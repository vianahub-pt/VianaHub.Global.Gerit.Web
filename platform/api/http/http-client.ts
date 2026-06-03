import { useMemo } from "react";
import { useAuth } from "@/platform/auth";
import { useTenant } from "@/platform/tenant/tenant-context";

interface HttpRequestOptions extends RequestInit {
  authenticated?: boolean;
  tenantScoped?: boolean;
}

export function useHttpClient() {
  const { fetchWithAuth } = useAuth();
  const { activeTenantId } = useTenant();

  return useMemo(() => {
    const request = async (url: string, options: HttpRequestOptions = {}) => {
      const {
        authenticated = true,
        tenantScoped = true,
        headers,
        ...rest
      } = options;

      const finalHeaders = new Headers(headers);

      if (tenantScoped && activeTenantId !== null) {
        finalHeaders.set("X-Tenant-Id", String(activeTenantId));
      }

      if (authenticated) {
        return fetchWithAuth(url, {
          ...rest,
          headers: finalHeaders,
        });
      }

      return fetch(url, {
        ...rest,
        headers: finalHeaders,
      });
    };

    return {
      request,
      get: (url: string, options: HttpRequestOptions = {}) =>
        request(url, { ...options, method: "GET" }),
      post: (url: string, body: unknown, options: HttpRequestOptions = {}) =>
        request(url, {
          ...options,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(new Headers(options.headers)),
          },
          body: JSON.stringify(body),
        }),
      put: (url: string, body: unknown, options: HttpRequestOptions = {}) =>
        request(url, {
          ...options,
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(new Headers(options.headers)),
          },
          body: JSON.stringify(body),
        }),
      patch: (url: string, body: unknown, options: HttpRequestOptions = {}) =>
        request(url, {
          ...options,
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(new Headers(options.headers)),
          },
          body: JSON.stringify(body),
        }),
      delete: (url: string, options: HttpRequestOptions = {}) =>
        request(url, { ...options, method: "DELETE" }),
    };
  }, [activeTenantId, fetchWithAuth]);
}

