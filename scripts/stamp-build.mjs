// Writes the build stamp every build. One identity, three carriers: the client
// bundle, the server bundle, and the service worker — so "which version is
// this?" always has one answer.
import { writeFileSync, mkdirSync } from "fs";
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8);
mkdirSync("src/generated", { recursive: true });
writeFileSync("src/generated/buildStamp.ts",
  `/** Generated each build by scripts/stamp-build.mjs — do not edit. */\nexport const BUILD_STAMP = ${JSON.stringify(stamp)};\n`);
console.log("build stamp:", stamp);
