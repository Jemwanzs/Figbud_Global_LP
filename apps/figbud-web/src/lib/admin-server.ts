import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AdminUser } from "./admin-client";
import { apiOrigin } from "./site";

const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");

/** Calls a GET admin endpoint as the signed-in admin (request-time, never cached). */
export async function adminGet<T>(path: string): Promise<{ status: number; data?: T }> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${base}/v1/admin/${path}`, {
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, data: response.ok ? ((await response.json()) as T) : undefined };
  } catch {
    return { status: 503 };
  }
}

/** The signed-in admin, `null` when signed out, or `"unavailable"` if the API is down. */
export async function currentAdmin(): Promise<AdminUser | null | "unavailable"> {
  const { status, data } = await adminGet<{ user: AdminUser; access?: AdminUser["access"] }>("me");
  if (data) return { ...data.user, access: data.access };
  return status === 401 || status === 404 ? null : "unavailable";
}

/** The signed-in admin; redirects to sign-in when there is no session. */
export async function requireAdmin(): Promise<AdminUser | "unavailable"> {
  const user = await currentAdmin();
  if (user === null) redirect("/admin/login");
  return user;
}
