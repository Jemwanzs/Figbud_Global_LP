import { brandAssetRoute } from "@figbud/site-kit/server";

import { apiBase } from "@/lib/products";

/** Published logo files, served from this website's own origin. */
export const GET = brandAssetRoute(apiBase);
