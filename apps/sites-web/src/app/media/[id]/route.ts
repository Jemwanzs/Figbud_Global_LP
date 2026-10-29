import { mediaRoute } from "@figbud/site-kit/server";

import { apiBase } from "@/lib/sites";

/** Media library images used on published pages, served from this app's own origin. */
export const GET = mediaRoute(apiBase);
