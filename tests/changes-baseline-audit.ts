/**
 * ── أساسُ «ما تحرّك»: من أين تبدأ المقارنة ──────────────────────────────
 * كلُّ حالةٍ هنا وقعت أو كادت: جدولٌ مقبولٌ لم يُمسّ كان يُعرض «كلُّه مضاف»،
 * وتعديلاتٌ متتابعةٌ في جولةٍ واحدة كان يُخشى أن يظهر آخرُها وحده.
 */
import { chooseCaptureBaseline } from "../src/utils/changesBaseline";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const accepted = [{ number: 1, reviewedVersionId: "v-submit", acceptedAt: "2026-09-10T10:00:00Z" }];

check(chooseCaptureBaseline(accepted, 1, []).kind === "reviewed",
  "جدولٌ قبله التسجيل ولم يُعدَّل بعده: «لم يتغيّر شيء»، لا «كلُّه مضاف»");
check(chooseCaptureBaseline(accepted, 1, [{ id: "v-submit", createdAt: "2026-09-11T00:00:00Z" }]).kind === "reviewed",
  "ونسخةُ الجولة نفسُها لا تصير أساساً فتُقارن الجولةُ بنفسها");
const successive = [
  { id: "c3", createdAt: "2026-09-12T09:00:00Z" },
  { id: "c2", createdAt: "2026-09-11T09:00:00Z" },
  { id: "c1", createdAt: "2026-09-10T12:00:00Z" },
  { id: "c0", createdAt: "2026-09-09T12:00:00Z" },
];
const pick = chooseCaptureBaseline(accepted, 1, successive);
check(pick.kind === "capture" && pick.versionId === "c1",
  "ثلاثةُ تعديلاتٍ متتابعة: الأساسُ ما قبل أوّلها، فتظهر كلُّها لا آخرُها وحده");
check(pick.kind === "capture" && pick.versionId !== "c0",
  "ولقطةٌ من قبل نظرة التسجيل لا تُتخذ أساساً");
const returned = [
  { number: 1, reviewedVersionId: "v1", returnedAt: "2026-09-10T10:00:00Z" },
  { number: 2, reviewedVersionId: "v2" },
];
const second = chooseCaptureBaseline(returned, 2, [{ id: "v2", createdAt: "2026-09-12T00:00:00Z" }, { id: "c5", createdAt: "2026-09-11T00:00:00Z" }]);
check(second.kind === "capture" && second.versionId === "c5",
  "الجولةُ الثانية تُقارَن بما بعد إرجاع الأولى، لا بإرسالها هي");
check(chooseCaptureBaseline([{ number: 1, reviewedVersionId: "v1" }], 1, []).kind === "none",
  "ولم ينظر التسجيلُ قطّ ولا لقطة: أولُ مراجعةٍ حقاً");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
