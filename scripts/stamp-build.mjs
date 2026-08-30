// Writes the build stamp every build. One identity, three carriers: the client
// bundle, the server bundle, and the service worker — so "which version is
// this?" always has one answer.
//
// With --ensure the file is only created when it is missing, and an existing
// stamp is left alone. Typechecking imports this module, but it is a build
// artifact that does not survive every checkout: CI failed on a tree where the
// file had never been generated, before the build that would have written it.
// A typecheck must not depend on a build having already run.
import { writeFileSync, mkdirSync, existsSync } from "fs";

const ensureOnly = process.argv.includes("--ensure");
const target = "src/generated/buildStamp.ts";

if (ensureOnly && existsSync(target)) {
  console.log("build stamp: موجود مسبقًا، لم يُلمس.");
} else {
  const stamp = ensureOnly
    ? "00000000000000-devenv"
    : new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 8);
  mkdirSync("src/generated", { recursive: true });
  writeFileSync(target,
    `/** Generated each build by scripts/stamp-build.mjs — do not edit. */\nexport const BUILD_STAMP = ${JSON.stringify(stamp)};\n`);
  console.log("build stamp:", stamp);
}
