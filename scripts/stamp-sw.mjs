// Bakes the build stamp into the built service worker. Identical sw.js bytes
// between releases meant the browser never saw an update, so already-open tabs
// never learned a new version existed.
import { readFileSync, writeFileSync } from "fs";
const stamp = /BUILD_STAMP = "([^"]+)"/.exec(readFileSync("src/generated/buildStamp.ts", "utf8"))?.[1];
if (!stamp) throw new Error("no build stamp — run stamp-build first");
const path = "dist/sw.js";
const src = readFileSync(path, "utf8").replace(/__BUILD__/g, stamp);
if (!src.includes(stamp)) throw new Error("sw.js has no __BUILD__ placeholder");
writeFileSync(path, src);
console.log("sw stamped:", stamp);
