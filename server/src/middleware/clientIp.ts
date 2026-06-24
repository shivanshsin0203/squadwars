/**
 * Client-IP extraction, most-trusted header first.
 *
 * Behind Cloudflare we trust cf-connecting-ip; behind any standard proxy we fall
 * back to the first hop of X-Forwarded-For, then X-Real-IP. On local `wrangler
 * dev` these are usually absent and we collapse to "local-dev".
 */

import type { Context } from "hono";

export function getClientIp(c: Context): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp;
  return "local-dev";
}
