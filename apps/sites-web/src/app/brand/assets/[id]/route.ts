import { brandAssetRoute } from "@figbud/site-kit/server";

import { apiBase } from "@/lib/sites";

/** Published logo files, served from this app's own origin. */
export const GET = brandAssetRoute(apiBase);
