import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./api.js";
import { seed } from "./seed.js";
import { db } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../client/dist");
const PORT = process.env.PORT || 3000;

seed();

const app = express();
app.disable("x-powered-by");
app.use(compression({ filter: (req, res) => (req.path === "/api/stream" ? false : compression.filter(req, res)) }));
app.use(express.json({ limit: "4mb" }));
app.use((req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  next();
});

app.use("/api", api);

if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (req, res) => res.send("API is running. Build the web app with: npm run build"));
}

// Free hosting plans sleep when idle. Reload demo data every 24 hours so the
// demo always starts clean.
setInterval(() => seed(), 24 * 60 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`StripLoop prototype running on http://localhost:${PORT} (events in ledger: ${db.events.length})`);
});
