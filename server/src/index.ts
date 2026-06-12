import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health.js";
import { auctionroom } from "./routes/auctionroom.js";
import { matchRoutes } from "./routes/match.js";

const app = new Hono();

app.use("*", cors({ origin: "http://localhost:3000" }));

app.route("/health", health);
app.route("/auctionroom", auctionroom);
app.route("/api/match", matchRoutes);

app.get("/", (c) => c.json({ name: "squadwars-server", ok: true }));

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`squadwars-server listening on http://localhost:${info.port}`);
});
