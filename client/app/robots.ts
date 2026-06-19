import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://squadwars.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/setup"],
        // Per-match auction rooms are private session URLs. The dev sandbox
        // is intentionally not part of the public product.
        disallow: ["/auctionroom/", "/squad-builder", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
