import { readFileSync } from "node:fs";

const pdfRoutes = [
  "api/cv/discover",
  "api/analyze",
  "api/candidates/analyze",
  "api/candidates/intake-cv",
];

for (const route of pdfRoutes) {
  const trace = JSON.parse(readFileSync(`.next/server/app/${route}/route.js.nft.json`, "utf8"));
  const files = trace.files.map((file) => file.replaceAll("\\", "/"));
  if (!files.some((file) => file.endsWith("/pdfjs-dist/legacy/build/pdf.worker.mjs"))) {
    throw new Error(`${route}: PDF.js worker is missing from the serverless trace`);
  }
  if (!files.some((file) => file.endsWith("/@napi-rs/canvas/index.js"))) {
    throw new Error(`${route}: native canvas loader is missing from the serverless trace`);
  }
  if (!files.some((file) => /\/@napi-rs\/canvas-[^/]+\/[^/]+\.node$/.test(file))) {
    throw new Error(`${route}: native canvas binary is missing from the serverless trace`);
  }
}

console.log("PDF serverless traces include the worker and native canvas runtime assets.");
