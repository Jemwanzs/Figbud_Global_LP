import "server-only";

import { DEFAULT_PRIVACY, type PrivacySettings } from "@figbud/site-kit";
import { fetchPrivacySettings } from "@figbud/site-kit/server";
import { cacheLife, cacheTag } from "next/cache";

import { apiBase } from "./products";

/** The cookie banner's settings (Admin Studio → Settings → Privacy & Cookies), cached for minutes. */
export async function getPrivacySettings(): Promise<PrivacySettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag("privacy");
  return (await fetchPrivacySettings(apiBase)) ?? DEFAULT_PRIVACY;
}
