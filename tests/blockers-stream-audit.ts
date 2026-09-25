/**
 * ── Stream «blockers», B2–B15: each finding held by the smallest check that
 * would fail if the defect came back. Behavioural where the rule lives in a
 * shared module; source-level where it can only live inside a route.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const server = read("server.ts");
const route = (signature: string) => {
  const at = server.indexOf(signature);
  if (at < 0) return "";
  const next = server.indexOf("\napp.", at + signature.length);
  return server.slice(at, next < 0 ? undefined : next);
};

/* B2 — department balance says whose «all» it is, and counts real halls. */
{
  const balance = route('app.get("/api/reports/department-balance"');
  check(balance.includes("scopeLabel: balanceScopeLabel(req)"), "B2 الميزان يعيد scopeLabel بحسب نطاق القارئ");
  check(/function balanceScopeLabel[\s\S]*?"الجامعة"[\s\S]*?"الكلية"[\s\S]*?"النطاق"/.test(server), "B2 الجامعة/الكلية/النطاق");
  check(balance.includes("verifiedRooms: verifiedRooms.size") && balance.includes("rooms: rooms.size")
    && balance.includes("isInvalidLocationToken(canonical.AdRoomHall)") && balance.includes("roomIdentityKey(canonical)"),
    "B2 القاعات كلها (بعد طيّ الأسماء القديمة وبلا الفراغ و«---») وبجانبها الموثّقة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
