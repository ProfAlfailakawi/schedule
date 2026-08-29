// Writes the build stamp every build. One identity, three carriers: the client
// bundle, the server bundle, and the service worker — so "which version is
// this?" always has one answer.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
let stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8);

// Make generation deterministic during CI to avoid timestamp-only churn.
if (process.env.CI) {
  if (existsSync("src/generated/buildStamp.ts")) {
    const existing = readFileSync("src/generated/buildStamp.ts", "utf8");
    const match = /BUILD_STAMP = "([^"]+)"/.exec(existing);
    if (match) {
      stamp = match[1];
    }
  }
}

mkdirSync("src/generated", { recursive: true });
writeFileSync("src/generated/buildStamp.ts",
  `/** Generated each build by scripts/stamp-build.mjs — do not edit. */\nexport const BUILD_STAMP = ${JSON.stringify(stamp)};\n`);
console.log("build stamp:", stamp);
