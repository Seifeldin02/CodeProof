import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Catch the missing native dependency/worker that only surfaced on Vercel.
// Inspect production traces without executing uploaded PDFs or repository code.
const routes = ["api/analyze", "api/cv/discover", "api/candidates/analyze", "api/candidates/intake"];
for (const route of routes) {
  const tracePath = path.resolve(".next/server/app", route, "route.js.nft.json");
  const trace = JSON.parse(readFileSync(tracePath, "utf8"));
  assert(Array.isArray(trace.files), `Missing files in PDF runtime trace: ${route}`);
  const files = trace.files.map((file) => file.replaceAll("\\", "/"));
  for (const [label, pattern] of [
    ["canvas loader", /\/node_modules\/@napi-rs\/canvas\/index\.js$/],
    ["native canvas binary", /\/node_modules\/@napi-rs\/canvas-[^/]+\/[^/]+\.node$/],
    ["PDF worker", /\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs$/],
  ]) {
    const file = files.find((entry) => pattern.test(entry));
    assert(file && existsSync(path.resolve(path.dirname(tracePath), file)), `Missing ${label} in PDF runtime trace: ${route}`);
  }
}
console.log(`PDF runtime traces verified for ${routes.length} upload routes.`);
