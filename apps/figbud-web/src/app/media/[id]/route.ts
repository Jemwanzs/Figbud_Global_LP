import { mediaRoute } from "@figbud/site-kit/server";

import { apiBase } from "@/lib/products";

/** Media library images used on published corporate pages, served from this site's own origin. */
export const GET = mediaRoute(apiBase);
