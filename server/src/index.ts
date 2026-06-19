import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { auctionroom } from "./routes/auctionroom.js";
import { matchRoutes } from "./routes/match.js";

const app = new Hono();

// credentials:true is required for the sw_session cookie to be sent on
// cross-origin XHR (client at :3000, server at :8787). Origin MUST be a
// specific URL when credentials is on — wildcard "*" is forbidden by the
// browser in that mode. Override CORS_ORIGIN in production via .env.
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  })
);

app.route("/health", health);
app.route("/auctionroom", auctionroom);
app.route("/api/match", matchRoutes);

app.get("/", (c) => c.json({ name: "squadwars-server", ok: true }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`squadwars-server listening on http://localhost:${info.port}`);
});
