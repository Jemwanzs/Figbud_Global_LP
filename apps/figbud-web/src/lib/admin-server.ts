import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { AdminUser } from "./admin-client";
import { apiOrigin } from "./site";

const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");

/**
 * Calls a GET admin endpoint as the signed-in admin: fresh on every request,
 * never cached between requests or people, and asked once per request (the
 * Studio layout and a page asking for the same list share one call).
 */
export async function adminGet<T>(path: string): Promise<{ status: number; data?: T }> {
  return (await getOnce(path)) as { status: number; data?: T };
}

const getOnce = cache(async (path: string): Promise<{ status: number; data?: unknown }> => {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${base}/v1/admin/${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, data: response.ok ? await response.json() : undefined };
  } catch {
    return { status: 503 };
  }
});

/**
 * The signed-in admin, `null` when signed out, or `"unavailable"` if the API is
 * down. Asked once per request: the Studio layout and the page share it.
 */
export const currentAdmin = cache(async (): Promise<AdminUser | null | "unavailable"> => {
  const { status, data } = await adminGet<{ user: AdminUser; access?: AdminUser["access"] }>("me");
  if (data) return { ...data.user, access: data.access };
  return status === 401 || status === 404 ? null : "unavailable";
});

/** The signed-in admin; redirects to sign-in when there is no session. */
export async function requireAdmin(): Promise<AdminUser | "unavailable"> {
  const user = await currentAdmin();
  if (user === null) redirect("/admin/login");
  return user;
}
